#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import { runAgentsList } from './commands/agents.js';
import { runArchitecture, runBlueprintVerify } from './commands/architecture.js';
import { runBenchmarkConversation } from './commands/benchmark.js';
import { runCompletions } from './commands/completions.js';
import { runContext } from './commands/context.js';
import { runGoldenPath } from './commands/demo.js';
import {
  runDoctor,
  runDoctorAgents,
  runDoctorAll,
  runDoctorAudio,
  runDoctorConversation,
  runDoctorModels,
  runDoctorTeams,
  runDoctorWorkspace,
} from './commands/doctor.js';
import { runHelpCommand } from './commands/help-cmd.js';
import { runMetrics } from './commands/metrics.js';
import { runModelsList } from './commands/models.js';
import { runOps } from './commands/ops.js';
import {
  runPlanApprove,
  runPlanCreate,
  runPlanDelete,
  runPlanShow,
  runPlansList,
  runPlanUpdateStatus,
} from './commands/plans.js';
import { runProjectsList } from './commands/projects.js';
import { runBackgroundServices, runListSessions, runListWorkflows, runStartSession } from './commands/session.js';
import { runSystemStatus } from './commands/status.js';
import { runTeamsAssign, runTeamsCreate, runTeamsList } from './commands/teams.js';
import type { CliContext } from './context/cli-context.js';
import { createCliContext } from './context/cli-context.js';
import { CommandRegistry } from './lib/command-registry.js';
import { BOLD, GOLD, GRAY, GREEN, RED, RESET, renderStatus } from './output/format.js';

const VERSION = '0.3.0';

function printVersion(): void {
  console.log(`vestara v${VERSION}`);
}

function printHelp(): void {
  console.log();
  console.log(`${BOLD}${GOLD}Vestara CLI v${VERSION}${RESET}`);
  console.log(`${GRAY}Usage: vestara <command> [options]${RESET}`);
  console.log();
  console.log(`  ${BOLD}Commands${RESET}`);
  console.log(
    `    ${GREEN}open${RESET} [path]        ${GRAY}Open a workspace (default: ., --force to re-open)${RESET}`,
  );
  console.log(`    ${GREEN}validate${RESET} [path]    ${GRAY}CAP-001 workspace orientation${RESET}`);
  console.log(`    ${GREEN}status${RESET} [--json]    ${GRAY}System health overview${RESET}`);
  console.log(
    `    ${GREEN}doctor${RESET} [sub]       ${GRAY}Diagnostics (audio|conversation|agents|teams|models|workspace|all)${RESET}`,
  );
  console.log(`    ${GREEN}agents${RESET}             ${GRAY}List all registered agents${RESET}`);
  console.log(`    ${GREEN}teams${RESET} [sub]        ${GRAY}Team management (create|assign|list)${RESET}`);
  console.log(
    `    ${GREEN}session${RESET} <sub>      ${GRAY}Session management (workflows|start|list|background)${RESET}`,
  );
  console.log(`    ${GREEN}metrics${RESET}            ${GRAY}Runtime memory and platform metrics${RESET}`);
  console.log(`    ${GREEN}benchmark${RESET} <sub>    ${GRAY}Performance benchmarks (conversation)${RESET}`);
  console.log(`    ${GREEN}demo${RESET} <sub>         ${GRAY}Demo walkthrough (golden-path)${RESET}`);
  console.log(`    ${GREEN}config${RESET} [get|set|list|reset]  ${GRAY}Config management${RESET}`);
  console.log(`    ${GREEN}models${RESET}             ${GRAY}List available AI models${RESET}`);
  console.log(
    `    ${GREEN}provider${RESET} [sub]     ${GRAY}Provider management (add|list|status|enable|disable|remove|models)${RESET}`,
  );
  console.log(
    `    ${GREEN}plan${RESET} [sub]         ${GRAY}Plan management (list|show|create|approve|status|delete)${RESET}`,
  );
  console.log(`    ${GREEN}plans${RESET}              ${GRAY}List all plans${RESET}`);
  console.log(`    ${GREEN}task${RESET} [sub]         ${GRAY}Task management (list <plan-id>)${RESET}`);
  console.log(`    ${GREEN}projects${RESET}           ${GRAY}List all projects with task/sprint stats${RESET}`);
  console.log(`    ${GREEN}context${RESET}            ${GRAY}Show runtime context${RESET}`);
  console.log(
    `    ${GREEN}architecture${RESET} [sub]  ${GRAY}AKG query (show|list|depends-on|dependents-of|influences|impact)${RESET}`,
  );
  console.log(`    ${GREEN}blueprint${RESET} verify    ${GRAY}Architecture Knowledge Graph integrity check${RESET}`);
  console.log(
    `    ${GREEN}ops${RESET} [sub]           ${GRAY}Engineering telemetry (feed|status|timeline|demo)${RESET}`,
  );
  console.log(`    ${GREEN}completions${RESET} [shell] ${GRAY}Generate shell completion script${RESET}`);
  console.log(`    ${GREEN}help${RESET} [command]     ${GRAY}Show help or details for a specific command${RESET}`);
  console.log();
  console.log(`  ${BOLD}Options${RESET}`);
  console.log(`    -h, --help        ${GRAY}Show this help message${RESET}`);
  console.log(`    -v, --version     ${GRAY}Show version number${RESET}`);
  console.log(`    -w, --watch       ${GRAY}Start REPL with watch mode${RESET}`);
  console.log(`    --json            ${GRAY}Output status in JSON format${RESET}`);
  console.log(`    --brief           ${GRAY}Compact one-line status output${RESET}`);
  console.log();
}

