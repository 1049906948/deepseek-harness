/**
 * Web 开发循环：在一个终端中完成首次构建，通过 `dsh web` 提供服务，
 * 并在源码变动时持续重建所有浏览器端产物。
 *
 * 各阶段依次为：`pnpm run build:artifacts`（可用 `--skip-build` 跳过）、
 * 三个持续运行的监听器，最后是 `dsh web`（可用 `--no-serve` 跳过）。
 * 需要这些监听器，是因为应用壳链接的是构建后的 lib 产物，而非源码：
 * `tsc -b tsconfig.client.json --watch` 输出 `lib/types`（tsdown 的 lib 入口
 * 使用该输出，而非 `src`），tsdown watch 打包 `lib/index.js` 和 `lib/client.js`，
 * `vite build --watch` 则重写由 `dsh web` 提供的 `apps/web/dist`。
 * 缺少监听器不会报错，页面会继续使用旧产物，使源码修改看起来没有生效；
 * 因此，任一阶段自行退出时，整个循环都会以退出码 1 结束。
 *
 * 重载通知由 Host 的 Web 服务负责：它轮询所提供 bundle 的文件状态，
 * 并广播 `rebuilt` 帧。因此，任何进程重写 `lib/client.js` 都会触发重载。
 *
 * 严禁与 `pnpm run build` 或 `build:artifacts` 同时运行：它们会写入同一组
 * `lib/` 和 `apps/web/dist/` 目录。本脚本会先完成构建阶段，再启动监听器。
 *
 * 用法：`pnpm run dev:web [--skip-build] [--no-serve] [--poll[=ms]] [dsh web 参数]`。
 * `--skip-build` 要求此前已通过 `build` 或 `build:artifacts` 生成产物目录：
 * 各监听器都基于上一阶段的输出增量工作，不会自行创建缺失的产物目录。
 * `--no-serve` 只保留监听器，供在其他位置启动的 `dsh web` 使用。
 * `--poll` 将源码监听切换为轮询（默认 500ms）：网络挂载（weka）不产生
 * inotify 事件，原生监听只能完成首次构建，无法感知后续源码变动。
 * tsc 也必须使用轮询，否则它不会重新输出 `lib/types`，
 * 后续两个阶段就会一直使用旧输入。
 *
 * 关闭时，Ctrl+C 通过终端进程组到达所有阶段，本脚本只需等待它们退出，
 * 并对仍未退出的进程逐级升级终止信号；SIGTERM 只发送给本进程，需转发一次。
 * 收到 SIGINT 后退出码为 130，收到 SIGTERM 后为 0，任一阶段自行退出时为 1。
 *
 * 本脚本保留各包的 tsdown.config.ts，通过 API 内联配置补充 `watch`：
 * tsdown workspace 模式以内联配置补充各包配置文件中未指定的字段，
 * 而各包配置都未定义 `watch`。
 */
import { globSync, readFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execa } from 'execa'
import { build } from 'tsdown'
import type { TsdownBundle } from 'tsdown'
import {
  CLIENT_BUILD_PROFILE_SELECTOR,
  clientBuildProcessEnvironment,
  repositoryClientBuildEnvironment,
} from './client-build-environment.ts'
import { pnpmInvocation } from './pnpm-invocation.ts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

/** 输出 Client 编译面产物，为监听集合中的所有 tsdown lib 入口提供输入。 */
const CLIENT_TYPE_PROGRAM = 'tsconfig.client.json'

/** 应用壳所属的 workspace 包，其 dist 由 `dsh web` 提供。 */
const SHELL_PACKAGE = '@deepseek-ai/dsh-web-frontend'

/**
 * 测试基础设施使用 client 构建预设，但不进入应用壳的模块图，
 * 因此不属于开发循环需要重建的产物。
 */
const TEST_INFRASTRUCTURE_PREFIX = 'packages/test-support/'

/**
 * 一次性采集本地公开构建环境，供所有持续运行的监听阶段共用。
 * @param root - 提供版本和 Git 元数据的仓库根目录。
 * @param environment - 监听器的启动环境，提供额外的公开环境变量。
 * @returns tsdown 与启动的监听阶段共用的进程环境。
 */
