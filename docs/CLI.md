---
title: Vestara CLI Reference
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# Vestara CLI Reference

Vestara v0.3.0 — `vestara` is the command-line entry point to the Vestara AI engineering runtime.

## Usage

```
vestara <command> [options]
```

Run without arguments to start the **conversational REPL** — an interactive AI assistant booting
the full runtime (kernel, providers, conversation engine, audio services).

## Global Options

| Flag | Description |
|------|-------------|
| `-h, --help` | Show help message |
| `-v, --version` | Show version |
| `-w, --watch` | Start REPL with watch mode |
| `--json` | Machine-readable JSON output (status) |
| `--brief` | Compact one-line output (status) |

---

## CLI Commands

### `vestara screenshots <subcommand> [options]`

Run the Workspace UI screenshot and visual-regression framework through the CLI. `run` compares against
committed baselines; baseline mutation requires the explicit `update` subcommand.

| Subcommand | Behavior |
|------------|----------|
| `run` | Capture and compare screenshots (default) |
| `update` | Intentionally update selected baselines |
| `report` | Regenerate JSON, Markdown, and HTML reports |
| `clean` | Remove generated artifacts while preserving baselines |
| `check` | Type-check the visual automation framework |

```bash
vestara screenshots run --viewport desktop
vestara screenshots run --routes dashboard,docs --theme dark
vestara screenshots update --routes settings
vestara screenshots check --json
```

| Option | Constraint |
|--------|------------|
| `--viewport` | `mobile`, `tablet`, or `desktop` |
| `--theme` | `dark` or `light` |
| `--routes` | Comma-separated route IDs |
| `--base-url` | HTTP(S) Workspace URL |
| `--tolerance` | Pixel threshold from `0` to `1` |
| `--max-diff` | Maximum differing percentage from `0` to `100` |
| `--stability-ms` | Additional settle time from `0` to `60000` ms |
| `--role` | Screenshot identity role ID |
| `--wait-network` | Wait for network-idle before capture |
| `--ci` | Enable Playwright CI behavior |
| `--workspace` | Path used to locate `vestara-ai-core` |
| `--json` | Emit the structured child-process result |

---

### `vestara open [path]`

Open a workspace at the given path (default `.`). Creates `.vestara/` manifest and storage
directories, fingerprints the repository, analyzes its structure, indexes knowledge, and
generates a presentational summary.

```
vestara open .                # Open current directory
vestara open /path/to/repo    # Open specific path
vestara open . --force        # Force re-open + re-index
```

**Lifecycle**: discover → fingerprint → analyze → index → present

Opens a workspace-aware REPL (`{repo-name} > `) after completion. See *Workspace REPL* below.

---

### `vestara validate [path]`

CAP-001 Workspace Orientation — run the full comprehension pipeline and emit a structured
report covering identity, architecture, health, activity, decisions, and summary.

```
vestara validate .            # Validate current directory
```

---

### `vestara status [--json|--brief]`

Display system health overview: runtime status, audio pipeline, providers, agents, teams,
projects, milestones, and conversation feature health.

```
vestara status                # Full health overview
vestara status --json         # Machine-readable JSON
vestara status --brief        # Compact one-line status
```

---

### `vestara doctor [sub]`

Run diagnostics on Vestara subsystems. Without a subcommand, runs the general health check.

| Subcommand | Diagnostics |
|------------|-------------|
| `audio` | Audio pipeline (mic, VAD, STT, TTS) |
| `conversation` | Conversation engine, provider, sessions |
| `agents` | Agent registrations, teams, schedules |
| `teams` | Team assignments and agent membership |
| `models` | Provider connectivity and model availability |
| `workspace` | Manifest integrity, storage paths, session |
| `all` | All diagnostics |

```
vestara doctor                # General health check
vestara doctor audio          # Audio pipeline
vestara doctor models         # Provider/models check
vestara doctor workspace      # Workspace storage
vestara doctor all            # Everything
```

---

### `vestara agents`

List all registered agents with status, role, execution stats, and team assignments.

```
vestara agents
```

---

### `vestara teams [create|assign|list]`

Manage agent teams.

