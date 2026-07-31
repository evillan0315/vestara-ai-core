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

### `vestara provider [list|status <id>]`

Manage AI providers.

```
vestara provider list                    # List registered providers
vestara provider status opencode         # Check provider health
```

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