export function devWebBuildEnvironment(
  root: string,
  environment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return clientBuildProcessEnvironment(environment, repositoryClientBuildEnvironment(root, environment))
}

/** 解析后的 `dev-web` 命令行：脚本自身选项，以及转发给 `dsh web` 的参数。 */
export interface DevWebArguments {
  /** 跳过默认在监听器启动前执行的 `pnpm run build:artifacts`。 */
  readonly skipBuild: boolean
  /** 是否启动 `dsh web`；为 false 时只保留重建监听器，配合已运行的服务使用。 */
  readonly serve: boolean
  /** 源码监听器的轮询间隔，单位为毫秒；undefined 表示使用原生监听。 */
  readonly pollInterval: number | undefined
  /** 按原顺序原样转发给 `dsh web` 的参数。 */
  readonly appArgs: readonly string[]
}

/** 仅传入 `--poll`、未指定数值时使用的轮询间隔。 */
const DEFAULT_POLL_INTERVAL = 500

/**
 * 解析脚本命令行。`--skip-build`、`--no-serve` 和 `--poll[=ms]` 由本脚本处理；
 * 独立的 `--` 被丢弃，其余参数全部转发给 `dsh web`。
 * @param argv - 脚本路径之后的命令行参数。
 * @returns 解析后的选项与待转发参数。
 * @throws Error 当 `--poll` 的间隔不是正整数，或指定 `--no-serve` 后仍有
 * 需要转发给 `dsh web` 进程的参数时抛出。
 */
export function parseDevWebArguments(argv: readonly string[]): DevWebArguments {
  let skipBuild = false
  let serve = true
  let pollInterval: number | undefined
  const appArgs: string[] = []
  for (const arg of argv) {
    // `pnpm run` 会原样转发 `--` 分隔符，本脚本无需处理该分隔符的语义。
    if (arg === '--') continue
    if (arg === '--skip-build') skipBuild = true
    else if (arg === '--no-serve') serve = false
    else if (arg === '--poll' || arg.startsWith('--poll=')) {
      pollInterval = arg === '--poll' ? DEFAULT_POLL_INTERVAL : Number(arg.slice('--poll='.length))
      if (!Number.isInteger(pollInterval) || pollInterval <= 0) throw new Error(`dev-web: invalid --poll interval "${arg}"`)
    } else appArgs.push(arg)
  }
  if (!serve && appArgs.length > 0) {
    throw new Error(`dev-web: --no-serve leaves no dsh web process for ${appArgs[0] ?? ''}`)
  }
  return { skipBuild, serve, pollInterval, appArgs }
}

/**
 * 根据声明发现需要监听的 workspace 包：packages/<group>/<name> 下，
 * package.json 声明 `dsh.client` 且 platform 为 "web" 的包会输出客户端插件 bundle。
 * 仅在启动时扫描一次，监听期间新增包需要重启本脚本。
 * @param root - 包含分组包目录的仓库根目录。
 * @returns 相对于 workspace 根目录的插件包目录。
 */
export function discoverPluginDirs(root = repoRoot): string[] {
  const dirs: string[] = []
  for (const manifestPath of globSync('packages/*/*/package.json', { cwd: root }).sort()) {
    const manifest = JSON.parse(readFileSync(join(root, manifestPath), 'utf8')) as {
      dsh?: { client?: { platform?: unknown } }
    }
    if (manifest.dsh?.client?.platform === 'web') dirs.push(dirname(manifestPath).split(sep).join('/'))
  }
  return dirs
}

/**
 * 发现静态链接的库包，与 {@link discoverPluginDirs} 发现的插件包对应。
 * 使用 client 构建预设但未声明 `dsh.client` 的包，没有由 Loader 交付的浏览器入口，
 * 应用壳会直接链接其 `lib/index.js`；源码变动只有在该 bundle 重写后才能到达浏览器。
 * 根据构建预设推导包集合，可以在依赖声明调整位置时保持正确，无需手工维护名单。
 * 不能仅根据 `dependencies` 推导，因为客户端包将构建输入声明为 devDependencies。
 * @param root - 包含分组包目录的仓库根目录。
 * @returns 相对于 workspace 根目录的库包目录。
 */