```
vestara teams                          # List all teams
vestara teams create <name>            # Create a new team
vestara teams assign <team> <agent...> # Assign agent(s) to a team
```

---

### `vestara session <sub>`

Manage multi-agent execution sessions.

| Subcommand | Description |
|------------|-------------|
| `workflows` | List available workflow definitions |
| `start <wf> <goal>` | Start a multi-agent session |
| `list` | List execution sessions |
| `background` | Run background services |

```
vestara session workflows
vestara session start feature "add auth"
vestara session list
vestara session background
```

---

### `vestara metrics`

Show runtime memory and platform metrics.

```
vestara metrics
```

---

### `vestara benchmark conversation`

Run conversation performance benchmarks (latency, throughput).

```
vestara benchmark conversation
```

---

### `vestara demo golden-path`

Run the interactive golden-path demo walkthrough.

```
vestara demo golden-path
```

---

### `vestara config [get|set|list|reset]`

View or modify workspace preferences. Reads/writes `.vestara/prefs.db`.

**Valid config keys**: `model`, `provider`, `theme`, `defaultAgent`, `autoIndex`,
`verifyOnImplement`, `predictBeforePlan`

```
vestara config                          # Show all config and storage paths
vestara config list                     # List all preferences
vestara config get model                # Show current model
vestara config set model <id>           # Change model
vestara config reset model              # Reset to default
```

**Defaults**: provider=`opencode`, model=`deepseek-v4-flash-free`, theme=`dark`,
defaultAgent=`architect`, autoIndex=`true`, verifyOnImplement=`true`, predictBeforePlan=`false`

---

### `vestara models`

List all available AI models from registered providers, with context window, pricing,
and capability information.

```
vestara models
```

---

### `vestara provider <sub> [args]`

Manage AI providers, their enable/disable state, and model configuration.
All data persists in `.vestara/workspace.json` under the `providers` key.

| Subcommand | Description |
|------------|-------------|
| `add <id>` | Register a new provider (`--name`, `--base-url`, `--api-key-env`) |
| `add-local [name]` | Register a local provider with Ollama defaults (`--base-url`) |
| `remove <id>` | Remove a provider and all its models |
| `enable <id>` | Enable a provider |
| `disable <id>` | Disable a provider |
| `list` | List all providers with status and model counts |
| `status <id>` | Show registry entry + live health check |
| `models <id>` | List models for a provider with enable/disable status |
| `model add <pid> <mid>` | Add a model to a provider (`--name`, `--context`, `--max-output`, `--capabilities`) |
| `model enable <pid> <mid>` | Enable a specific model |
| `model disable <pid> <mid>` | Disable a specific model |

```
vestara provider add opencode                                 # Register with defaults
vestara provider add my-provider --base-url <url> --api-key-env MY_KEY
vestara provider list
vestara provider status opencode
vestara provider enable opencode
vestara provider disable opencode
vestara provider remove opencode
vestara provider models opencode
vestara provider model add opencode deepseek-v4-flash-free --name "DeepSeek V4 Flash"
vestara provider model enable opencode deepseek-v4-flash-free
vestara provider model disable opencode gpt-4o
```

### Local Providers

Any OpenAI-compatible local provider can be added via `--base-url`. The CLI registers
the provider in `.vestara/workspace.json` so the runtime can discover and use it.

**Ollama** (local):
```
vestara provider add ollama --base-url http://localhost:11434/v1
vestara provider model add ollama llama3 --name "Llama 3" --capabilities chat,stream
vestara provider model add ollama deepseek-coder:6.7b --name "DeepSeek Coder 6.7B" --capabilities chat,stream,fn-call
```

**LM Studio** (local):
```
vestara provider add lm-studio --base-url http://localhost:1234/v1
vestara provider model add lm-studio local-model --name "Local Model" --context 32768 --max-output 4096
```

The provider registry stores: id, name, base URL, API key env var name, enabled/disabled state,
created/updated timestamps, and a per-provider model list with per-model capability flags.

---

### `vestara plan <sub> [args]`

Create, view, and manage plans. Plans are durable artifacts with tasks, scope, risks,
and assumptions, persisted to `.vestara/plans/plans.db`.