function registerCommands(registry: CommandRegistry): void {
  registry.register('status', (args) => runSystemStatus(args));
  registry.register('agents', () => runAgentsList());
  registry.register('teams', async (args) => {
    if (args[0] === 'create' && args[1]) {
      await runTeamsCreate(args.slice(1));
      return;
    }
    if (args[0] === 'assign' && args[1] && args[2]) {
      await runTeamsAssign(args[1], args.slice(2));
      return;
    }
    await runTeamsList();
  });
  registry.register('plans', (args) => runPlansList(args));
  registry.register('plan', (args) => {
    if (args[0] === 'show' && args[1]) return runPlanShow(args[1]);
    if (args[0] === 'approve' && args[1]) return runPlanApprove(args[1]);
    if (args[0] === 'delete' && args[1]) return runPlanDelete(args[1]);
    if (args[0] === 'create' && args[1]) return runPlanCreate(args.slice(1).join(' '));
    if (args[0] === 'status' && args[1] && args[2]) return runPlanUpdateStatus(args[1], args[2]);
    return runPlansList(args);
  });
  registry.register('context', () => runContext());
  registry.register('metrics', () => runMetrics());
  registry.register('models', () => runModelsList());
  registry.register('help', async (args) => {
    if (args[0]) await runHelpCommand(args[0]);
    else printHelp();
  });
  registry.register('completions', (args) => runCompletions(args[0]));
  registry.register('projects', () => runProjectsList());
  registry.register('session', async (args) => {
    if (args[0] === 'workflows') {
      await runListWorkflows();
      return;
    }
    if (args[0] === 'start' && args[1] && args[2]) {
      await runStartSession(args[1], args[2]);
      return;
    }
    if (args[0] === 'list') {
      await runListSessions();
      return;
    }
    if (args[0] === 'background') {
      await runBackgroundServices();
      return;
    }
    console.log(`${GOLD}Usage: vestara session workflows|start|list|background${RESET}`);
  });
  registry.register('doctor', async (args) => {
    if (args[0] === 'audio') {
      await runDoctorAudio();
      return;
    }
    if (args[0] === 'conversation') {
      await runDoctorConversation();
      return;
    }
    if (args[0] === 'agents') {
      await runDoctorAgents();
      return;
    }
    if (args[0] === 'teams') {
      await runDoctorTeams();
      return;
    }
    if (args[0] === 'models') {
      await runDoctorModels();
      return;
    }
    if (args[0] === 'workspace') {
      await runDoctorWorkspace();
      return;
    }
    if (args[0] === 'all') {
      await runDoctorAll();
      return;
    }
    await runDoctor();
  });
  registry.register('benchmark', async (args) => {
    if (args[0] === 'conversation') {
      await runBenchmarkConversation();
      return;
    }
    console.log(`${GOLD}Usage: vestara benchmark conversation${RESET}`);
  });
  registry.register('demo', async (args) => {
    if (args[0] === 'golden-path') {
      await runGoldenPath();
      return;
    }
    console.log(`${GOLD}Usage: vestara demo golden-path${RESET}`);
  });
}