export function discoverLibraryDirs(root = repoRoot): string[] {
  const dirs: string[] = []
  for (const configPath of globSync('packages/*/*/tsdown.config.ts', { cwd: root }).sort()) {
    const dir = dirname(configPath).split(sep).join('/')
    if (dir.startsWith(TEST_INFRASTRUCTURE_PREFIX)) continue
    if (!readFileSync(join(root, configPath), 'utf8').includes('tsdown.client.ts')) continue
    const manifest = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8')) as {
      dsh?: { client?: unknown }
    }
    if (manifest.dsh?.client === undefined) dirs.push(dir)
  }
  return dirs
}

/**
 * 启动 `pnpm run dev:web` 使用的 tsdown 监听构建。
 * @param root - 传给 tsdown 的仓库或测试夹具根目录。
 * @param pluginDirs - 相对于 workspace 根目录、需要监听的包目录。
 * @param pollInterval - 可选的源码监听轮询间隔，单位为毫秒。
 * @returns 所有监听器完成首次构建和包自身的构建后钩子后，返回仍在运行的 bundle。
 */
export async function watchClientPlugins(
  root: string,
  pluginDirs: readonly string[],
  pollInterval?: number,
): Promise<TsdownBundle[]> {
  let resolveInitialBuilds: (() => void) | undefined
  const initialBuilds = new Promise<void>((resolve) => { resolveInitialBuilds = resolve })
  const initialized = new WeakSet<object>()
  const readiness: { expectedBuilds?: number; initializedBuilds: number } = { initializedBuilds: 0 }
  const bundles = await build({
    cwd: root,
    workspace: [...pluginDirs],
    configLoader: 'native',
    watch: true,
    // Workspace 钩子会覆盖内联钩子；onSuccess 在各包的 build:done 工作完成后执行。
    onSuccess: (options) => {
      if (initialized.has(options)) return
      initialized.add(options)
      readiness.initializedBuilds += 1
      if (
        readiness.expectedBuilds !== undefined
        && readiness.initializedBuilds >= readiness.expectedBuilds
      ) resolveInitialBuilds?.()
    },
    ...pollInterval !== undefined
      ? { inputOptions: { watch: { watcher: { usePolling: true, pollInterval } } } }
      : {},
  })
  readiness.expectedBuilds = bundles.length
  if (readiness.initializedBuilds >= readiness.expectedBuilds) resolveInitialBuilds?.()
  await initialBuilds
  return bundles
}

/** 管理器所观察到的单个持续运行阶段进程。 */
export interface StageHandle {
  /** 诊断信息中使用的命令名称。 */
  readonly name: string
  /** 阶段退出后，Promise 完成并返回退出码；若由信号终止，则返回 null。 */
  readonly exited: Promise<number | null>
  /**
   * 发送一次信号；阶段已退出时不执行任何操作。
   * @param signal - 要发送的信号。
   */
  kill(signal: NodeJS.Signals): void
}

/** 停止请求向各阶段传递的方式。 */
export interface StageStop {
  /** 首先发送给各存活阶段的信号；终端已向它们发送 SIGINT 时省略。 */
  readonly signal?: NodeJS.Signals | undefined
  /** 升级到 SIGTERM 前及之后升级到 SIGKILL 前，分别等待退出的毫秒数。 */
  readonly graceMs: number
}

/**
 * 管理存活阶段：报告停止请求前自行退出的阶段；收到停止请求后发送信号、
 * 等待并逐级升级终止信号，直到所有阶段退出。
 */
export class StageSupervisor {
  private readonly live = new Set<StageHandle>()
  private stopping = false

  /**
   * @param onStale - 阶段在收到停止请求前退出时，以阶段名称和退出码调用的回调。
   */
  constructor(private readonly onStale: (stage: string, code: number | null) => void) {}

  /**
   * 跟踪一个已启动的阶段，直到它退出。
   * @param stage - 要管理的阶段。
   */
  add(stage: StageHandle): void {
    this.live.add(stage)
    void stage.exited.then((code) => {
      this.live.delete(stage)
      if (!this.stopping) this.onStale(stage.name, code)
    })
  }