| Subcommand | Description |
|------------|-------------|
| `list` | List all plans |
| `show <id>` | Show plan details |
| `create "<goal>"` | AI-synthesized plan from goal |
| `approve <id>` | Approve a plan |
| `status <id> <status>` | Set plan status manually |
| `delete <id>` | Delete a plan |

```
vestara plan list
vestara plan show P-1
vestara plan create "add feature"
vestara plan approve P-1
vestara plan status P-1 approved
vestara plan delete P-1
```

Shorthand: `vestara plans` also lists all plans.

---

### `vestara task <sub>`

Manage tasks within plans.

```
vestara task list <plan-id>              # List tasks in a plan
vestara task create <plan-id>            # Create a new task
vestara task assign <plan-id> <task>     # Assign to agent/team
vestara task prioritize <id> <task>      # Set priority
vestara task comment <plan-id> <task>    # Add comment
```

---

### `vestara projects`

List all projects with task and sprint statistics.

```
vestara projects
```

---

### `vestara context`

Display runtime context: workspace identity, provider health, active configuration,
and storage paths.

```
vestara context
```

---

### `vestara context`

Display runtime context: workspace identity, provider health, active configuration,
and storage paths.

```
vestara context
```

---

### `vestara ops <sub> [args]`

Engineering Operations Center — live telemetry for the AI engineering organization.

| Subcommand | Description |
|------------|-------------|
| `feed` | Live activity feed (recent events) |
| `status` | Current agent statuses with progress, tasks, and timing |
| `timeline [agent]` | Chronological engineering timeline, optionally filtered by agent |
| `demo` | Generate demo events to preview the telemetry system |

```
vestara ops feed
vestara ops status
vestara ops timeline engineer
vestara ops demo
```

**Demo output:**

```
Demo: Engineering Activity Feed

  04:18:29 ● context   Loading repository
  04:18:29 ✓ context   ✓ Loaded
  04:18:29 ◌ planner   Found 3 architectural issues
  04:18:29 ● planner   Prioritizing EV-004
  04:18:29 ✓ planner   4 tasks created
  04:18:29 ● engineer  Analyzing exports
  04:18:29 ● engineer  Adding GraphRuntime interface
  04:18:29 ✓ engineer  4 files modified (+128 -43)
  04:18:29 ◆ verifier  TypeScript compilation
  04:18:29 ◆ verifier  12 passing, 0 failing
  04:18:29 ✓ verifier  ✓ Build passed · ✓ Tests passed · ✓ Types correct
  04:18:29 ◆ reviewer  Checking architecture compliance
  04:18:29 ✓ reviewer  Approved — no architectural violations

Demo: Agent Status

  ✓ Context
      Status:    completed
      Task:      Loaded AGENTS.md
      Operation: analyze
      Detail:    ✓ Loaded

  ✓ Engineer
      Status:    completed
      Task:      Implementation complete
      Detail:    4 files modified (+128 -43)

  ✓ Verifier
      Status:    completed
      Task:      Verification complete
      Detail:    ✓ Build passed · ✓ Tests passed · ✓ Types correct
```

The telemetry system is designed for agents to emit events as they work.
In a live session, the feed updates in real time as Planner, Engineer,
Reviewer, and Verifier agents report their progress.

---

### `vestara architecture <sub> [args]`

Query the Architecture Knowledge Graph (AKG) — a directed graph of foundational architectural
decisions (ADRs 100+) with typed relationships.

| Subcommand | Description |
|------------|-------------|
| `list` | List all ADRs |
| `show <id>` | Show a single ADR with metadata (status, category, dependencies, influences, references) |
| `depends-on <id>` | What an ADR depends on |
| `dependents-of <id>` | What depends on an ADR |
| `influences <role>` | Which ADRs influence a given role (Planner, Verifier, etc.) |
| `impact <id>` | Impact analysis — affected ADRs, blueprints, agents, and risk level |

```
vestara architecture list
vestara architecture show adr-100
vestara architecture depends-on adr-104
vestara architecture dependents-of adr-100
vestara architecture influences verifier
vestara architecture impact adr-103
```

---

### `vestara blueprint verify`

Structural integrity check for the Architecture Knowledge Graph. Validates:

