import { BOLD, GOLD, GREEN, GRAY, RESET, CYAN } from '../output/format.js';

export async function runHelpCommand(cmd: string): Promise<void> {
  const helpMap: Record<string, { desc: string; usage: string; subs?: string; examples: string[] }> = {
    open: { desc: 'Open a workspace, initializing .vestara/ manifest and storage directories.', usage: 'vestara open [path]', examples: ['vestara open .                # Open current directory', 'vestara open /path/to/repo # Open specific path'] },
    validate: { desc: 'Run CAP-001 Workspace Orientation: fingerprint, analyze, and index the repository.', usage: 'vestara validate [path]', examples: ['vestara validate .           # Validate current directory'] },
    status: { desc: 'Display system health overview.', usage: 'vestara status [--json|--brief]', examples: ['vestara status                # Full health overview', 'vestara status --json         # Machine-readable JSON output', 'vestara status --brief        # Compact one-line status'] },
    doctor: { desc: 'Run diagnostics on Vestara subsystems.', usage: 'vestara doctor [sub]', subs: 'audio | conversation | agents | teams | models | workspace | all', examples: ['vestara doctor               # General health check', 'vestara doctor audio         # Audio pipeline diagnostics'] },
    agents: { desc: 'List all registered agents.', usage: 'vestara agents', examples: ['vestara agents             # List all agents'] },
    teams: { desc: 'List, create, or assign agents to teams.', usage: 'vestara teams [create|assign|list]', examples: ['vestara teams                # List all teams', 'vestara teams create <name>  # Create a new team'] },
    session: { desc: 'Manage multi-agent sessions.', usage: 'vestara session <sub>', subs: 'workflows | start <workflow> <goal> | list | background', examples: ['vestara session workflows', 'vestara session start <workflow> <goal>'] },
    metrics: { desc: 'Show runtime memory and platform metrics.', usage: 'vestara metrics', examples: ['vestara metrics'] },
    benchmark: { desc: 'Run performance benchmarks.', usage: 'vestara benchmark <sub>', subs: 'conversation', examples: ['vestara benchmark conversation'] },
    demo: { desc: "Run Vesta's interactive demo walkthrough.", usage: 'vestara demo <sub>', subs: 'golden-path', examples: ['vestara demo golden-path'] },
    config: { desc: 'View or modify workspace configuration.', usage: 'vestara config [get|set|list|reset] [key] [value]', subs: 'get [key] | set <key> <value> | list | reset <key>', examples: ['vestara config', 'vestara config set model <id>'] },
    models: { desc: 'List all available AI models.', usage: 'vestara models', examples: ['vestara models'] },
    provider: { desc: 'Manage AI providers.', usage: 'vestara provider <sub> [args]', subs: 'add | remove | enable | disable | list | status | models | model add/enable/disable', examples: ['vestara provider list', 'vestara provider enable opencode'] },
    plan: { desc: 'Create, view, update, and manage plans.', usage: 'vestara plan [list|show|create|approve|status|delete] [args]', subs: 'list | show <id> | create <goal> | approve <id> | status <id> <status> | delete <id>', examples: ['vestara plan list', 'vestara plan show P-1', 'vestara plan create "add feature"'] },
    plans: { desc: 'List all plans.', usage: 'vestara plans [--json]', examples: ['vestara plans', 'vestara plans --json'] },
    task: { desc: 'Manage tasks within plans.', usage: 'vestara task list <plan-id>', examples: ['vestara task list P-1'] },
    projects: { desc: 'List all projects.', usage: 'vestara projects', examples: ['vestara projects'] },
    context: { desc: 'Display runtime context.', usage: 'vestara context', examples: ['vestara context'] },
    completions: { desc: 'Generate shell completion scripts.', usage: 'vestara completions <shell>', subs: 'bash | zsh', examples: ['source <(vestara completions bash)'] },
    help: { desc: 'Show help or details for a specific command.', usage: 'vestara help [command]', examples: ['vestara help', 'vestara help plan'] },
  };

  const entry = helpMap[cmd];
  if (!entry) { console.log(`${GOLD}Unknown command: "${cmd}"${RESET}\n`); return; }
  console.log(); console.log(`${BOLD}${GOLD}${cmd}: ${entry.desc}${RESET}`); console.log(`${GRAY}──────────────────────${RESET}`); console.log();
  console.log(`  ${BOLD}Usage${RESET}`); console.log(`    ${entry.usage}`); console.log();
  if (entry.subs) { console.log(`  ${BOLD}Subcommands${RESET}`); console.log(`    ${entry.subs}`); console.log(); }
  console.log(`  ${BOLD}Examples${RESET}`);
  for (const ex of entry.examples) console.log(`    ${GRAY}${ex}${RESET}`);
  console.log();
}