  /**
   * 停止所有存活阶段，并在它们全部退出后完成。
   * @param stop - 初始信号，以及每次升级终止信号之间的等待时间。
   */
  async stop(stop: StageStop): Promise<void> {
    this.stopping = true
    const escalation: (NodeJS.Signals | undefined)[] = [stop.signal]
    if (stop.signal !== 'SIGTERM') escalation.push('SIGTERM')
    for (const signal of escalation) {
      if (this.live.size === 0) return
      if (signal !== undefined) for (const stage of this.live) stage.kill(signal)
      await this.settled(stop.graceMs)
    }
    for (const stage of this.live) stage.kill('SIGKILL')
    await Promise.all([...this.live].map(stage => stage.exited))
  }

  private async settled(graceMs: number): Promise<void> {
    let timer: NodeJS.Timeout | undefined
    await Promise.race([
      Promise.all([...this.live].map(stage => stage.exited)),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, graceMs) }),
    ])
    clearTimeout(timer)
  }
}

/**
 * 每次升级终止信号前的等待时间。`dsh web` 在收到首个信号后，
 * 给插件树五秒钟进行清理；提前升级信号会打断有序清理并强制退出。
 */
const STOP_GRACE_MS = 6_000

/**
 * 启动一个继承标准输入、输出和错误流的持续运行阶段，并交给管理器。
 * @param supervisor - 报告意外退出、并在关闭时停止该阶段的管理器。
 * @param name - 诊断信息中使用的命令名称。
 * @param command - 可执行文件；设置 `local` 时从 workspace 的可执行文件目录解析。
 * @param args - 命令参数。
 * @param local - 是否从 workspace 已安装的可执行文件目录解析 `command`。
 */
function spawnStage(
  supervisor: StageSupervisor,
  name: string,
  command: string,
  args: readonly string[],
  local: boolean,
): void {
  const child = execa(command, [...args], {
    cwd: repoRoot,
    stdio: 'inherit',
    preferLocal: local,
    reject: false,
  })
  supervisor.add({
    name,
    exited: child.then(result => result.exitCode ?? null),
    kill(signal) { child.kill(signal) },
  })
}

/**
 * 构建全部仓库产物，不执行测试与脚本的聚合类型检查，且不修改启动环境：
 * `scripts/build.ts` 会自行采集客户端公开构建值。
 * @returns 构建退出码；若由信号终止，则为 null。
 */
async function runBuild(): Promise<number | null> {
  const invocation = pnpmInvocation(['run', 'build:artifacts'])
  const result = await execa(invocation.command, invocation.args, { cwd: repoRoot, stdio: 'inherit', reject: false })
  return result.exitCode ?? null
}