export async function main() {
  const args = process.argv.slice(2);
  const registry = new CommandRegistry();
  registerCommands(registry);

  if (args[0] === '--help' || args[0] === '-h') {
    printHelp();
    return;
  }
  if (args[0] === 'help') {
    if (args[1]) {
      await runHelpCommand(args[1]);
      return;
    }
    printHelp();
    return;
  }
  if (args[0] === '--version' || args[0] === '-v') {
    printVersion();
    return;
  }

  if (args[0] === 'status') {
    await runSystemStatus(args.slice(1));
    return;
  }

  if (args[0] === 'agents') {
    await runAgentsList();
    return;
  }

  if (args[0] === 'teams') {
    if (args[1] === 'create' && args[2]) {
      await runTeamsCreate(args.slice(2));
      return;
    }
    if (args[1] === 'assign' && args[2] && args[3]) {
      await runTeamsAssign(args[2], args.slice(3));
      return;
    }
    await runTeamsList();
    return;
  }

  if (args[0] === 'metrics') {
    await runMetrics();
    return;
  }

  if (args[0] === 'doctor') {
    if (args[1] === 'audio') {
      await runDoctorAudio();
      return;
    }
    if (args[1] === 'conversation') {
      await runDoctorConversation();
      return;
    }
    if (args[1] === 'agents') {
      await runDoctorAgents();
      return;
    }
    if (args[1] === 'teams') {
      await runDoctorTeams();
      return;
    }
    if (args[1] === 'models') {
      await runDoctorModels();
      return;
    }
    if (args[1] === 'workspace') {
      await runDoctorWorkspace();
      return;
    }
    if (args[1] === 'all') {
      await runDoctorAll();
      return;
    }
    await runDoctor();
    return;
  }

  if (args[0] === 'benchmark') {
    if (args[1] === 'conversation') {
      await runBenchmarkConversation();
      return;
    }
    console.log(`${GOLD}Usage: vestara benchmark conversation${RESET}`);
    return;
  }

  if (args[0] === 'demo') {
    if (args[1] === 'golden-path') {
      await runGoldenPath();
      return;
    }
    console.log(`${GOLD}Usage: vestara demo golden-path${RESET}`);
    return;
  }

  if (args[0] === 'session') {
    if (args[1] === 'workflows') {
      await runListWorkflows();
      return;
    }
    if (args[1] === 'start' && args[2] && args[3]) {
      await runStartSession(args[2], args[3]);
      return;
    }
    if (args[1] === 'list') {
      await runListSessions();
      return;
    }
    if (args[1] === 'background') {
      await runBackgroundServices();
      return;
    }
    console.log(`${GOLD}Usage:${RESET}`);
    console.log(`  vestara session workflows              List available workflows`);
    console.log(`  vestara session start <workflow> <goal> Start a multi-agent session`);
    console.log(`  vestara session list                   List execution sessions`);
    console.log(`  vestara session background              Run background services`);
    return;
  }

  if (args[0] === 'validate') {
    const repoPath = args[1] ?? '.';
    const { runValidate } = await import('./commands/validate.js');
    await runValidate(repoPath);
    return;
  }

  if (args[0] === 'open') {
    const force = args.includes('--force');
    const pathArgs = args.slice(1).filter((a) => a !== '--force');
    let repoPath = pathArgs[0];
    if (!repoPath) {
      try {
        const initSqlJs = (await import('sql.js')).default;
        const SQL = await initSqlJs();
        const { DesktopService } = await import('@vestara/workspace');
        const desktop = new DesktopService(new SQL.Database());
        const session = await desktop.getSession();
        if (session.lastWorkspacePath) {
          repoPath = session.lastWorkspacePath;
          console.log(`${GRAY}Restoring last workspace: ${repoPath}${RESET}`);
        }
      } catch {}
      repoPath = repoPath ?? '.';
    }
    const { runOpen } = await import('./commands/open.js');
    await runOpen(repoPath, force);
    return;
  }

  if (args[0] === 'config') {
    if (args[1] === 'list' || args[1] === 'get') {
      console.log(`${GRAY}Use 'vestara status' or 'vestara context' to view configuration.${RESET}\n`);
      return;
    }
    if (args[1] === 'set' && args[2] && args[3]) {
      const { runConfigSet } = await import('./commands/config.js');
      await runConfigSet(args[2], args.slice(3).join(' '));
      return;
    }
    if (args[1] === 'reset' && args[2]) {
      const { runConfigReset } = await import('./commands/config.js');
      await runConfigReset(args[2]);
      return;
    }
    console.log(`${GRAY}Usage: vestara config set <key> <value> | vestara config reset <key>${RESET}\n`);
    return;
  }

  if (args[0] === 'plans') {
    await runPlansList(args.slice(1));
    return;
  }

  if (args[0] === 'models') {
    await runModelsList();
    return;
  }

  if (args[0] === 'provider') {
    const {
      runProviderAdd,
      runProviderAddLocal,
      runProviderRemove,
      runProviderEnable,
      runProviderDisable,
      runProviderEnhancedList,
      runProviderModelsList,
      runProviderModelAdd,
      runProviderModelEnable,
      runProviderModelDisable,
    } = await import('./commands/provider.js');
    if (args[1] === 'add') {
      await runProviderAdd(args.slice(2));
      return;
    }
    if (args[1] === 'add-local') {
      await runProviderAddLocal(args.slice(2));
      return;
    }
    if (args[1] === 'remove' && args[2]) {
      await runProviderRemove(args[2]);
      return;
    }
    if (args[1] === 'enable' && args[2]) {
      await runProviderEnable(args[2]);
      return;
    }
    if (args[1] === 'disable' && args[2]) {
      await runProviderDisable(args[2]);
      return;
    }
    if (args[1] === 'list') {
      await runProviderEnhancedList();
      return;
    }
    if (args[1] === 'models' && args[2]) {
      await runProviderModelsList(args[2]);
      return;
    }
    if (args[1] === 'model' && args[2] === 'add' && args[3]) {
      await runProviderModelAdd(args[3], args[4] ?? '', args.slice(5));
      return;
    }
    if (args[1] === 'model' && args[2] === 'enable' && args[3] && args[4]) {
      await runProviderModelEnable(args[3], args[4]);
      return;
    }
    if (args[1] === 'model' && args[2] === 'disable' && args[3] && args[4]) {
      await runProviderModelDisable(args[3], args[4]);
      return;
    }
    if (args[1] === 'status' && args[2]) {
      console.log(`${GRAY}Checking provider status...${RESET}`);
      return;
    }
    console.log(`${GOLD}Usage:${RESET}`);
    console.log(`  vestara provider add <id>            Register a new provider`);
    console.log(`  vestara provider add-local [name]    Register a local provider (Ollama defaults)`);
    console.log(`  vestara provider remove <id>         Remove a provider`);
    console.log(`  vestara provider enable <id>         Enable a provider`);
    console.log(`  vestara provider disable <id>        Disable a provider`);
    console.log(`  vestara provider list                List registered providers`);
    console.log(`  vestara provider status <id>         Show provider health`);
    console.log(`  vestara provider models <id>         List models for a provider`);
    console.log(`  vestara provider model add <pid> <mid>  Add a model to a provider`);
    console.log(`  vestara provider model enable <pid> <mid>   Enable a model`);
    console.log(`  vestara provider model disable <pid> <mid>  Disable a model`);
    return;
  }

  if (args[0] === 'projects') {
    await runProjectsList();
    return;
  }

  if (args[0] === 'completions') {
    await runCompletions(args[1]);
    return;
  }

  if (args[0] === 'plan' || args[0] === 'plans') {
    if (args[1] === 'show' && args[2]) {
      await runPlanShow(args[2]);
      return;
    }
    if (args[1] === 'approve' && args[2]) {
      await runPlanApprove(args[2]);
      return;
    }
    if (args[1] === 'delete' && args[2]) {
      await runPlanDelete(args[2]);
      return;
    }
    if (args[1] === 'create' && args[2]) {
      await runPlanCreate(args.slice(2).join(' '));
      return;
    }
    if (args[1] === 'status' && args[2] && args[3]) {
      await runPlanUpdateStatus(args[2], args[3]);
      return;
    }
    await runPlansList(args.slice(1));
    return;
  }

  if (args[0] === 'task') {
    if (args[1] === 'create' && args[2]) {
      const { runTaskCreate } = await import('./commands/task.js');
      await runTaskCreate(args[2]);
      return;
    }
    if (args[1] === 'assign' && args[2] && args[3]) {
      const { runTaskAssign } = await import('./commands/task.js');
      await runTaskAssign(args[2], args[3]);
      return;
    }
    if (args[1] === 'prioritize' && args[2] && args[3]) {
      const { runTaskPrioritize } = await import('./commands/task.js');
      await runTaskPrioritize(args[2], args[3]);
      return;
    }
    if (args[1] === 'comment' && args[2] && args[3]) {
      const { runTaskComment } = await import('./commands/task.js');
      await runTaskComment(args[2], args.slice(3).join(' '));
      return;
    }
    if (args[1] === 'list' && args[2]) {
      const { runPlanShow } = await import('./commands/plans.js');
      await runPlanShow(args[2]);
      return;
    }
    console.log(`${GOLD}Usage:${RESET}`);
    console.log(`  vestara task list <plan-id>       List tasks in a plan`);
    console.log(`  vestara task create <plan-id>     Create a new task in a plan`);
    console.log(`  vestara task assign <plan-id> <task> Assign a task to an agent or team`);
    console.log(`  vestara task prioritize <plan-id> <task> Set task priority`);
    console.log(`  vestara task comment <plan-id> <task> Add a comment to a task`);
    return;
  }

  if (args[0] === 'context') {
    await runContext();
    return;
  }

  if (args[0] === 'architecture') {
    await runArchitecture(args.slice(1));
    return;
  }

  if (args[0] === 'blueprint' && args[1] === 'verify') {
    await runBlueprintVerify();
    return;
  }

  if (args[0] === 'ops') {
    await runOps(args.slice(1));
    return;
  }

  // Unknown command
  if (args.length > 0 && args[0] !== '--watch' && args[0] !== '-w') {
    console.log(`${RED}Unknown command: ${args[0]}${RESET}`);
    console.log(`${GRAY}Run 'vestara --help' to see available commands.${RESET}\n`);
    process.exitCode = 1;
    return;
  }

  // Conversational REPL boot
  console.log();
  console.log(`${BOLD}${GOLD}Vestara Runtime v0.4${RESET}`);
  console.log(`${GRAY}─────────────────────────────────────${RESET}`);
  console.log();

  let ctx: CliContext;
  try {
    ctx = await createCliContext();
  } catch (error: any) {
    console.log(`${RED}Fatal: Unable to initialize runtime${RESET}`);
    console.log(`  ${GRAY}${error?.message ?? error}${RESET}`);
    console.log(`${GRAY}  Starting basic interactive mode...${RESET}\n`);
    await startBasicRepl();
    return;
  }

  const {
    kernel,
    stateRuntime,
    conversationService: routedConversationService,
    conversationEngine,
    conversationId,
    audioService,
    sttService,
    ttsService,
    workspaceRuntime,
    workspaceHealth,
  } = ctx;

  process.stdout.write(`${renderStatus(true, 'Initializing Kernel...')}\n`);
  process.stdout.write(`${renderStatus(true, 'Loading Configuration...')}\n`);
  process.stdout.write(`${renderStatus(true, 'Starting Logger...')}\n`);
  process.stdout.write(`${renderStatus(true, 'Starting Metrics...')}\n`);
  process.stdout.write(`${renderStatus(true, 'Starting Event Bus...')}\n`);
  process.stdout.write(`${renderStatus(true, 'Registering Services...')}\n`);
  process.stdout.write(`${renderStatus(true, 'Loading Provider Runtime...')}\n`);
  process.stdout.write(`${renderStatus(true, 'Starting State Runtime...')}\n`);
  process.stdout.write(`${renderStatus(true, 'Restoring Runtime State...')}\n`);
  process.stdout.write(`${renderStatus(true, 'Starting Conversation Engine...')}\n`);
  process.stdout.write(`${renderStatus(true, 'Checking for User Profile...')}\n`);
  process.stdout.write(`${renderStatus(true, 'Starting Activity Log...')}\n`);
  process.stdout.write(`${renderStatus(true, 'Initializing Audio Services...')}\n`);
  process.stdout.write(`${renderStatus(true, 'Starting Workspace Runtime...')}\n`);
  process.stdout.write(`${renderStatus(true, 'Performing Health Checks...')}\n`);

  try {
    const profile = workspaceRuntime.profile;
    console.log();
    console.log(`${GRAY}Workspace: ${BOLD}${profile.name}${RESET}`);
    console.log(`  ${GRAY}Language: ${profile.primaryLanguage.name}${RESET}`);
    if (profile.frameworks.length > 0)
      console.log(`  ${GRAY}Framework: ${profile.frameworks.map((f: any) => f.name).join(', ')}${RESET}`);
    if (profile.packageManager) console.log(`  ${GRAY}Package Manager: ${profile.packageManager.name}${RESET}`);
    if (workspaceHealth.isGitRepository)
      console.log(`  ${GRAY}Git: ${profile.identity.gitBranch ?? 'detected'}${RESET}`);
  } catch {}

  console.log();
  const healthStatus = await kernel.diagnose();
  if (healthStatus.health.overall === 'healthy') console.log(`${GREEN}Runtime Healthy${RESET}`);
  else if (healthStatus.health.overall === 'degraded') {
    console.log(`${GOLD}Runtime Degraded${RESET}`);
    for (const s of healthStatus.services) {
      if (s.health !== 'healthy') console.log(`  ${GOLD}⚠${RESET} ${s.id}: ${s.health}`);
    }
  } else {
    console.log(`${RED}Runtime Unhealthy${RESET}`);
    process.exitCode = 1;
  }

  const providers = kernel.providerManager?.listProviders() ?? [];
  if (providers.length > 0) {
    console.log(`${GRAY}Providers:${RESET}`);
    for (const p of providers) {
      const icon =
        p.status === 'available'
          ? `${GREEN}✓${RESET}`
          : p.status === 'degraded'
            ? `${GOLD}⚠${RESET}`
            : `${RED}✗${RESET}`;
      console.log(`  ${icon} ${p.name} ${GRAY}(${p.modelCount} models)${RESET}`);
    }
    console.log();
  }

  const greeting = await conversationEngine.getGreeting();
  console.log(`${BOLD}Vestara${RESET}: ${greeting}`);
  console.log();

  const audioStatus = await audioService.diagnose();
  const audioIcon = audioStatus.microphone.available ? `${GREEN}✓${RESET}` : `${GRAY}○${RESET}`;
  console.log(
    `  ${GRAY}Audio: ${audioIcon} Mic${RESET}${audioStatus.vad.status !== 'idle' ? ` ${GREEN}✓${RESET} VAD` : ''}${audioStatus.stt.available ? ` ${GREEN}✓${RESET} STT` : ''}${audioStatus.tts.available ? ` ${GREEN}✓${RESET} TTS` : ''}`,
  );
  console.log();
  console.log(`${GRAY}Ready.${RESET}`);
  console.log();

  (globalThis as any).__vestara_kernel = kernel;
  (globalThis as any).__vestara_conversation = { service: routedConversationService, id: conversationId };
  (globalThis as any).__vestara_state = stateRuntime;
  (globalThis as any).__vestara_conversation_engine = conversationEngine;
  (globalThis as any).__vestara_audio = audioService;
  (globalThis as any).__vestara_stt = sttService;
  (globalThis as any).__vestara_tts = ttsService;
  (globalThis as any).__vestara_workspace = workspaceRuntime;
  (globalThis as any).__vestara_action = ctx.actionRuntime;

  if (args.includes('--no-repl') || args.includes('--once')) {
    await ctx.close();
  } else {
    await startRepl(ctx);
  }
}