- All `depends_on` targets exist
- No circular dependencies
- All `referenced_by` paths resolve
- No duplicate IDs

```
vestara blueprint verify
```

Output:

```
Vestara Blueprint Verification
========================================

✓ Foundational ADRs: 5

✓ Broken Dependencies: 0
✓ Circular Dependencies: 0
✓ Missing References: 0
✓ Duplicate IDs: 0

Architecture Graph: PASS
```

---

### `vestara completions <shell>`

Generate shell completion scripts.

| Shell | Usage |
|-------|-------|
| bash | `source <(vestara completions bash)` |
| zsh | `vestara completions zsh > _vestara` |

---

### `vestara help [command]`

Show general help or detailed help for a specific command.

```
vestara help                    # General help
vestara help plan               # Plan command details
```

---

## Conversational REPL

Running `vestara` with no arguments boots the full AI runtime and opens a conversational
REPL (`> ` prompt). Supports:

- Free-form AI conversation routed through the conversation engine
- Multi-turn history
- Streaming responses (text, reasoning, tool calls, citations)
- Audio input/output (when available)

**Built-in REPL commands:**

| Command | Description |
|---------|-------------|
| `health`, `status` | Runtime diagnostics |
| `profile` | Show user profile |
| `history` | Show conversation history |
| `help` | List REPL commands |
| `exit`, `quit` | Exit |

---

## Workspace REPL

After `vestara open .`, the prompt changes to `{repo-name} > ` and a full workspace-aware
REPL is available with commands across every subsystem.

### Repository Knowledge

| Command | Description |
|---------|-------------|
| `search <term>` | Search indexed knowledge |
| `explain <target>` | AI explanation of architecture, packages, modules |
| `summary` | Repository presentation summary |
| `risks` | Show detected risks |

### Configuration

| Command | Description |
|---------|-------------|
| `config` or `config list` | List preferences |
| `config set <key> <value>` | Set preference |
| `config reset <key>` | Reset to default |

### Plans

| Command | Description |
|---------|-------------|
| `plan <goal>` | Create a plan |
| `plan list` or `plans` | List plans |
| `plan show <id>` | View plan |
| `plan approve <id>` | Approve plan |

### Implementation

| Command | Description |
|---------|-------------|
| `implement plan <id>` | Generate changes from a plan |
| `implement decision <id>` | Generate changes from a decision |
| `implement show <cs-id>` | View a change set |
| `implement apply <cs-id>` | Apply a change set |

### Verification

| Command | Description |
|---------|-------------|
| `verify <cs-id>` | Run verification on a change set |
| `verify show <vr-id>` | View verification report |
| `verify plan <id>` | Verify plan compliance |
| `verify workspace` | Verify workspace integrity |
| `verify accuracy` | Prediction accuracy summary |
| `verify trends` | Verification trend analysis |

### Collaboration

| Command | Description |
|---------|-------------|
| `collab list` | List collaboration records |
| `collab status <cr-id>` | View record |
| `collab comment <cr-id> "<msg>"` | Add a comment |
| `collab approve <cr-id>` | Approve |
| `collab reject <cr-id> "<reason>"` | Reject |
| `collab submit <cs-id>` | Submit for review |

### Prediction & Impact

| Command | Description |
|---------|-------------|
| `predict <goal>` | Predict impact of a goal |
| `predict plan <id>` | Predict impact of a plan |
| `predict history` | List predictions |
| `predict compare <id1> <id2>` | Compare two predictions |

### Recommendations & Decisions

| Command | Description |
|---------|-------------|
| `recommend` | Get a recommendation |
| `recommend next` | Get the next recommended action |
| `recommend plan <id>` | Recommend on a specific plan |
| `recommend accept <id>` | Accept a decision |
| `recommend history` | List past recommendations |

### Suggestions

| Command | Description |
|---------|-------------|
| `suggest` | AI-suggested actions |

### Agents

| Command | Description |
|---------|-------------|
| `agent list` or `agents` | List agents |
| `agent inspect <id>` | Agent details |
| `agent run <id> "<task>"` | Run an agent |

### Workflows