const invokedPath = process.argv[1]
const isMain = invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href
if (isMain) {
  let options: DevWebArguments
  try {
    options = parseDevWebArguments(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    console.error('dev-web: usage: pnpm run dev:web [--skip-build] [--no-serve] [--poll[=ms]] [dsh web arguments]')
    process.exit(1)
  }

  // 终端信号或阶段自行退出只会触发一次关闭请求；SIGINT 不设置 `signal`，
  // 因为终端进程组已经将它发送给所有阶段。
  const shutdown = Promise.withResolvers<number>()
  const requested: { code?: number; signal?: NodeJS.Signals } = {}
  const shutdownRequested = (): boolean => requested.code !== undefined
  const requestShutdown = (code: number, signal: NodeJS.Signals | undefined): void => {
    if (shutdownRequested()) return
    requested.code = code
    if (signal !== undefined) requested.signal = signal
    shutdown.resolve(code)
  }
  const supervisor = new StageSupervisor((stage, code) => {
    console.error(`dev-web: ${stage} exited (code ${String(code)}); stopping the other stages`)
    requestShutdown(1, 'SIGTERM')
  })
  // 使用持续监听器而非 `once`：tsdown 监听器内置的 signal-exit
  // 在发现没有其他监听器时会重新触发信号，导致本进程在下方清理尚未完成时终止。
  process.on('SIGINT', () => { requestShutdown(130, undefined) })
  process.on('SIGTERM', () => { requestShutdown(0, 'SIGTERM') })

  const buildExit = options.skipBuild ? 0 : await runBuild()
  if (shutdownRequested()) process.exit(await shutdown.promise)
  if (buildExit !== 0) {
    console.error(`dev-web: pnpm run build:artifacts exited (code ${String(buildExit)})`)
    process.exit(1)
  }

  const buildEnvironment = devWebBuildEnvironment(repoRoot, process.env)
  for (const name of Object.keys(process.env)) {
    if (name === CLIENT_BUILD_PROFILE_SELECTOR || name.startsWith('DSH_CLIENT_')) {
      Reflect.deleteProperty(process.env, name)
    }
  }
  for (const [name, value] of Object.entries(buildEnvironment)) {
    if (name.startsWith('DSH_CLIENT_') && value !== undefined) process.env[name] = value
  }

  const pluginDirs = discoverPluginDirs()
  const libraryDirs = discoverLibraryDirs()
  if (pluginDirs.length === 0) {
    console.error('dev-web: no dsh.client (platform "web") packages found under packages/')
    process.exit(1)
  }
  if (libraryDirs.length === 0) {
    console.error('dev-web: no client-preset library packages found under packages/ — the compile shell links their lib products, so an empty set means the discovery predicate is stale')
    process.exit(1)
  }

  // tsc 没有设置轮询间隔的命令行选项，因此 `--poll` 只选择其固定间隔监听模式。
  // 缺少这一步转换时，tsc 会在不产生 inotify 事件的网络挂载上使用原生监听，
  // 不再重新输出 lib/types，后续两个阶段就会持续基于旧输入重建，且没有任何提示。
  spawnStage(supervisor, `tsc -b ${CLIENT_TYPE_PROGRAM} --watch`, 'tsc', [
    '-b', CLIENT_TYPE_PROGRAM, '--watch', '--preserveWatchOutput',
    ...options.pollInterval !== undefined
      ? ['--watchFile', 'fixedPollingInterval', '--watchDirectory', 'fixedPollingInterval']
      : [],
  ], true)

  // 等待 tsdown 首次构建完成后再启动 dist 监听器，确保 Vite 首次构建读取最新
  // lib bundle。后续 lib 重写由 Vite 自身的监听覆盖，因为这些文件已在其模块图中。
  const bundles = await watchClientPlugins(repoRoot, [...pluginDirs, ...libraryDirs], options.pollInterval)
  if (!shutdownRequested()) {
    // 通过应用壳自身的 `watch` 脚本启动：Vite 不是仓库根目录的依赖，
    // 更重要的是 Vite 以工作目录为 root，`resolve.dedupe` 从该目录解析 React。
    // 在 apps/web 之外运行 Vite，会悄然改变 bundle 使用的 React 副本。
    spawnStage(supervisor, 'vite build --watch', 'pnpm', ['--filter', SHELL_PACKAGE, 'run', 'watch'], false)
    // 使用与根目录 `dsh` 脚本相同的启动方式，使 Host 像 `pnpm dsh web` 一样从源码运行。
    if (options.serve) {
      spawnStage(supervisor, 'dsh web', process.execPath, [
        '--import', 'tsx/esm', 'apps/cli/src/bin.ts', 'web', ...options.appArgs,
      ], false)
    }
    console.log(
      `dev-web: watching ${String(pluginDirs.length)} dsh.client plugin packages`
      + ` and ${String(libraryDirs.length)} statically linked library packages`
      + (options.pollInterval !== undefined ? ` (polling ${String(options.pollInterval)}ms)` : '')
      + `, plus tsc -b ${CLIENT_TYPE_PROGRAM} and the ${SHELL_PACKAGE} dist build`
      + (options.serve ? ', serving through dsh web' : '')
      + ':\n  '
      + [...pluginDirs, ...libraryDirs].join('\n  '),
    )
  }

  const exitCode = await shutdown.promise
  await supervisor.stop({ signal: requested.signal, graceMs: STOP_GRACE_MS })
  for (const bundle of bundles) await bundle[Symbol.asyncDispose]()
  process.exit(exitCode)
}
