---
description: "详细说明 DeepSeek Harness 中 .agents、.claude、AGENTS.md 和 CLAUDE.md 的目录职责、技能调用、Agent Note 生命周期、符号链接关系与维护检查。"
---

# `.agents` 与 `.claude` 文件说明

## 概览

本文说明本仓库中为 agent 提供工作规则、可复用技能和设计记录的文件。用户所说的 `.agent` 在本仓库中对应 `.agents`；仓库根目录没有 `.agent` 目录。`.claude` 目前只有一个 `skills` 符号链接，它指向 `../.agents/skills`，因此两条路径访问的是同一套技能文件。

这些文件分成三类：`AGENTS.md` 与 `CLAUDE.md` 提供工作区指令，`.agents/skills/` 提供按任务调用的工作流，`.agents/notes/` 保存需要长期保留的设计决策和方案记录。它们共同约束 agent 如何理解代码、选择检查、记录理由和维护文档；它们不是产品运行时的插件配置。

## 目录

- [目录关系](#目录关系)
- [如何触发和读取](#如何触发和读取)
- [AGENTS.md 与 CLAUDE.md](#agentsmd-与-claudemd)
- [.agents/skills：可复用技能](#agentsskills可复用技能)
- [.agents/notes：设计记录](#agentsnotes设计记录)
- [.claude：Claude 入口](#claudeclaude-入口)
- [修改和新增文件](#修改和新增文件)
- [验证命令](#验证命令)
- [延伸阅读](#延伸阅读)
- [维护备注](#维护备注)

-----

## 目录关系

下图展示本仓库实际存在的文件关系。箭头表示符号链接，不表示内容复制。

```text
.
├── AGENTS.md                         根目录工作指令，真实文件
├── CLAUDE.md                         -> AGENTS.md
├── .agents/
│   ├── skills/                       可复用技能，真实内容在这里维护
│   │   ├── <skill>/SKILL.md
│   │   ├── <skill>/references/
│   │   ├── <skill>/templates/
│   │   └── <skill>/scripts/
│   └── notes/                        Agent Note 设计记录
│       ├── proposed/
│       ├── implemented/
│       ├── rejected/
│       └── archived/                  已封存、只读历史
├── .claude/
│   └── skills/                        -> ../.agents/skills
└── packages/
    └── CLAUDE.md                     -> AGENTS.md
```

另外，`.agents/notes/implemented/CLAUDE.md` 指向同目录的 `AGENTS.md`。该文件只约束已实现 Agent Note 的维护方式；它不是新的设计记录，也不应单独编辑。

`.claude` 当前没有独立的 `settings`、`commands`、`agents` 或 `hooks` 文件。不能根据目录名称推断本仓库配置了这些功能；文档只记录当前检出中可以验证的文件。

## 如何触发和读取

先判断文件类型：技能按任务调用，工作区指令按适用目录加载，设计记录和辅助资料按需读取。发现一个技能通常只把名称和描述放入可用目录；真正选用它后，agent 才读取完整 `SKILL.md`。读取技能也不会自动执行其中的所有脚本。

| 文件 | 读取或调用时机 | 可以怎样提出要求 |
|---|---|---|
| `.agents/skills/<name>/SKILL.md` | 用户明确指定技能，或 agent 判断任务符合描述与调用策略时。 | “请使用 `dsh-doc-writing`，帮我写一篇项目启动指南。” |
| `.agents/notes/**/AGENTS.md` | 工作涉及该目录时，按客户端或 DSH 的指令加载机制读取。 | “修改已实现记录前，请先遵循 `.agents/notes/implemented/AGENTS.md`。” |
| `.agents/notes/{proposed,implemented,rejected}/...` | 任务需要设计背景、已有决定或否决理由时搜索并读取。 | “先查找 Session 投影相关的活跃 Agent Note，再解释当前设计。” |
| `.agents/notes/archived/...` | 明确需要历史背景时只读查阅，不作为当前行为依据。 | “请只读说明这条归档记录的历史理由，并用当前代码核对现状。” |
| 技能中的 `references/`、`templates/` | 技能正文要求、任务需要，或用户明确指定时按需读取。 | “请按照 `dsh-doc-writing` 的 package-library 模板写 README。” |
| 技能中的 `scripts/` | 技能流程需要执行该脚本且操作在任务授权范围内时。 | 先说明要完成的任务，再由 agent 按技能选择脚本。 |
| `*.i18n.yaml`、归档 `manifest.json`、`.gitignore` | 对应验证器或 Git 读取。 | 它们是数据和配置文件，没有独立的聊天触发命令。 |

### 在 Codex 对话中指定技能

在已经发现仓库技能的 Codex 会话中，可以直接发下面任意一种请求。技能名后面应写清楚要完成的任务；不必粘贴整个文件。

```text
请使用 dsh-doc-writing，在 ck-docs 写一篇项目启动指南。
请使用 dsh-ci-test-reliability，分析这个测试为何只在 CI 偶发失败。
请使用 dsh-code-review，审查我指定的 PR。
请先读取 .agents/skills/dsh-responsive-ui/SKILL.md，再调整这个页面的移动端布局。
```

Codex CLI 和 IDE 扩展还支持在输入中用 `$技能名` 明确提及技能，或用 `/skills` 选择技能，例如 `$dsh-doc-writing 帮我写项目启动指南`。普通任务也可能根据技能的 `description` 自动匹配；需要确定使用哪一个时，直接写出技能名。具体入口见 [OpenAI 官方技能说明](https://learn.chatgpt.com/docs/build-skills#how-chatgpt-and-codex-use-skills)。

### 在 DSH 应用中使用 `/name`

DSH 的确定性用户调用入口是直接用户消息中的 `/技能名`。前提是 profile 加载了技能注册表、本地文件提供方和 `dsh-tool-skill`，且该技能已被发现并允许用户调用。默认本地提供方扫描项目根目录的 `.agents/skills`；解析和调用规则分别由 [skill-filesystem](../packages/skill/skill-filesystem/README.zh.md#use-this-package) 和 [tool-skill](../packages/skill/tool-skill/README.zh.md#use-this-package) 维护。

```text
/dsh-doc-writing 帮我写一篇项目启动指南。
请使用 /dsh-ci-test-reliability 分析这个 CI 失败。
/dsh-translate-docs 翻译我指定的文档，并更新对应的一致性记录。
```

`/name` 可以出现在句首或句中，前后需要空白或消息边界。因此 `/dsh-doc-writing 帮我写文档` 可以识别，`/dsh-doc-writing帮我写文档` 和 `.agents/skills/dsh-doc-writing/SKILL.md` 都不是这个调用 token。未知名称或用户不可调用的名称保持为普通文本，不会产生技能注入。

DSH 模型也可以根据技能目录选择适用技能，再通过 `skill` 工具按精确名称加载正文；这是模型选择路径，不是用户斜杠指令路径。

### 调用限制和未触发时的检查

技能的触发需要同时符合客户端的调用策略和技能正文。DSH 读取 `SKILL.md` 的 `disable-model-invocation`、`user-invocable`；Codex 的 `agents/openai.yaml` 可通过 `policy.allow_implicit_invocation: false` 禁止隐式选择，保留显式调用。两种机制不能混作同一个字段。

`dsh-translate-docs` 要求用户明确调用；在 DSH 中，`disable-model-invocation: true` 使它不进入模型目录，需由用户输入 `/dsh-translate-docs`。`dsh-pr-description` 则声明 `user-invocable: false`，因此在 DSH 中不能用 `/dsh-pr-description` 确定性加载；创建或更新 PR 描述的任务仍可由模型选用它。

如果没有触发，先确认当前使用的是 Codex 还是 DSH，再确认工作目录属于这个仓库、技能名称正确、文件已经进入可用目录、frontmatter 有效，以及任务符合调用限制。DSH 在缺少必要插件、名称未知或用户调用被禁用时不会注入技能；Codex 的发现和刷新说明见同一份 [官方文档](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills)。

## `AGENTS.md` 与 `CLAUDE.md`

### 文件角色

`AGENTS.md` 是真实维护文件，承担某个目录范围内的工作指令。根文件规定仓库布局、应用启动约束、包边界、类型安全、Session 数据、文档、测试、错误处理和发布前检查等长期规则；更具体目录中的 `AGENTS.md` 只补充该子树的规则。

`CLAUDE.md` 在本仓库中是兼容入口。根目录、`packages/` 和 `.agents/notes/implemented/` 的 `CLAUDE.md` 都是指向同目录 `AGENTS.md` 的符号链接，内容不应作为另一份独立规则维护。修改这些位置时，编辑真实的 `AGENTS.md`，不要把符号链接替换成复制文件。

### 指令加载候选

`packages/context/agent-instructions/README.zh.md` 记录了 DSH 的指令加载行为。默认基础候选是 `AGENTS.md` 和 `CLAUDE.md`，本地叠加候选是 `AGENTS.local.md` 和 `CLAUDE.local.md`；项目指令按项目根目录到当前工作目录的顺序组成，越具体的目录优先级越高。

同一候选组内，去除首尾空白后内容相同的文件只渲染一次。因此当前检出中指向同一文件的 `AGENTS.md` 和 `CLAUDE.md` 不会让模型看到两份相同规则。文件加载、变更和移除的具体时机由 `dsh-agent-instructions` 包负责；本仓库的符号链接只表达共享内容，不单独证明任何外部客户端的自动发现行为。

指令文件是模型工作上下文的一部分，内容应写成短而稳定的行为规则，并链接到详细文档。产品行为、包 API、配置字段和完整设计理由应由源码、包 README、`docs/` 或 Agent Note 承担，不能把根 `AGENTS.md` 写成项目百科全书。

## `.agents/skills`：可复用技能

### 技能如何组织

每个技能目录至少包含一个带 YAML frontmatter 的 `SKILL.md`。frontmatter 提供技能名和触发描述，正文提供适用范围、工作步骤、输出要求和禁止事项；正文规则比名称或描述更具体。技能可以引用 `references/`、`templates/` 或 `scripts/`，这些文件分别承担参考标准、文档骨架和可执行辅助逻辑。

当前目录包含 22 个 `SKILL.md`。技能正文是工作规范，不等于独立 CLI；只有明确列出的脚本或仓库命令才是可执行入口。

### 技能清单

| 技能 | 作用和主要限制 |
|---|---|
| [`agent-experience`](../.agents/skills/agent-experience/SKILL.md) | 设计模型可见工具、参数说明、系统提示和多步工作流；工具设计规则由 `packages/preset/agent-preset/skills/dsh-doc/references/tool-design.md` 维护。 |
| [`cordis-styling-nitpicking`](../.agents/skills/cordis-styling-nitpicking/SKILL.md) | 审查 Cordis 插件生命周期；只报告有证据的进程级单例、未逆转副作用和消费者完成前释放依赖等 P0 问题。 |
| [`dsh-archive-agent-notes`](../.agents/skills/dsh-archive-agent-notes/SKILL.md) | 新增、审查、归档、恢复或删除 Agent Note；必须维护英文、中文和 sidecar 三联，归档后遵守冻结规则。 |
| [`dsh-ci-test-reliability`](../.agents/skills/dsh-ci-test-reliability/SKILL.md) | 处理并发、端口、进程全局状态、临时目录、时钟、超时和异步清理造成的 CI 不稳定；要求明确资源分配、就绪信号和静默完成。 |
| [`dsh-client-ui-ux`](../.agents/skills/dsh-client-ui-ux/SKILL.md) | 设计和审查用户界面布局、间距、图标、颜色、几何和交互；必须检查受影响页面和状态的实际结果。 |
| [`dsh-code-review`](../.agents/skills/dsh-code-review/SKILL.md) | 审查 Pull Request 的范围、生命周期、错误处理、测试、UI、文档和 Agent Note；先确认真实 base、head 和变更范围。 |
| [`dsh-create-upgrade-guide`](../.agents/skills/dsh-create-upgrade-guide/SKILL.md) | 外部可见的 CLI、profile、配置、持久化、SDK、协议或包入口发生破坏性变化时创建升级指南，并维护双语配对。 |
| [`dsh-cua-macos-signing`](../.agents/skills/dsh-cua-macos-signing/SKILL.md) | macOS 从源码使用 Computer Use 时管理固定的个人开发签名身份；密钥应位于 DSH home 之外，安装版用户不需要这套设置。 |
| [`dsh-doc-writing`](../.agents/skills/dsh-doc-writing/SKILL.md) | 规范文档层级、`kind` 元数据、教程与参考文档、双语配对、事实核验、预算和 website 投影；文档中的操作命令必须实际验证。 |
| [`dsh-error-handling`](../.agents/skills/dsh-error-handling/SKILL.md) | 设计结构化错误、稳定 `name/code`、错误归属、工具失败、恢复和用户报告；预期工具失败必须保留可路由的错误身份。 |
| [`dsh-find-simplifications`](../.agents/skills/dsh-find-simplifications/SKILL.md) | 通过生产可达性、维护成本、能力损失和保留理由寻找可证明的代码、API、配置、测试或文档简化。 |
| [`dsh-merging-stacked-prs`](../.agents/skills/dsh-merging-stacked-prs/SKILL.md) | 合并依赖 PR 堆栈；要求使用 GitHub 官方 stacked-PR 能力，并确认成员、顺序和依赖关系后再落地。 |
| [`dsh-official-plugin-artwork`](../.agents/skills/dsh-official-plugin-artwork/SKILL.md) | 绘制和审查官方插件图标及 feature preview；需复用官方资产和调色板，检查实际页面，并在落地前取得设计审批。 |
| [`dsh-pr-description`](../.agents/skills/dsh-pr-description/SKILL.md) | 创建或更新 PR 描述；维护 `Motivation`、`Changes`、`Testing` 和 `AI Usage`，并按规定记录 AI 参与阶段。 |
| [`dsh-pre-push-checks`](../.agents/skills/dsh-pre-push-checks/SKILL.md) | 按出站 diff 选择最小且充分的检查；文档、Agent Note 和目录变更通常使用 `pnpm run doc-sync`，不因惯例重复完整套件。 |
| [`dsh-prose-standard`](../.agents/skills/dsh-prose-standard/SKILL.md) | 审查 Markdown、JSDoc、注释、提示词、诊断和界面文案；保留行为、失败、时序、所有权和模态，删除推理过程与代码复述。 |
| [`dsh-responsive-ui`](../.agents/skills/dsh-responsive-ui/SKILL.md) | 处理响应式宽度、390px 最小视口、换行截断、图标按钮、移动端 hover、tooltip、焦点和键盘行为。 |
| [`dsh-session-projection`](../.agents/skills/dsh-session-projection/SKILL.md) | 设计或审查 Session Projection 的状态归属、恢复、版本、checkpoint、缓存和生命周期；`init/apply` 必须同步确定。 |
| [`dsh-speed-up-perf`](../.agents/skills/dsh-speed-up-perf/SKILL.md) | 调查和优化性能；要求真实用户路径、冷暖启动区分、负向控制和功能证据，不能用放宽阈值掩盖回归。 |
| [`dsh-translate-docs`](../.agents/skills/dsh-translate-docs/SKILL.md) | 仅在用户明确调用技能名时执行扩展双语流程；普通文档修改遵循轻量配对规则，更新后必须重写 sidecar。 |
| [`dsh-trim-cot-leakage`](../.agents/skills/dsh-trim-cot-leakage/SKILL.md) | 清理决策编号、PR 或 stack 视角、变更叙事、评审对话、控制流复述和规划残留；保留可验证的当前事实。 |
| [`record-browser-gif`](../.agents/skills/record-browser-gif/SKILL.md) | 录制真实 Web/UI 流程 GIF 并确定性编码；用户可见 GUI 变更的 PR 需要按技能规则提供 GIF，超过 5 MiB 时拆分。 |

### 参考资料、模板和脚本

技能的辅助文件按职责分组，不要把它们误认为独立技能。`dsh-doc-writing/references/` 提供元数据与双语配对、层级结构、样式、审查和 website 同步规则；`dsh-doc-writing/templates/` 提供 `package-group`、`package-reference`、`package-library`、`package-bundle`、`persistence-change`、`persistence-format`、`persistence-release` 和 `upgrade-guide` 八种文档骨架。

`dsh-client-ui-ux/references/` 解释对齐、间距和图标；`dsh-ci-test-reliability/references/ci-flake-diagnosis.md` 说明 flaky CI 诊断；`dsh-error-handling/references/error-codes.md` 说明错误类和稳定错误码；`dsh-find-simplifications/references/historical-patterns.md` 提供简化案例；`dsh-prose-standard/references/examples.md` 提供完整命题和边界案例；`dsh-trim-cot-leakage/references/` 提供泄漏识别案例与检索探针。

`dsh-cua-macos-signing/scripts/` 提供签名身份管理、端到端检查和测试；`record-browser-gif/scripts/encode_gif.py` 负责视频或截图序列的 GIF 编码，旁边的测试验证时序和拒绝条件。这些脚本是辅助工具，技能正文仍然决定何时使用它们。

`.agents/skills/.gitignore` 只忽略每个技能目录下的 `agents/openai.yaml`。它不代表整个 `agents/` 目录、`SKILL.md` 或参考文件都被忽略。仓库脚本 `verify-skill-invocation-metadata` 会检查存在这份元数据的技能是否在 Claude Code 和 Codex 之间保持手动调用策略一致。

## `.agents/notes`：设计记录

### 两条路径轴

活跃 Agent Note 使用 `{lifecycle}/{class}/yyyy-mm-dd-topic-title.md` 路径。日期表示主题首次提出的时间，不是最后更新时间；文件名和目录共同表达记录的状态和类别。

| 生命周期 | 含义 |
|---|---|
| `proposed/` | 尚未完成或仅部分完成的方案，不能据此断言产品已经具备该行为。 |
| `implemented/` | 已交付的决策及其理由；路径、符号、默认值和机制必须跟随当前代码维护。 |
| `rejected/` | 已考虑但否决的方案；只在仍能防止实际误判时保留。 |
| `archived/` | 已实现决策的冻结历史，供理解来由使用，不能作为当前行为依据。 |

活跃记录的类别是封闭集合：`feature` 表示用户或模型可见能力，`bug-fix` 表示缺陷修复，`simplification` 表示删除行为或维护面，`architecture` 表示交付源代码的结构决策，`process` 表示围绕代码的工具和流程，`testing` 表示测试基础设施与策略。

### 三联文件

一个双语 Agent Note 由 `.md`、`.zh.md` 和 `.i18n.yaml` 三个同名文件组成。`.md` 和 `.zh.md` 是等权正文，`.i18n.yaml` 保存每个标题段落的已确认一致性哈希；新增、修改、移动和删除时必须一起处理。中文正文保留机器检查所需的 `# Agent Note:` 和 `Status:` 等英文头部标记。

所有活跃记录的正文都从 `## Problem` 开始，并记录真实的 `## Alternatives considered`；格式规范允许符合条件的早期记录使用指定的缺失说明，不能凭空补造备选方案。`proposed/` 还需要 `Proposal`、`Acceptance criteria` 和 `Risks`；`implemented/` 使用现在时的 `Decision` 和 `Consequences`，不能继续保留 `Proposal`、`Plan`、`Migration plan` 或 `Acceptance criteria` 等提案章节。

### 代表记录

下面的记录用于快速了解六种类别的写法；它们不是完整索引。

| 类别 | 示例 | 说明 |
|---|---|---|
| `architecture` | [`2026-06-13-capability-seams.zh.md`](../.agents/notes/implemented/architecture/2026-06-13-capability-seams.zh.md) | 说明 Service Definition、Service Provider 和 Consumer 的职责，以及何时拆成独立包。 |
| `bug-fix` | [`2026-09-06-packed-install-private-npm-cache.zh.md`](../.agents/notes/implemented/bug-fix/2026-09-06-packed-install-private-npm-cache.zh.md) | 说明安装验证为何使用随临时消费者清理的私有 npm 缓存。 |
| `feature` | [`2026-07-10-parallel-tool-call-execution.zh.md`](../.agents/notes/implemented/feature/2026-07-10-parallel-tool-call-execution.zh.md) | 说明工具如何按安全判断选择并行或独占执行，以及日志和结果顺序。 |
| `process` | [`2026-07-26-dependencies-over-hand-rolling.zh.md`](../.agents/notes/implemented/process/2026-07-26-dependencies-over-hand-rolling.zh.md) | 说明何时采用维护良好的依赖，并评估净删除代码和依赖健康度。 |
| `simplification` | [`2026-06-20-unify-agent-and-session-id.zh.md`](../.agents/notes/implemented/simplification/2026-06-20-unify-agent-and-session-id.zh.md) | 说明本地 Agent 与 Session 生命周期为何共用一个身份。 |
| `testing` | [`2026-08-24-session-log-snapshot-corpus.zh.md`](../.agents/notes/implemented/testing/2026-08-24-session-log-snapshot-corpus.zh.md) | 说明会话快照的归属、正式 profile 启动路径和顶层 `snapshots/` 范围。 |

### 归档规则

新增 Agent Note 前，先在活跃树中搜索同一决策或机制，判断新记录是否完全或部分替代旧记录。完全替代的旧记录只有在新记录保留其全部独有理由、备选方案、后果和验证要求后才能合并删除；部分替代的记录要保留并互相链接。归档根据记录是否仍能指导未来决策评估，具体条件以 [Agent Note 规则](../.agents/notes/README.md#archiving-and-deletion)为准。小型 UI 调整和纯机械修改通常不需要新增 Agent Note。

归档只接收已实现记录，并将文件移动到 `archived/{class}/...`，保留 `Status: implemented`，在两种语言中加入相同的 `Archived: YYYY-MM-DD`，然后更新 sidecar 和封存清单。归档后不得编辑、翻译、格式化、移动、删除正文或修复出站链接；`.agents/notes/archived/manifest.json` 保存封存文件的哈希。

不要新增 `.agents/notes/INDEX.md`。按生命周期和类别浏览，或使用搜索定位记录；中央索引会重复路径信息并制造维护冲突。

## `.claude`：Claude 入口

`.claude/skills` 是 Git 中记录为符号链接的路径，目标为 `../.agents/skills`。因此通过 `.claude/skills/<name>/SKILL.md` 打开的文件和 `.agents/skills/<name>/SKILL.md` 是同一份内容；技能只能在 `.agents/skills` 下新增或修改，不要建立第二份 Claude 专用副本。

该链接让支持 `.claude` 目录的工具可以从熟悉的路径发现技能，同时保留 `.agents` 作为仓库内技能的真实归属。它没有额外复制、覆盖或扩展技能规则；技能调用策略仍由 `SKILL.md` frontmatter、正文和 `agents/openai.yaml`（若该元数据存在）共同决定。

## 修改和新增文件

修改工作规则时，先阅读根 [AGENTS.md](../AGENTS.md)、相关子树的 `AGENTS.md` 和 [文档标准](../docs/AGENTS.md)。编辑真实的 `AGENTS.md`，保留现有 `CLAUDE.md` 符号链接。只有当规则属于所有会话都需要的短指令时才放入根文件；详细解释应放到其权威文档并从指令中链接。

修改技能时，先判断任务是否满足该技能的触发条件，再编辑 `.agents/skills/<name>/SKILL.md` 或它的归属参考文件。技能描述应说明何时调用；正文应说明边界、失败处理和验证方式。`dsh-translate-docs` 明确要求用户显式调用，不能因为普通文档任务需要中文就自动选择它。

新增长期设计决策时，先检查已有 Agent Note 的完全或部分替代关系，再按 `proposed` 或 `implemented` 放入正确类别，并同时维护双语三联。不要用 Agent Note 记录纯机械修改、临时任务清单或已经由代码和测试清楚表达的事实。

## 验证命令

文档、技能或 Agent Note 变更至少运行与改动相匹配的检查。常用命令如下：

```sh
pnpm run verify-skill-invocation-metadata
pnpm run verify-agent-note-classification
pnpm run verify-agent-note-format
pnpm run verify-translation-pairing
pnpm run verify-md-links
pnpm run verify-md-wrap
pnpm run test:docs
pnpm run doc-sync
```

`test:docs` 是快速文档检查集合；`doc-sync` 是完整文档同步集合，包含 Agent Note、技能调用元数据、双语配对、Markdown 链接与换行等检查。各检查的默认扫描范围由对应脚本维护；`ck-docs/` 不在 `verify-md-links` 的默认范围内，需要额外对本文件调用该脚本导出的 `findViolations` 检查链接和锚点。提交前按 [dsh-pre-push-checks](../.agents/skills/dsh-pre-push-checks/SKILL.md) 选择覆盖实际 diff 的最小充分检查。

## 延伸阅读

- [文档标准](../docs/AGENTS.md)——文档层级、双语配对、文字预算和放置规则。
- [Agent Notes 规则](../.agents/notes/README.md)——生命周期、类别、格式、归档和删除条件。
- [已实现 Agent Notes 规则](../.agents/notes/implemented/AGENTS.md)——如何让已交付记录与当前代码保持一致。
- [Agent 指令包 README](../packages/context/agent-instructions/README.zh.md)——`AGENTS.md` 与 `CLAUDE.md` 的候选、加载、刷新和预算行为。
- [项目架构导览](project-architecture.md)——从应用启动、profile 组合和 Agent/Session 链路理解仓库。

## 维护备注

本文记录当前检出中的 `.agents` 和 `.claude` 文件关系。技能清单、目录路径和符号链接发生变化时，应在同一变更中更新本文；归档记录正文仍由归档规则冻结，不因本文的示例入口而修改。
