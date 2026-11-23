---
description: "DeepSeek Harness packages/ 的中文架构索引，按能力组解释 382 个包的职责、运行链路、拆包方式和代码定位入口。"
---

# packages/ 包职责分析

## 概述

`packages/` 不是一个单体库，而是一组由 Cordis Loader 按 profile 组合的 npm workspace 包。当前共有 58 个顶层目录，其中 53 个目录包含功能包，共 382 个 `@deepseek-ai/dsh-*` 包；`code-runtime`、`e2b`、`examples`、`hooks` 和 `runtime-diagnostics` 目前是目录或预留位置，不属于实际包组。

这些包通常按 **Service Definition、Provider、Consumer** 三个角色拆分：Definition 声明 `ctx` 服务和事件，Provider 提供本地、远端或第三方实现，Consumer 把能力接到 Agent 工具、Host Remote 或 Web UI。包之间的共享实例关系见 [`docs/module-graph.md`](../docs/module-graph.md)；完整的包组索引见 [`packages/README.md`](../packages/README.md)。

## 目录

- [运行时分层](#运行时分层)
- [启动和请求链路](#启动和请求链路)
- [53 个功能组](#53-个功能组)
- [核心与能力包](#核心与能力包)
- [Session 与状态包](#session-与状态包)
- [远程、应用与测试包](#远程应用与测试包)
- [大型包组索引](#大型包组索引)
- [阅读和定位方法](#阅读和定位方法)
- [延伸阅读](#延伸阅读)
- [维护备注](#维护备注)

-----

## 运行时分层

从依赖方向看，`packages/` 可以分为六层。层次表示常见职责和依赖方向，不表示每个包只能依赖相邻一层。

```text
util / typert
    ↓
core + llm
    ↓
fs / shell / subprocess / sandbox / terminal / web / lsp / skill / subagent ...
    ↓
tools / session / workflow / jobs / schedule / goal
    ↓
api / sdk / acp / host / client
    ↓
bundle / profile
```

| 层 | 主要目录 | 作用 |
|---|---|---|
| 基础库和类型 | `util/`、`typert/` | 提供无状态工具、品牌类型、错误、路径、时间、Remote 类型生成和运行时注册。 |
| Agent 主干 | `core/`、`llm/` | 定义 Agent、Session、提示词、工具管线、Agent Loop 和模型适配器。 |
| 可替换能力 | `fs/`、`shell/`、`subprocess/`、`sandbox/`、`terminal/`、`web/`、`lsp/`、`skill/`、`subagent/` 等 | 把文件、进程、网络、语言服务和委派能力做成可替换服务。 |
| 状态和工具 | `session/`、`session-query/`、`storage/`、`workspace/`、`jobs/`、`workflow/` 等 | 持久化模型可见事实，并提供模型可调用的业务能力。 |
| 应用和传输 | `api/`、`sdk/`、`acp/`、`host/`、`client/` | 把同一套 Agent/Session 能力提供给 Web、Desktop、SDK 和自动化客户端。 |
| 组合和扩展 | `boot/`、`bundle/`、`preset/`、`extensions/`、`experimental/` | 组装 profile、管理插件、提供可选能力和运行时自修改。 |

扩展插件应依赖 Service Definition，而不是依赖某个具体 Provider。这样可以把本地执行切换到 SSH，把 JSONL Session 切换到其他持久化后端，或把一个模型 Provider 替换成另一个 Provider，而不改 Consumer。

-----

## 启动和请求链路

支持的 Node 应用通过 `dsh --profile <name>` 启动。`app-boot` 解析 profile，并按顺序叠加 bundle、profile patch、Harness home patch 和 `--patch` overlay，最后由 Cordis Loader 挂载插件。

常用 profile 的职责如下：

- `base`：为 Web、headless、SDK 和 ACP 提供共同的模型、Session、工具、持久化、沙箱、凭据、设置和遥测能力。
- `web-app`：追加 Host WebServer、API Controller、静态页面和浏览器 Client 插件。
- `headless`：追加一次性 Agent/Session 运行器，不启动 Web Host。
- `sdk-app`：追加 stdin/stdout JSON-RPC 服务端。
- `acp-app`：追加自动化 ACP 服务端。
- `sdk-minimal`：独立维护一棵精简的 SDK 插件树，不继承 `base`。

一次 Agent turn 大致经过以下步骤：

```text
Session 日志
 → AgentLoop 领取输入
 → 组装 system prompt 和工具 schema
 → LLM provider prepare / stream
 → 写入 request、assistant 等持久化事件
 → tools/pre-execute → tools/execute → tools/post-execute
 → 写入 tool result
 → retry、compaction 或下一步
```

模型可见的输入必须能从 Session 日志恢复。实时 UI 事件和持久化 Session 事件是两条不同的通道：前者用于增量显示，后者用于恢复、重放、查询和遥测。

-----

## 53 个功能组

下表是按 `packages/<group>/` 统计的功能组。括号内是该组当前包含的包数量；具体子包在后续章节和各组 README 中说明。

| 功能组 | 数量 | 作用 |
|---|---:|---|
| [`core`](../packages/core/README.md) | 10 | Agent、Session、提示词、工具注册和默认 Agent Loop。 |
| [`api`](../packages/api/README.md) | 9 | Typert Remote Gateway、业务 Controller 和 Host 到 Client 的 BFF。 |
| [`typert`](../packages/typert/README.md) | 4 | TypeScript 类型图分析、Remote 产物生成、加载和运行时注册。 |
| [`goal`](../packages/goal/README.md) | 4 | 同一 Session 内的目标状态、目标回合和目标工具。 |
| [`schedule`](../packages/schedule/README.md) | 2 | Host 级持久化提醒和定时任务工具。 |
| [`feedback`](../packages/feedback/README.md) | 2 | 消息评分、Session 反馈和反馈命令。 |
| [`telemetry`](../packages/telemetry/README.md) | 1 | Cordis OpenTelemetry 事件通道。 |
| [`identity`](../packages/identity/README.md) | 1 | 匿名用户身份。 |
| [`llm`](../packages/llm/README.md) | 9 | LLM 接口、DeepSeek/pi-ai 适配器、认证、重试和 token 计量。 |
| [`subprocess`](../packages/subprocess/README.md) | 3 | 进程组、输出限制和本地/Windows 进程实现。 |
| [`ssh`](../packages/ssh/README.md) | 5 | POSIX SSH 连接及远端文件、进程和沙箱 Provider。 |
| [`shell`](../packages/shell/README.md) | 10 | Bash/PowerShell 执行器、沙箱实现、持久化 Shell 工具。 |
| [`terminal`](../packages/terminal/README.md) | 2 | 持久 PTY 接口和 Bash PTY 后端。 |
| [`ptc-runtime`](../packages/ptc-runtime/README.md) | 2 | PTC 执行接口和沙箱 Node 实现。 |
| [`computer-use`](../packages/computer-use/README.md) | 1 | 独占桌面操作 Provider 注册。 |
| [`browser-use`](../packages/browser-use/README.md) | 1 | 独占浏览器操作 Provider 注册。 |
| [`sandbox`](../packages/sandbox/README.md) | 4 | 进程约束接口、本地后端、策略和 Windows ACL 后端。 |
| [`deliverables`](../packages/deliverables/README.md) | 3 | 文件交付声明、文件引用和工作区变更记录。 |
| [`fs`](../packages/fs/README.md) | 8 | 文件系统接口、本地/沙箱实现、观察策略和文件工具。 |
| [`lsp`](../packages/lsp/README.md) | 3 | LSP 接口、stdio Provider 和 LSP 工具。 |
| [`skill`](../packages/skill/README.md) | 5 | Skill 注册、文件系统/Office Provider 和 Skill 工具。 |
| [`compaction`](../packages/compaction/README.md) | 5 | 上下文压缩接口、摘要、图片卸载、工具结果裁剪和命令。 |
| [`context`](../packages/context/README.md) | 7 | AGENTS 指令、文件/Session 引用、时间和工作环境上下文。 |
| [`subagent`](../packages/subagent/README.md) | 9 | 子 Agent 接口、进程内分叉、外部 Agent Provider 和委派工具。 |
| [`team`](../packages/team/README.md) | 2 | Agent Team 任务 DAG 和团队工具。 |
| [`jobs`](../packages/jobs/README.md) | 3 | 后台作业接口、本地实现和作业控制工具。 |
| [`experimental`](../packages/experimental/README.md) | 65 | 仍在评估中的浏览器、Computer Use、LiveShare、Forge、语音等能力。 |
| [`workflow`](../packages/workflow/README.md) | 3 | 工作流接口、PTC 执行器和工作流工具。 |
| [`web`](../packages/web/README.md) | 5 | Web 搜索/抓取接口、DeepSeek/HTTP Provider 和 Web 工具。 |
| [`document`](../packages/document/README.md) | 2 | Office 渲染、转换、重算和 Office 工具。 |
| [`attachment`](../packages/attachment/README.md) | 2 | 附件接口和内容寻址的本地存储。 |
| [`spill`](../packages/spill/README.md) | 3 | 大工具结果的溢出存储、文件实现和保留策略。 |
| [`todo`](../packages/todo/README.md) | 1 | `todo_write` 模型工具。 |
| [`plan`](../packages/plan/README.md) | 1 | 可记录、可审核退出的 Plan 模式。 |
| [`preset`](../packages/preset/README.md) | 3 | Agent 能力组合、预设注册和 persona。 |
| [`guard`](../packages/guard/README.md) | 2 | 重复工具调用提示和工具 deadline。 |
| [`bundle`](../packages/bundle/README.md) | 6 | 可安装的 profile patch 层。 |
| [`extensions`](../packages/extensions/README.md) | 4 | 动态插件定义、Host/Client 运行器和 Cordis 检查工具。 |
| [`mcp`](../packages/mcp/README.md) | 3 | MCP Client、MCP server 管理和资源读取。 |
| [`session`](../packages/session/README.md) | 22 | Session 持久化、格式迁移、投影、标题、统计和遥测。 |
| [`session-query`](../packages/session-query/README.md) | 3 | Session 查询、SQLite FTS5 和日志导出。 |
| [`settings`](../packages/settings/README.md) | 1 | 用户设置接口。 |
| [`credentials`](../packages/credentials/README.md) | 4 | 凭据引用、`.env` Provider、授权和 DeepSeek 账号。 |
| [`storage`](../packages/storage/README.md) | 4 | 非 Session 存储中心、JSON/SQLite 后端和数据域。 |
| [`workspace`](../packages/workspace/README.md) | 1 | Workspace 实体注册和 Session 绑定。 |
| [`sdk`](../packages/sdk/README.md) | 3 | JSON-RPC wire protocol、SDK server 和 TypeScript client。 |
| [`acp`](../packages/acp/README.md) | 1 | 自动化 ACP JSON-RPC stdio server。 |
| [`interaction`](../packages/interaction/README.md) | 5 | 人类命令、审批、权限预设、用户问题和 ask-user 工具。 |
| [`boot`](../packages/boot/README.md) | 6 | 应用启动、参数传递、配置编辑、HMR 和插件市场管理。 |
| [`host`](../packages/host/README.md) | 11 | Web Host、认证、目录选择、静态页面、应用打开和产品遥测。 |
| [`client`](../packages/client/README.md) | 74 | 浏览器通信、模块加载、状态、Slots、Conversation 和 UI 插件。 |
| [`test-support`](../packages/test-support/README.md) | 8 | Agent、Client、LLM、Remote、Session 和工具测试设施。 |
| [`util`](../packages/util/README.md) | 24 | 低级原语、路径、时间、错误、搜索、保留和官方清单。 |

-----

## 核心与能力包

本节展开最常被修改的运行时包。每个包名对应 `packages/<group>/<package>/`；包的配置、导出和测试约定以包自己的 README 为准。

### `core/`

| 包 | 作用 |
|---|---|
| `scope` | 提供按 Agent 隔离的注册和事件路由原语。 |
| `session` | 保存 Agent 可恢复的追加式 Session 事件日志。 |
| `system-prompt` | 按顺序组装系统提示词、工具 schema 和动态变量。 |
| `tools` | 注册工具，并执行受保护的 pre/execute/post 流水线。 |
| `agent-tool-presentation` | 旧版工具呈现选择器，已由 native/PTC executor 取代。 |
| `agent` | 定义 Agent 公共接口、注册表、作用域和 Agent 事件。 |
| `agent-default-model` | 为没有显式模型选择的 Agent 提供部署默认值。 |
| `agent-loop` | 创建 Agent，驱动 turn/step、请求、流式回答和工具循环。 |
| `tool-executor-native` | 执行原生工具调用。 |
| `tool-executor-ptc` | 在 PTC 模式下提供工具绑定、SDK prompt 和程序执行。 |

### `llm/`

`llm` 是模型能力的抽象层。`llm-deepseek` 和 `llm-pi-ai` 是 Provider；认证包决定凭据来源；`llm-retry`、`token-meter` 和 API extensions 是横切能力。

| 包 | 作用 |
|---|---|
| `llm` | Provider 无关的消息、请求和流式响应接口。 |
| `llm-deepseek` | DeepSeek Messages API 适配器。 |
| `llm-pi-ai` | 基于 pi-ai 的 DeepSeek 适配器。 |
| `llm-deepseek-api-key` | API key 凭据 Provider 和模型发现。 |
| `llm-deepseek-account` | DeepSeek 账号凭据 Provider 和模型发现。 |
| `llm-retry` | 按 Provider 路由模型请求重试。 |
| `deepseek-llm-api-extensions` | 为官方 DeepSeek 适配器注册额外请求字段。 |
| `plugin-package-inventory-deepseek` | 提供官方请求所需的 Loader 插件清单。 |
| `token-meter` | 对真实请求和 replay 请求进行 token 计量。 |

### 执行、文件和网络能力

这些组共同形成模型执行环境：`subprocess` 管理进程，`sandbox` 约束进程，`shell` 运行命令，`terminal` 保持 PTY，`fs` 管理文件，`web` 和 `lsp` 提供外部信息与代码导航。

| 组 | 包及职责 |
|---|---|
| `subprocess` | `subprocess` 定义受管理的进程组和输出；`subprocess-local` 实现本地进程；`win32-process` 提供 Windows 底层进程和 Job Object。 |
| `sandbox` | `sandbox` 定义约束接口；`sandbox-local` 支持 bwrap、Landlock、Seatbelt；`sandbox-policy` 解析调用策略；`sandbox-windows-acl` 提供 Windows ACL 后端。 |
| `shell` | `shell` 定义执行器；`bash-local`/`pwsh-local` 为本地实现；`bash-sandbox`/`pwsh-sandbox` 为沙箱实现；`shell-env` 管理环境变量；四个 `tool-*` 包提供 Bash/PowerShell 一次性和持久化工具。 |
| `terminal` | `terminal` 定义按所有者隔离的 PTY；`terminal-bash` 提供 Bash PTY 后端。 |
| `fs` | `fs` 定义文本读写和原子修改；`fs-local`、`fs-sandbox` 提供本地实现；`fs-patch` 解析补丁；`fs-observation-policy` 强制读前写和版本保护；三个 `tool-*` 包提供文件读写、搜索和替换编辑。 |
| `web` | `web` 定义搜索/抓取服务；`web-search-deepseek`、`web-deepseek-api` 和 `web-fetch-http` 提供 Provider；`tool-web` 提供模型工具。 |
| `lsp` | `lsp` 定义语言服务请求；`lsp-stdio` 启动 stdio LSP；`tool-lsp` 提供定义、引用、实现和 hover 查询。 |
| `ssh` | `ssh` 和 `ssh-helper-runtime` 管理远端连接和 helper；`fs-ssh`、`subprocess-ssh`、`sandbox-ssh` 把同一执行世界映射到远端。 |

### 其他模型能力

| 组 | 包及职责 |
|---|---|
| `skill` | `skill` 定义 Skill Provider 注册表；`skill-filesystem` 从本地加载；`skill-office` 提供 Office 指南；`tool-skill` 负责模型加载；`tool-workspace-dependencies` 暴露内置依赖。 |
| `mcp` | `mcp-client` 把 MCP server 工具接入 `ctx.tools`；`mcp-manager` 按设置管理 server；`mcp-resources` 读取 MCP 资源。 |
| `ptc-runtime` | `ptc-runtime` 定义程序化工具执行；`ptc-runtime-node` 提供 Node async function、REPL、scoped REPL 和 VM Script。 |
| `document` | `office-kit` 负责 Office 渲染、转换和重算；`tool-office` 暴露这些操作。 |
| `workflow` | `workflow` 定义工作流运行和事件；`workflow-ptc` 在 PTC 中编排；`tool-workflow` 允许模型运行工作流脚本。 |
| `subagent` | `subagent` 定义委派接口；`spawn-in-process` 创建新 Agent；`fork-in-process` 从日志前缀分叉；`acp`、`dsh-sdk`、`codex`、`claude-code` 提供外部后端；两个 `tool-*` 包提供委派、消息、发现和中断工具。 |
| `team` | `agent-team` 管理子 Agent 任务 DAG；`tool-agent-team` 提供团队工具。 |

-----

## Session 与状态包

Session 日志是模型历史和恢复的来源。`session-persistence` 负责持久化接口，`session-persistence-jsonl` 负责物理文件，格式迁移保持已发布版本不变，投影服务把日志折叠成业务状态；`session-query` 面向搜索和导出，`storage` 面向非 Session 数据。

### `session/` 的 22 个包

| 子域 | 包 |
|---|---|
| 持久化和格式 | `session-persistence`（持久化接口）、`session-persistence-jsonl`（JSONL 后端）、`session-format`（相邻版本迁移机制）、`session-format-catalog`（格式目录）、`session-format-v0-to-v1`、`session-format-v1-to-v2`、`session-format-v2-to-v3`、`session-format-v3-to-v4`（逐代迁移）。 |
| 投影和工作目录 | `session-projection`（投影注册表）、`session-projection-cache`（投影缓存）、`session-stats`（对话统计）、`session-turn-outline`（回合提纲）、`working-directory`（持久化工作目录）、`tool-working-directory`（工作目录工具）。 |
| 标题和请求 | `session-title`（标题服务）、`session-title-llm`（标题生成策略）、`session-title-first-prompt-llm`（首条提示词标题）、`session-log-deepseek`（DeepSeek 请求扩展日志）。 |
| 遥测和恢复 | `session-telemetry`（日志遥测接口）、`session-telemetry-otel`（OTLP 上报）、`session-checkpoint-policy`（模型请求和工具副作用前的检查点）。 |
| 呈现辅助 | `message-quotes`（选中文本引用和 Markdown blockquote）。 |

### `session-query/`、`storage/` 和状态实体

- `session-query` 定义逻辑 Session corpus、过滤、trace 和有界读取；`session-query-sqlite` 使用 SQLite FTS5；`session-log-export` 导出 ZIP 或 Markdown。
- `storage` 注册非 Session 后端；`storage-domain` 提供 schema 校验和事件通知；`storage-json` 和 `storage-sqlite` 分别提供 JSON 文件与 SQLite 后端。
- `workspace` 保存 Workspace 实体和 Session 关联；`settings` 定义用户设置服务；`attachment`/`attachment-local` 保存不可变附件；`spill`/`spill-local`/`spill-policy` 处理过大的工具输出。

### 状态、计划和调度

- `goal`：`goal` 保存同一 Session 的目标状态，`goal-round-driver` 推进目标回合，`command-goal` 和 `tool-goal` 分别服务人类命令和模型调用。
- `jobs`：`jobs` 定义后台任务，`jobs-local` 实现本地注册，`tool-jobs` 提供输出、列表和终止操作。
- `schedule`：`schedule` 保存 Host 级提醒并投递到 Session，`tool-schedule` 提供管理工具。
- `plan-mode`：记录 Agent 的计划状态和用户审核后的退出。
- `tool-todo`：将 todo 写入事件溯源 Session 日志。
- `compaction`：`compaction` 定义压缩接口，`compaction-basic` 做摘要压缩，`compaction-tool-result-pruner` 裁剪工具结果，`compaction-image-offload` 卸载超预算图片，`command-compact` 提供手动命令。

-----

## 远程、应用与测试包

### `api/`、`sdk/`、`acp/` 和 `typert/`

- `typert/protocol` 定义 Remote 元数据和 Provider 协议；`typert/generator` 分析 TypeScript 工程并生成产物；`typert/loader` 接入 Loader；`typert/registry` 保存运行时反射和 schema。
- `api/gateway` 分派 Remote 请求；`api/remotes` 组装应用选定的 Remote；`api/remote-access` 控制 Peer 权限；`api/session-controller`、`workspace-controller`、`settings-controller`、`terminal-controller`、`job-controller` 分别管理对应业务；`api/workspace-files` 提供文件读取和目录列表。
- `sdk/protocol` 定义 newline-delimited JSON-RPC；`sdk/server` 提供运行时服务；`sdk/client` 提供 TypeScript 调用端。
- `acp/acp` 提供自动化 Agent Client Protocol stdio 服务。

### `boot/`、`bundle/` 和 `preset/`

- `boot/app-boot` 是应用启动入口；`cmdline` 传递不可变启动参数；`config-editor` 写回 profile patch；`hmr` 协调配置和模块热更新；`plugin-manager` 管理当前 profile 插件；`plugin-market` 读取插件市场索引。
- `bundle/base` 是共用基础层；`bundle/web-app`、`headless`、`sdk-app`、`acp-app` 分别叠加 Web、一次性、SDK 和 ACP 运行面；`sdk-minimal` 是独立精简组合。
- `preset/agent-preset` 声明能力组合；`agent-preset-registry` 注册和编辑 preset；`persona` 提供部署 persona。

### `host/` 和 `client/`

`host/` 运行在 Node 或 Electron Host：`webserver` 注册 HTTP/upgrade 路由，`frontend-static` 服务 SPA，`authentication-token` 和 `authentication-desktop` 负责认证，三个 `directory-picker-*` 包处理目录选择，`open-in-app` 启动宿主应用，`plugin-inventory` 暴露 Loader 清单，`product-telemetry-otel` 上报产品事件。

`client/` 运行在浏览器。基础包是 `web`、`modules`、`connection`、`file-upload`、`hmr`、`locale`、`resources`、`script-realm`、`script-realm-iframe`、`shortcuts`、`store` 和 `product-analytics`。UI 包按功能分为：

- **渲染和布局**：`ui-renderer`、`ui-slots`、`ui-primitives`、`ui-layout`、`ui-dockkit`、`ui-theme`、`ui-brand-official`。
- **会话和导航**：`ui-session`、`ui-session-status`、`ui-conversation`、`ui-chat`、`ui-sidebar`、`ui-sidebar-right`、`ui-workspace`、`ui-subagent`、`ui-agent-team`。
- **工具和输入**：`ui-tool`、`ui-trajectory`、`ui-workflow-run`、`ui-input-trigger`、`ui-commands`、`ui-context-menu`、`ui-reference`、`ui-skill`、`ui-user-questions`、`ui-approval`。
- **文件和预览**：`ui-sidebar-files`、`ui-sidebar-documentpreview`、`ui-sidebar-browser`、`ui-sidebar-terminal`、`ui-directory-picker-browse`、`ui-directory-picker-native`、`ui-open-in-app`、`ui-attachment`、`ui-file-actions`、`ui-file-drag`、`ui-deliverables`。
- **会话功能**：`ui-goal`、`ui-plan`、`ui-jobs`、`ui-schedule`、`ui-model-selection`、`ui-permission-presets`、`ui-message-feedback`、`ui-secret-mask`、`ui-account-notifications`。
- **设置和插件**：`ui-settings`、`ui-settings-account`、`ui-settings-general`、`ui-settings-models`、`ui-settings-agent-loop`、`ui-settings-shell`、`ui-settings-subagent`、`ui-settings-web-search`、`ui-settings-session-log`、`ui-settings-plugins`、`ui-settings-plugin-inventory`、`ui-plugin-manager`、`ui-plugin-market`、`ui-agent-preset`、`ui-entry-customization`。
- **快捷键和附加界面**：`ui-shortcuts`、`ui-sidebar-*`、`ui-settings-*` 等包负责独立页面或侧栏，不直接拥有 Host 业务状态，而是消费 Remote 和 Client store。

### 其他应用包的精确目录名

下面这些包在上文按能力合并说明；这里保留完整目录名，方便从搜索结果直接跳转：

| 组 | 包目录 | 作用 |
|---|---|---|
| `api` | `gateway`、`remote-access`、`remotes`、`session-controller`、`workspace-files` | Remote 分发、访问控制、BFF 组装、Session 控制和工作区文件服务；`job-controller`、`settings-controller`、`terminal-controller`、`workspace-controller` 已在上文列出。 |
| `context` | `agent-instructions` | 加载工作区的 `AGENTS.md`/`CLAUDE.md` 指令；其余 Context 包已在上文列出。 |
| `extensions` | `cordis-client-runner`、`cordis-host-runner`、`tool-cordis`、`ui-cordis` | 分别负责动态插件的浏览器运行器、Host 运行器、运行时检查工具和 UI 卡片。 |
| `feedback` | `command-feedback`、`message-feedback` | 分别提供 Session 反馈命令/Remote 和消息评分、备注事件。 |
| `fs` | `tool-fs`、`tool-fs-search`、`tool-str-replace-editor` | 分别提供读写编辑、glob/grep 搜索和文本替换编辑工具。 |
| `guard` | `repeat-tool-reminder`、`timeout-policy` | 分别提示重复工具调用和限制单次工具执行时间。 |
| `host` | `directory-picker`、`directory-picker-auto`、`directory-picker-browse`、`directory-picker-native` | 定义目录选择接口，并选择应用内浏览或操作系统原生选择器。 |
| `identity` | `anonymous-user-id` | 生成并复用匿名用户标识。 |
| `interaction` | `commands` | 提供插件拥有的人类命令注册表；审批、权限、用户问题包已在上文列出。 |
| `preset` | `agent-preset` | 从 Cordis YAML 声明 Agent 能力组合；注册表和 persona 包已在上文列出。 |
| `sdk` | `protocol`、`server` | 分别定义 JSON-RPC wire 类型和运行时服务端；`client` 是 TypeScript 调用端。 |
| `shell` | `tool-bash`、`tool-bash-persistent`、`tool-pwsh`、`tool-pwsh-persistent` | 分别提供一次性/持久化 Bash 和 PowerShell 模型工具。 |
| `subagent` | `subagent-acp`、`subagent-claude-code`、`subagent-codex`、`subagent-dsh-sdk`、`subagent-fork-in-process`、`subagent-spawn-in-process`、`tool-subagent`、`tool-subagent-control` | 提供 ACP、Claude Code、Codex、DSH SDK、进程内分叉/创建 Provider，以及委派和控制工具。 |
| `telemetry` | `otel` | 注册普通事件和 Session 日志的 OTLP 通道。 |
| `typert` | `generator`、`loader`、`protocol`、`registry` | 分别负责类型分析生成、Loader 接入、Remote 协议和运行时反射注册。 |

### `test-support/`

`agent-loop-testkit` 提供生产 AgentLoop 驱动和 Inbox 替身；`client-runtime` 启动 jsdom 或完整 Client 测试环境；`llm-mock-server` 模拟 Messages HTTP/SSE 故障；`llm-replay` 从 Session JSONL 重放模型流；`loader-smoke` 运行真实 Loader 的无 key smoke；`remote-mock` 模拟 Typert Remote；`session-snapshot` 提供 Session 快照和 ACP 适配；`tool-testkit` 提供工具测试夹具。

-----

## 大型包组索引

### `experimental/` 的 65 个包

实验性包可以安装和组合，但不代表稳定的产品支持。按能力看，它们包括：

| 子域 | 包 |
|---|---|
| 动作卡片和推荐 | `action-cards`、`client-ui-action-cards`、`creation-recommendations`、`client-ui-creation-recommendations`、`personalized-recommendations`、`plugin-recommendations`、`client-ui-plugin-recommendations`、`plugin-market-bundle`。 |
| 浏览器和 Computer Use | `browser-use-playwright-mcp`、`browser-use-chrome-devtools-mcp`、`browser-use-stagehand-native`、`browser-use-runtime`、`cua`、`cua-bundle`、`cua-macos`、`cua-windows`、`cua-mcp`、`computer-use-cua-driver-mcp`、`computer-use-cua-driver-native`。 |
| Forge、Worktree 和 LiveShare | `forge`、`forge-github`、`forge-session`、`forge-bundle`、`client-ui-forge`、`worktree`、`tool-worktree`、`liveshare`、`liveshare-protocol`。 |
| Hook 和动态修改 | `hook-protocol`、`hooks-claude-code`、`hooks-codex`、`claude-code-mods`、`client-ui-claude-code-mods`。 |
| Session 查询和检查 | `session-search`、`tool-session-query`、`session-inspector`、`inspector`、`inspector-profile`、`client-ui-stats`、`session-titles-bundle`、`session-title-all-prompts-llm`、`deepseek-chat-import`。 |
| 外部 Agent 和重复任务 | `subagent-oar`、`tool-subagent-oar`、`ralph-bundle`、`tool-ralph`。 |
| 终端、语音和翻译 | `terminal-bundle`、`tool-terminal`、`terminal-panel`、`speech-to-text`、`speech-to-text-sensevoice`、`api-speech-to-text`、`voice-input-bundle`、`client-ui-voice-input`、`translator`、`cot-translation-bundle`、`client-ui-cot-translation`。 |
| Webhook、时间线和其他运行时 | `webhook`、`webhook-github`、`timeline`、`auto-review`、`badge-skill`、`skill-badge`、`badge-skill-bundle`、`webworker-packer`、`webworker-runtime`。 |

这些包之间仍然遵循同一拆分方式。例如浏览器 MCP 包是 Provider，`browser-use-runtime` 管理 Session 级资源，相关 `tool-*` 或 UI 包才是 Consumer。

### `util/` 的 24 个包

`atomic-write`（原子写）、`brand`（品牌类型）、`chunked-list`（分块追加列表）、`code-language`（代码语言映射）、`crypto`（UUID/字节编码）、`deque`（双端队列）、`error`（结构化错误）、`file-drag`（文件拖拽协议）、`home-paths`（DSH_HOME 路径）、`http-proxy`（HTTP 代理）、`launch-environment`（启动环境）、`lazy-require`（延迟加载）、`native-command`（宿主命令）、`official-bundles`（官方 Bundle 清单）、`output-retention`（输出保留）、`package-manifest`（包元数据类型）、`plugin-detail`（插件详情）、`plugin-market-index`（市场索引）、`ripgrep`（ripgrep 解析和流式调用）、`text-search`（多语言模糊搜索）、`time`（时间和重复规则）、`timeout`（deadline）、`values`（重复安装安全的值）、`workspace-path`（Workspace 路径）。这些包通常没有独立的 Cordis 服务，直接作为库被其他包消费。

### `interaction/`、`credentials/`、`context/` 和 `deliverables/`

- `interaction/commands` 管理用户命令；`permission-presets` 把沙箱和审批策略组合成产品权限；`user-approval` 定义 fail-closed 审批；`user-questions` 定义向人提问；`tool-ask-user` 暴露模型工具。
- `credentials/credentials` 定义凭据引用；`credentials-local` 从 `.env` 提供值；`authorization` 管理需用户参与的授权；`deepseek-account` 管理 DeepSeek 登录和通知。
- `context/agent-instructions` 读取 AGENTS/CLAUDE 指令；`file-reference` 和 `file-reference-local` 处理 `@file`；`session-reference` 处理 `@session`；`time-context`、`tmux-context` 和 `harness-dev-context` 注入运行上下文。
- `deliverable-file-references` 规定模型如何引用交付物；`tool-present` 记录显式文件交付；`workspace-changes` 记录每个 turn 的工作区变化。

-----

## 阅读和定位方法

遇到具体需求时，先按下表定位，再打开包自己的 README 和 `src/index.ts`：

| 需求 | 起点 |
|---|---|
| 修改 Agent turn、模型历史或工具流水线 | `packages/core/`、`packages/session/` |
| 增加模型 Provider | `packages/llm/`，并阅读 [`adding-an-llm-adapter`](../docs/cookbook/adding-an-llm-adapter.md) |
| 增加模型工具 | 对应能力组的 `tool-*` 包，以及 [`adding-a-tool`](../docs/cookbook/adding-a-tool.md) |
| 修改文件、Shell、PTY 或沙箱 | `fs/`、`shell/`、`terminal/`、`subprocess/`、`sandbox/` |
| 修改 Session 存储、恢复或查询 | `session/`、`session-query/`、`storage/` |
| 修改 Web API | `api/`、`typert/`、`host/` |
| 修改浏览器界面 | `client/`，先看 `ui-renderer`、`ui-slots` 和 `ui-conversation` |
| 修改启动组合 | `boot/`、`bundle/`、`preset/` |
| 修改 SDK 或自动化协议 | `sdk/`、`acp/` |
| 修改测试基础设施 | `test-support/` |

包级精确职责以 `package.json` 的 `description` 和对应组 README 的 Packages 表为准。可用下面的命令快速查找某个包的声明和描述：

```sh
node -e "const p=require('./packages/fs/tool-fs/package.json'); console.log(p.name, p.description)"
```

分析共享实例依赖时阅读 [`docs/module-graph.md`](../docs/module-graph.md)，不要把它当成完整的 npm runtime dependency graph。修改 `packages/` 前先阅读 [`docs/architecture.md`](../docs/architecture.md) 和 [`docs/defensive-patterns/README.md`](../docs/defensive-patterns/README.md)。

## 延伸阅读

- [`packages/README.md`](../packages/README.md)：53 个功能组的官方地图。
- [`packages/core/README.md`](../packages/core/README.md)：Agent、Session、Prompt 和 Tools 主干。
- [`packages/session/README.md`](../packages/session/README.md)：Session 持久化、投影、标题和遥测。
- [`packages/client/README.md`](../packages/client/README.md)：Web Client 基础设施和 UI 插件。
- [`packages/bundle/README.md`](../packages/bundle/README.md)：profile bundle 和运行时组合。
- [`docs/architecture.md`](../docs/architecture.md)：profile、turn flow、Session log 和扩展点。

## 维护备注

<details>
<summary>非权威的临时维护记录</summary>

本文用于开发者快速定位。包名、数量和单包职责可能随 workspace 变化；发生包增删或职责变化时，应同时更新对应包 README、`packages/README.md` 和本文的索引。

</details>