export async function startRepl(ctx: CliContext): Promise<void> {
  const { kernel, conversationService, conversationId, conversationEngine, workspaceRuntime } = ctx;
  const profile = workspaceRuntime.profile;
  const projectName = profile.name;

  const readline = (await import('node:readline')).default;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${GOLD}${projectName}${RESET} > `,
  });

  rl.prompt();

  rl.on('line', async (line: string) => {
    const input = line.trim();
    if (input === 'exit' || input === 'quit') {
      await ctx.close();
      rl.close();
      return;
    }
    if (input === 'health' || input === 'status') {
      const diag: any = await kernel.diagnose();
      console.log(`  Status: ${diag.status}`);
      console.log(`  Uptime: ${diag.uptime}s`);
      console.log(
        `  Health: ${diag.health.overall} (${diag.health.healthyCount}/${diag.health.totalServices} healthy)`,
      );
      console.log(`  Memory: ${diag.resources.memory.heapUsed}MB / ${diag.resources.memory.heapTotal}MB`);
      console.log(
        `  Workspace: ${ctx.workspaceHealth.indexedFiles} files, ${ctx.workspaceHealth.isGitRepository ? 'git' : 'no git'}`,
      );
      rl.prompt();
      return;
    }
    if (input === 'workspace') {
      const p = workspaceRuntime.profile;
      console.log(`  Project: ${BOLD}${p.name}${RESET}`);
      console.log(`  Root: ${p.identity.rootPath}`);
      console.log(`  Language: ${p.primaryLanguage.name}`);
      if (p.frameworks.length > 0) console.log(`  Frameworks: ${p.frameworks.map((f: any) => f.name).join(', ')}`);
      if (p.packageManager) console.log(`  Package Manager: ${p.packageManager.name}`);
      console.log(`  Files Indexed: ${workspaceRuntime.index.totalFiles}`);
      console.log(`  Git: ${workspaceRuntime.git.isRepository ? (workspaceRuntime.git.branch() ?? 'yes') : 'no'}`);
      rl.prompt();
      return;
    }
    if (input === 'profile' && conversationEngine) {
      const p = await conversationEngine.getProfile();
      if (p) {
        console.log(`  Name:              ${p.name ?? '(not set)'}`);
        console.log(`  Role:              ${p.role ?? '(not set)'}`);
        console.log(`  Experience:        ${p.experience ?? '(not set)'}`);
        console.log(`  Preferred Stack:   ${(p.preferredStack ?? []).join(', ') || '(not set)'}`);
        console.log(`  Communication:     ${p.communicationStyle}`);
        console.log(`  Goals:             ${(p.goals ?? []).join(', ') || '(none)'}`);
        console.log(`  Conversations:     ${p.conversationCount}`);
        console.log(`  Since:             ${p.createdAt}`);
      } else console.log(`  ${GRAY}No profile found.${RESET}`);
      rl.prompt();
      return;
    }
    if (input.startsWith('!')) {
      const cmd = input.slice(1).trim();
      if (!cmd) {
        console.log(`${GRAY}  Usage: !<shell command>${RESET}`);
        rl.prompt();
        return;
      }
      try {
        const { execSync } = await import('node:child_process');
        const result = execSync(cmd, { cwd: workspaceRuntime.filesystem.pwd(), encoding: 'utf-8', timeout: 30000 });
        console.log(result.trim() || `${GRAY}(empty output)${RESET}`);
      } catch (error: any) {
        console.log(error.stdout?.toString()?.trim() || error.stderr?.toString()?.trim() || error.message);
      }
      rl.prompt();
      return;
    }
    if (input === 'help') {
      console.log('  Commands: health, status, workspace, history, profile, !<cmd>, help, exit, quit');
      rl.prompt();
      return;
    }
    if (input === 'history') {
      if (conversationId && conversationService) {
        const conv = conversationService.getConversation(conversationId);
        if (conv) {
          console.log(`${GRAY}Conversation: ${conv.title} (${conv.messages.length} messages)${RESET}`);
          for (const msg of conv.messages) {
            const role = msg.role === 'user' ? 'You' : 'Vestara';
            console.log(
              `  ${BOLD}${role}${RESET}: ${msg.content.slice(0, 100)}${msg.content.length > 100 ? '...' : ''}`,
            );
          }
        }
      }
      rl.prompt();
      return;
    }
    if (input) {
      if (conversationService && conversationId) {
        process.stdout.write('\n');
        try {
          for await (const chunk of conversationService.sendMessageStream(conversationId, input)) {
            if (chunk.type === 'text' && chunk.content) process.stdout.write(chunk.content);
            else if (chunk.type === 'error' && chunk.content)
              process.stdout.write(`\n${RED}Error: ${chunk.content}${RESET}\n`);
          }
          process.stdout.write('\n\n');
        } catch (err: any) {
          const m = err?.message ?? '';
          if (m.includes('429') || m.includes('rate limit') || m.includes('FreeUsageLimitError')) {
            process.stdout.write(
              `\n${RED}Rate limit exceeded.${RESET}\n\n  ${GOLD}Options:${RESET}\n    ${BOLD}1.${RESET} Wait a few minutes\n    ${BOLD}2.${RESET} Use a local provider: vestara provider add-local ollama\n    ${BOLD}3.${RESET} Add: vestara provider add <id> --base-url <url>\n\n`,
            );
          } else process.stdout.write(`\n${RED}Error: ${m}${RESET}\n\n`);
        }
      } else process.stdout.write(`\n${GRAY}Conversation service not available.${RESET}\n\n`);
      rl.prompt();
      return;
    }
    rl.prompt();
  });

  rl.on('close', () => {
    console.log();
    ctx.close().catch(() => {});
    process.exit(0);
  });
}

export async function startBasicRepl(): Promise<void> {
  const readline = (await import('node:readline')).default;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: `${GOLD}>${RESET} ` });
  console.log(`${GRAY}Basic mode. Type 'exit' to quit.${RESET}`);
  rl.prompt();
  rl.on('line', (line: string) => {
    const input = line.trim();
    if (input === 'exit' || input === 'quit') {
      rl.close();
      return;
    }
    if (input === 'help') {
      console.log('  Commands: help, exit, quit');
    } else {
      console.log(`${GRAY}Runtime not available. Run without --no-repl for full features.${RESET}`);
    }
    rl.prompt();
  });
  rl.on('close', () => process.exit(0));
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exitCode = 1;
});