| Command | Description |
|---------|-------------|
| `workflow list` or `workflows` | List workflows |
| `workflow start <id> "<goal>"` | Run a workflow |
| `workflow status` | Check workflow status |
| `wf list` / `wf start` / `wf status` | Shorthand aliases |

### Plugins

| Command | Description |
|---------|-------------|
| `plugin list` or `plugins` | List plugins |
| `plugin info <id>` | Plugin details |
| `plugin toggle <id>` | Enable/disable |
| `plugin exec <hook>` | Execute hook |

### Cloud

| Command | Description |
|---------|-------------|
| `cloud status` | Cloud overview |
| `cloud workers` | List cloud workers |
| `cloud jobs` or `cloud job list` | List cloud jobs |
| `cloud job submit <type> <target>` | Submit a job |

### Async Execution

| Command | Description |
|---------|-------------|
| `exec <type> <target>` | Submit async job |
| `exec list` or `exec jobs` | List jobs |
| `exec status <id>` or `exec show <id>` | Job details |
| `exec cancel <id>` | Cancel job |

### OS Services

| Command | Description |
|---------|-------------|
| `os info` or `os status` | System info |
| `os services` or `os daemon` | Service health |
| `os start` | Start all AI OS services |
| `os stop` | Stop all AI OS services |

### Organization & Multi-Repo

| Command | Description |
|---------|-------------|
| `org list` | List organizations |
| `org init "<name>"` | Create organization |
| `org repos` or `org list-repos` | List repos |
| `org add-repo <path>` | Add repository |
| `org search <query>` | Cross-repo search |
| `org graph` | Dependency graph |
| `org impact <repo>` | Cross-repo impact analysis |

### Enterprise

| Command | Description |
|---------|-------------|
| `enterprise status` or `enterprise overview` | Overview |
| `enterprise team list` | List teams |
| `enterprise team create "<name>"` | Create team |
| `enterprise project list` | List projects |
| `enterprise project create "<name>"` | Create project |
| `enterprise policy list` or `enterprise policies` | List policies |
| `enterprise audit` | Audit log |

### Auto-Index

| Command | Description |
|---------|-------------|
| `auto-index status` | Index stats |
| `auto-index run` | Trigger re-index |

### Health

| Command | Description |
|---------|-------------|
| `health` or `status` | Runtime diagnostics |
| `history` | Conversation history |
| `help <topic>` | Context-sensitive help |

---

### Marketplace (Engineering Exchange)

Discover, install, update, and verify engineering assets from local registry
directories. The Marketplace owns catalog and discovery; installation mechanics
delegate to `@vestara/extension-runtime`.

| Subcommand | Behavior |
|------------|----------|
| `search <query>` | Search assets (`--type T`, `--publisher P`, `--tag T`, `--limit N`) |
| `list` | List all catalog assets |
| `info <package>` | Asset details: versions, dependencies, permissions, verification |
| `installed` | Installed packages with state and update status |
| `updates` | Available updates (compatible and incompatible) |
| `install <package>[@version]` | Install and activate (`--dry-run`, `--yes`) |
| `update <package>` | Update to the latest compatible version (`--dry-run`, `--yes`) |
| `uninstall <package>` | Uninstall (`--yes`) |
| `verify <package>` | Recompute and compare the package digest |
| `rescan` | Rescan local registry directories |

Supports `--json`. `--dry-run` prints the full resolution plan (versions,
dependencies, permissions) without installing; packages declaring permissions
require confirmation unless `--yes` is given.

Discovery sources (read-only): `<workspace>/.vestara/marketplace/`,
`<workspace>/.vestara/packages/`, `~/.config/vestara/marketplace/`, and
`$VESTARA_MARKETPLACE_ROOTS`. Installed state persists under
`<workspace>/.vestara/extensions/`.

---

## Data Storage

The CLI persists data in `.vestara/` under the workspace root:

| Path | Contents |
|------|----------|
| `workspace.json` | Manifest — identity, analysis, index, memory state |
| `plans/plans.db` | Plans, tasks, change sets, verifications |
| `sessions/` | Session snapshots |
| `knowledge/` | Indexed knowledge graph |
| `memory/` | Event memory |
| `prefs.db` | User preferences |

Default provider is **OpenCode** (`@vestara/provider-opencode`) — works without API keys.
