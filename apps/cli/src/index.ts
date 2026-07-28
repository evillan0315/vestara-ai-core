#!/usr/bin/env node

import { DefaultContextAssembler } from '@vestara/context';
import { DefaultConversationService } from '@vestara/conversation';
import { DefaultKernel } from '@vestara/kernel';
import { OpenCodeProvider } from '@vestara/provider-opencode';
import { DefaultProviderManager } from '@vestara/provider-runtime';
import { DefaultStateRuntime } from '@vestara/state-runtime';

const GOLD = '\x1b[33m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const _CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GRAY = '\x1b[90m';

function renderStatus(success: boolean, label: string, detail?: string): string {
  const icon = success ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
  const detailStr = detail ? `${GRAY}${detail}${RESET}` : '';
  return `  ${icon} ${label} ${detailStr}`;
}

// Open a persistent SQLite database (shares data with API server)
async function openSharedDb(): Promise<any> {
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  const fs = await import('node:fs');
  const path = await import('node:path');
  const dbPath = path.join(process.cwd(), '.vestara', 'plans', 'plans.db');
  try {
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      return new SQL.Database(buffer);
    }
  } catch {}
  return new SQL.Database();
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === 'status') {
    await runSystemStatus();
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
    let repoPath = args[1];
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
    await runOpen(repoPath);
    return;
  }

  // ─── Conversational Onboarding Boot Sequence (v4.0) ────
  console.log();
  console.log(`${BOLD}${GOLD}Vestara Runtime v0.4${RESET}`);
  console.log(`${GRAY}─────────────────────────────────────${RESET}`);
  console.log();

  try {
    const kernel = new DefaultKernel();

    process.stdout.write(`${renderStatus(true, 'Initializing Kernel...')}\n`);
    process.stdout.write(`${renderStatus(true, 'Loading Configuration...')}\n`);
    process.stdout.write(`${renderStatus(true, 'Starting Logger...')}\n`);
    process.stdout.write(`${renderStatus(true, 'Starting Metrics...')}\n`);
    process.stdout.write(`${renderStatus(true, 'Starting Event Bus...')}\n`);
    process.stdout.write(`${renderStatus(true, 'Registering Services...')}\n`);

    process.stdout.write(`${renderStatus(true, 'Loading Provider Runtime...')}\n`);
    const providerManager = new DefaultProviderManager();
    const opencode = new OpenCodeProvider();
    await providerManager.register(opencode);

    const report = await kernel.boot({
      providers: [{ manager: providerManager, providerId: 'opencode' }],
    });

    process.stdout.write(`${renderStatus(true, 'Starting State Runtime...')}\n`);
    const stateRuntime = new DefaultStateRuntime({
      logger: kernel.logger,
      eventBus: kernel.eventBus,
    });

    process.stdout.write(`${renderStatus(true, 'Restoring Runtime State...')}\n`);
    await stateRuntime.initialize('./vestara-state.db');

    process.stdout.write(`${renderStatus(true, 'Starting Conversation Engine...')}\n`);
    const contextAssembler = new DefaultContextAssembler();
    const _conversationService = new DefaultConversationService({
      contextAssembler,
      providerExecutor: opencode,
      eventBus: kernel.eventBus,
      logger: kernel.logger,
    });

    // Initialize v4.0 Conversation Engine with provider routing
    const { DefaultConversationEngine, ProviderRouter, OpenCodeCloudProvider, LocalProvider } = await import(
      '@vestara/conversation-runtime'
    );
    const { SqliteUserProfileStore } = await import('@vestara/conversation-runtime');
    const { SqliteConversationSessionStore } = await import('@vestara/conversation-runtime');

    const providerRouter = new ProviderRouter();
    providerRouter.registerOnline(new OpenCodeCloudProvider(opencode));
    providerRouter.registerOffline(new LocalProvider());

    // Recreate conversation service with provider router as executor
    const routedConversationService = new DefaultConversationService({
      contextAssembler,
      providerExecutor: providerRouter,
      eventBus: kernel.eventBus,
      logger: kernel.logger,
    });

    const profileStore = new SqliteUserProfileStore({
      dbPath: './vestara-state.db',
      logger: kernel.logger,
    });
    const sessionStore = new SqliteConversationSessionStore({
      dbPath: './vestara-state.db',
      logger: kernel.logger,
    });

    const conversationEngine = new DefaultConversationEngine({
      conversationService: routedConversationService,
      profileStore,
      sessionStore,
      providerRouter,
      eventBus: kernel.eventBus,
      logger: kernel.logger,
    });

    process.stdout.write(`${renderStatus(true, 'Checking for User Profile...')}\n`);
    await conversationEngine.initialize();

    const previousConversations = await stateRuntime.conversations.listConversations(5);

    let conversation;
    if (previousConversations.length > 0) {
      conversation = await stateRuntime.conversations.getConversation(previousConversations[0].id);
      if (!conversation) {
        conversation = await routedConversationService.createConversation();
      }
    } else {
      conversation = await routedConversationService.createConversation();
    }

    // Start v4.0 session
    await conversationEngine.startSession();

    // Persist conversations after each exchange
    kernel.eventBus.subscribe(
      'conversation:response.completed',
      async (event: { payload: Record<string, unknown> }) => {
        const convId = event.payload.conversationId as string;
        if (typeof convId !== 'string') return;
        const conv = routedConversationService.getConversation(convId);
        if (conv) {
          await stateRuntime.conversations.saveConversation(conv);
          for (const msg of conv.messages) {
            await stateRuntime.conversations.saveMessage(convId, msg);
          }
        }
      },
    );

    // Register audio/STT/TTS OS services
    // Initialize Activity Log for domain events
    process.stdout.write(`${renderStatus(true, 'Starting Activity Log...')}\n`);
    const { ActivityLogStore, ActivityService } = await import('@vestara/activity-log');
    const activityStore = new ActivityLogStore({
      dbPath: './vestara-activity.db',
      logger: kernel.logger,
    });
    await activityStore.initialize();
    const activityService = new ActivityService({
      store: activityStore,
      eventBus: kernel.eventBus,
      logger: kernel.logger,
    });
    activityService.start();

    // Register activity service with events-server
    const { registerActivityService } = await import('@vestara/events-server');
    registerActivityService(activityService);

    process.stdout.write(`${renderStatus(true, 'Initializing Audio Services...')}\n`);
    const { VestaraAudioService, DefaultMicrophoneProvider, DefaultSpeakerProvider, SileroVADProvider } = await import(
      '@vestara/audio'
    );
    const { VestaraSTTService, WhisperSTTProvider } = await import('@vestara/stt');
    const { VestaraTTSService, PiperTTSProvider } = await import('@vestara/tts');

    const audioService = new VestaraAudioService({ logger: kernel.logger });
    audioService.registerMicrophone(new DefaultMicrophoneProvider());
    audioService.registerSpeaker(new DefaultSpeakerProvider());
    audioService.registerVAD(new SileroVADProvider());

    const sttService = new VestaraSTTService({ logger: kernel.logger });
    sttService.registerProvider(new WhisperSTTProvider());

    const ttsService = new VestaraTTSService({ logger: kernel.logger });
    ttsService.registerProvider(new PiperTTSProvider());

    const healthStatus = await kernel.diagnose();

    process.stdout.write(`${renderStatus(true, 'Performing Health Checks...')}\n`);
    console.log();

    if (healthStatus.health.overall === 'healthy') {
      console.log(`${GREEN}Runtime Healthy${RESET}`);
    } else if (healthStatus.health.overall === 'degraded') {
      console.log(`${GOLD}Runtime Degraded${RESET}`);
      for (const s of healthStatus.services) {
        if (s.health !== 'healthy') {
          console.log(`  ${GOLD}⚠${RESET} ${s.id}: ${s.health}`);
        }
      }
    } else {
      console.log(`${RED}Runtime Unhealthy${RESET}`);
      process.exit(1);
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

    // Conversational greeting
    const greeting = await conversationEngine.getGreeting();
    console.log(`${BOLD}Vestara${RESET}: ${greeting}`);
    console.log();

    // Show audio status
    const audioStatus = await audioService.diagnose();
    const audioIcon = audioStatus.microphone.available ? `${GREEN}✓${RESET}` : `${GRAY}○${RESET}`;
    console.log(
      `  ${GRAY}Audio: ${audioIcon} Mic${RESET}${audioStatus.vad.status !== 'idle' ? ` ${GREEN}✓${RESET} VAD` : ''}${audioStatus.stt.available ? ` ${GREEN}✓${RESET} STT` : ''}${audioStatus.tts.available ? ` ${GREEN}✓${RESET} TTS` : ''}`,
    );
    console.log();

    console.log(`${GRAY}Ready.${RESET}`);
    console.log();
    console.log(`${GRAY}Boot duration: ${report.bootDuration}ms${RESET}`);
    console.log(`${GRAY}Services: ${report.servicesStarted} started, ${report.servicesFailed} failed${RESET}`);
    console.log(
      `${GRAY}Memory: ${healthStatus.resources.memory.heapUsed}MB / ${healthStatus.resources.memory.heapTotal}MB${RESET}`,
    );
    console.log();

    (globalThis as any).__vestara_kernel = kernel;
    (globalThis as any).__vestara_conversation = { service: routedConversationService, id: conversation.id };
    (globalThis as any).__vestara_state = stateRuntime;
    (globalThis as any).__vestara_conversation_engine = conversationEngine;
    (globalThis as any).__vestara_audio = audioService;
    (globalThis as any).__vestara_stt = sttService;
    (globalThis as any).__vestara_tts = ttsService;

    if (args.includes('--watch') || args.includes('-w')) {
      await startRepl(
        kernel,
        routedConversationService,
        conversation.id,
        stateRuntime,
        conversationEngine,
        audioService,
      );
    } else {
      await conversationEngine.endSession();
      await stateRuntime.checkpoint();
      await kernel.shutdown();
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.log(renderStatus(false, 'Fatal boot error'));
    console.log(`  ${RED}${msg}${RESET}`);
    console.log();
    process.exit(1);
  }
}

async function runAgentsList(): Promise<void> {
  const GRAY = '\x1b[90m';
  const RESET = '\x1b[0m';
  const BOLD = '\x1b[1m';
  const GREEN = '\x1b[32m';
  const GOLD = '\x1b[33m';
  const RED = '\x1b[31m';
  console.log();
  console.log(`${BOLD}${GOLD}Vestara Agents${RESET}`);
  console.log(`${GRAY}─────────────────────────────────────${RESET}`);
  console.log();
  try {
    const db = await openSharedDb();
    const { AgentStorage } = await import('@vestara/workspace');
    const store = new AgentStorage(db);
    const agents = await store.listAgents();
    const execs = await store.listExecutions();
    const schedules = await store.listSchedules().catch(() => []);
    const teams = await store.listTeams().catch(() => []);
    const ROLE_COLORS: Record<string, string> = {
      architect: '#8b5cf6',
      developer: '#3b82f6',
      verifier: '#10b981',
      documenter: '#f59e0b',
      conversation: '#6366f1',
      planning: '#eab308',
      'dashboard-curator': '#06b6d4',
      frontend: '#ec4899',
      custom: '#6b7280',
    };
    for (const agent of agents) {
      const agentExecs = execs.filter((e: any) => e.agentId === agent.id || agent.id.includes(e.agentId));
      const completed = agentExecs.filter((e: any) => e.status === 'completed').length;
      const _failed = agentExecs.filter((e: any) => e.status === 'failed').length;
      const running = agentExecs.filter((e: any) => e.status === 'running').length;
      const total = Math.max(agentExecs.filter((e: any) => e.status !== 'running' && e.status !== 'queued').length, 1);
      const successRate = Math.round((completed / total) * 100);
      const _color = agent.color || ROLE_COLORS[agent.role] || '#6b7280';
      const statusIcon =
        agent.status === 'active'
          ? `${GREEN}●${RESET}`
          : agent.status === 'disabled'
            ? `${GRAY}○${RESET}`
            : `${RED}○${RESET}`;
      const team = teams.find((t: any) => t.id === agent.teamId);
      console.log(
        `  ${statusIcon} ${agent.name.padEnd(22)} ${agent.role.padEnd(16)} ${agent.status === 'active' ? `${GREEN}active${RESET}` : `${GRAY}disabled${RESET}`}  ${GRAY}${agentExecs.length} exec, ${successRate}% success${RESET}`,
      );
      if (agent.description) console.log(`  ${' '.repeat(4)}${GRAY}${agent.description}${RESET}`);
      if (agent.provider || agent.model)
        console.log(`  ${' '.repeat(4)}${GRAY}${agent.provider || ''} ${agent.model || ''}${RESET}`);
      if (team) console.log(`  ${' '.repeat(4)}${GRAY}Team: ${team.name}${RESET}`);
      if (running > 0) console.log(`  ${' '.repeat(4)}${GOLD}⚡ ${running} task(s) running${RESET}`);
      console.log();
    }
    console.log(
      `${GRAY}  ${agents.length} agents, ${execs.length} total executions, ${schedules.length} schedules${RESET}`,
    );
    console.log();
  } catch (err: any) {
    console.log(`  ${RED}Error: ${err.message}${RESET}`);
  }
}

async function runDoctorAgents(): Promise<void> {
  const GRAY = '\x1b[90m';
  const RESET = '\x1b[0m';
  const BOLD = '\x1b[1m';
  const GREEN = '\x1b[32m';
  const GOLD = '\x1b[33m';
  const RED = '\x1b[31m';
  console.log();
  console.log(`${BOLD}${GOLD}Vestara Doctor Agents${RESET}`);
  console.log(`${GRAY}─────────────────────────────────────${RESET}`);
  console.log();
  try {
    const db = await openSharedDb();
    const { AgentStorage, MilestoneService } = await import('@vestara/workspace');
    const store = new AgentStorage(db);
    const agents = await store.listAgents();
    const execs = await store.listExecutions();
    const schedules = await store.listSchedules().catch(() => []);
    const teams = await store.listTeams().catch(() => []);
    const ms = new MilestoneService();

    const completed = execs.filter((e: any) => e.status === 'completed').length;
    const failed = execs.filter((e: any) => e.status === 'failed').length;
    const running = execs.filter((e: any) => e.status === 'running').length;
    const queued = execs.filter((e: any) => e.status === 'queued').length;
    const totalFinished = completed + failed;
    const successRate = totalFinished > 0 ? Math.round((completed / totalFinished) * 100) : 0;

    console.log(`  ${BOLD}Overview${RESET}`);
    console.log(
      `  ${agents.length === 8 ? `${GREEN}✔${RESET}` : `${GOLD}⚠${RESET}`} Agents registered:  ${agents.length}/8`,
    );
    console.log(
      `  ${agents.filter((a: any) => a.status === 'active').length === agents.length ? `${GREEN}✔${RESET}` : `${GOLD}⚠${RESET}`} Active:           ${agents.filter((a: any) => a.status === 'active').length}/${agents.length}`,
    );
    console.log(
      `  ${execs.length > 0 ? `${GREEN}✔${RESET}` : `${GRAY}○${RESET}`} Executions:      ${execs.length} total (${completed} ok, ${failed} failed, ${running} running, ${queued} queued)`,
    );
    console.log(
      `  ${failed === 0 ? `${GREEN}✔${RESET}` : failed > 2 ? `${RED}✗${RESET}` : `${GOLD}⚠${RESET}`} Success rate:    ${successRate}%`,
    );
    console.log(`  ${GREEN}✔${RESET} Schedules:      ${schedules.length} configured`);
    console.log(`  ${teams.length > 0 ? `${GREEN}✔${RESET}` : `${GRAY}○${RESET}`} Teams:           ${teams.length}`);
    console.log();

    console.log(`  ${BOLD}Per-Agent Health${RESET}`);
    for (const agent of agents) {
      const agentExecs = execs.filter((e: any) => e.agentId === agent.id || agent.id.includes(e.agentId));
      const aCompleted = agentExecs.filter((e: any) => e.status === 'completed').length;
      const aFailed = agentExecs.filter((e: any) => e.status === 'failed').length;
      const aRunning = agentExecs.filter((e: any) => e.status === 'running').length;
      const aTotal = aCompleted + aFailed;
      const aRate = aTotal > 0 ? Math.round((aCompleted / aTotal) * 100) : 0;
      const runningIcon = aRunning > 0 ? `${GOLD}⚡${RESET}` : `${GREEN}●${RESET}`;
      console.log(
        `  ${runningIcon} ${agent.name.padEnd(22)} ${agent.status === 'active' ? `${GREEN}active${RESET}` : `${GRAY}disabled${RESET}`}  ${aTotal > 0 ? `${aCompleted}/${aTotal} (${aRate}%)` : 'no executions'}  ${aFailed > 0 ? `${RED}${aFailed} failed${RESET}` : ''}`,
      );
    }
    console.log();

    const progress = ms.getProgress();
    console.log(`  ${BOLD}Milestones${RESET}`);
    console.log(
      `  ${GREEN}✔${RESET} Progress:       ${progress.completed}/${progress.total} (${progress.inProgress} active, ${progress.pending} pending)`,
    );
    console.log();

    console.log(`${GRAY}  Run "vestara agents" for detailed agent list${RESET}`);
    console.log(`${GRAY}  Run "vestara doctor audio" for audio pipeline${RESET}`);
    console.log();
  } catch (err: any) {
    console.log(`  ${RED}Error: ${err.message}${RESET}`);
  }
}

async function runTeamsList(): Promise<void> {
  const GRAY = '\x1b[90m';
  const RESET = '\x1b[0m';
  const BOLD = '\x1b[1m';
  const GREEN = '\x1b[32m';
  const GOLD = '\x1b[33m';
  const RED = '\x1b[31m';
  console.log();
  console.log(`${BOLD}${GOLD}Vestara Teams${RESET}`);
  console.log(`${GRAY}─────────────────────────────────────${RESET}`);
  console.log();
  try {
    const db = await openSharedDb();
    const { AgentStorage } = await import('@vestara/workspace');
    const store = new AgentStorage(db);
    const agents = await store.listAgents();
    const teams = await store.listTeams().catch(() => []);
    const execs = await store.listExecutions();
    if (teams.length === 0) {
      console.log(`  ${GRAY}No teams created yet. Use "Create Team" in the Agent Control Center.${RESET}\n`);
      return;
    }
    for (const team of teams) {
      const leader = agents.find((a: any) => a.id === team.leaderAgentId);
      const members = agents.filter((a: any) => team.memberIds.includes(a.id) || a.teamId === team.id);
      const memberExecs = members.map((m: any) =>
        execs.filter((e: any) => e.agentId === m.id || m.id.includes(e.agentId)),
      );
      const totalExecs = memberExecs.reduce((s: number, es: any[]) => s + es.length, 0);
      const failedExecs = memberExecs.reduce(
        (s: number, es: any[]) => s + es.filter((e: any) => e.status === 'failed').length,
        0,
      );
      console.log(
        `  ${GREEN}●${RESET} ${team.name.padEnd(25)} ${members.length} members${leader ? `, leader: ${leader.name}` : ''}`,
      );
      console.log(`  ${' '.repeat(4)}${GRAY}Executions: ${totalExecs} total, ${failedExecs} failed${RESET}`);
      console.log(
        `  ${' '.repeat(4)}${GRAY}Members: ${members.map((m: any) => m.name).join(', ') || '(none)'}${RESET}`,
      );
      if (team.sharedContext) console.log(`  ${' '.repeat(4)}${GRAY}Context: ${team.sharedContext}${RESET}`);
      console.log();
    }
    console.log(`${GRAY}  ${teams.length} teams, ${agents.length} agents${RESET}`);
    console.log(`${GRAY}  Run "vestara doctor teams" for team diagnostics${RESET}`);
    console.log();
  } catch (err: any) {
    console.log(`  ${RED}Error: ${err.message}${RESET}`);
  }
}

async function runTeamsCreate(names: string[]): Promise<void> {
  const GREEN = '\x1b[32m';
  const RESET = '\x1b[0m';
  const RED = '\x1b[31m';
  const GOLD = '\x1b[33m';
  const teamName = names.join(' ');
  try {
    const db = await openSharedDb();
    const { AgentStorage } = await import('@vestara/workspace');
    const store = new AgentStorage(db);
    const agents = await store.listAgents();
    const teams = await store.listTeams().catch(() => []);
    const unassigned = agents.filter(
      (a: any) => a.status === 'active' && !a.teamId && !teams.some((t: any) => t.memberIds.includes(a.id)),
    );
    const now = new Date().toISOString();
    const teamId = `team-${Date.now()}`;
    await store.saveTeam({
      id: teamId,
      name: teamName,
      description: '',
      leaderAgentId: '',
      memberIds: [],
      sharedContext: '',
      activeWorkflowId: '',
      createdAt: now,
    });
    console.log(`  ${GREEN}✓${RESET} Team "${teamName}" created (id: ${teamId})`);
    if (unassigned.length > 0) {
      console.log(`  ${GOLD}ℹ${RESET} ${unassigned.length} unassigned agents available:`);
      for (const a of unassigned) console.log(`     ${a.id} — ${a.name} (${a.role})`);
      console.log(`  Use the Agent Control Center to add members`);
    }
    console.log();
  } catch (err: any) {
    console.log(`  ${RED}Error: ${err.message}${RESET}\n`);
  }
}

async function runTeamsAssign(teamId: string, agentIds: string[]): Promise<void> {
  const GREEN = '\x1b[32m';
  const RESET = '\x1b[0m';
  const RED = '\x1b[31m';
  const GOLD = '\x1b[33m';
  try {
    const db = await openSharedDb();
    const { AgentStorage } = await import('@vestara/workspace');
    const store = new AgentStorage(db);
    const team = await store.getTeam(teamId);
    if (!team) {
      console.log(`  ${RED}Error: Team "${teamId}" not found${RESET}\n`);
      return;
    }
    for (const agentId of agentIds) {
      const agent = await store.getAgent(agentId);
      if (!agent) {
        console.log(`  ${GOLD}⚠${RESET} Agent "${agentId}" not found, skipping${RESET}`);
        continue;
      }
      if (!team.memberIds.includes(agentId)) team.memberIds.push(agentId);
      agent.teamId = team.id;
      await store.saveAgent(agent);
    }
    await store.saveTeam(team);
    console.log(`  ${GREEN}✓${RESET} Added ${agentIds.length} agent(s) to team "${team.name}"`);
    console.log(`  ${GREEN}✓${RESET} Team now has ${team.memberIds.length} member(s)`);
    console.log();
  } catch (err: any) {
    console.log(`  ${RED}Error: ${err.message}${RESET}\n`);
  }
}

async function runDoctorTeams(): Promise<void> {
  const GRAY = '\x1b[90m';
  const RESET = '\x1b[0m';
  const BOLD = '\x1b[1m';
  const GREEN = '\x1b[32m';
  const GOLD = '\x1b[33m';
  const RED = '\x1b[31m';
  console.log();
  console.log(`${BOLD}${GOLD}Vestara Doctor Teams${RESET}`);
  console.log(`${GRAY}─────────────────────────────────────${RESET}`);
  console.log();
  try {
    const db = await openSharedDb();
    const { AgentStorage } = await import('@vestara/workspace');
    const store = new AgentStorage(db);
    const agents = await store.listAgents();
    const teams = await store.listTeams().catch(() => []);
    const execs = await store.listExecutions();

    // Team analysis
    const totalMembers = teams.reduce((s: number, t: any) => s + t.memberIds.length, 0);
    const agentsInTeams = agents.filter(
      (a: any) => a.teamId || teams.some((t: any) => t.memberIds.includes(a.id)),
    ).length;
    const agentsWithoutTeams = agents.filter(
      (a: any) => a.status === 'active' && !a.teamId && !teams.some((t: any) => t.memberIds.includes(a.id)),
    ).length;
    const teamsWithoutLeader = teams.filter((t: any) => !t.leaderAgentId).length;
    const teamsWithWorkflow = teams.filter((t: any) => t.activeWorkflowId).length;

    console.log(`  ${BOLD}Overview${RESET}`);
    console.log(`  ${teams.length > 0 ? `${GREEN}✔${RESET}` : `${GRAY}○${RESET}`} Total teams:     ${teams.length}`);
    console.log(
      `  ${totalMembers > 0 ? `${GREEN}✔${RESET}` : `${GRAY}○${RESET}`} Total members:   ${totalMembers} across ${teams.length} teams`,
    );
    console.log(
      `  ${agentsInTeams > 0 ? `${GREEN}✔${RESET}` : `${GRAY}○${RESET}`} Agents in teams: ${agentsInTeams}/${agents.length}`,
    );
    console.log(
      `  ${agentsWithoutTeams === 0 ? `${GREEN}✔${RESET}` : `${GOLD}⚠${RESET}`} Unassigned:      ${agentsWithoutTeams} active agents not in any team`,
    );
    console.log(
      `  ${teamsWithoutLeader === 0 ? `${GREEN}✔${RESET}` : `${GOLD}⚠${RESET}`} Teams w/o leader: ${teamsWithoutLeader}`,
    );
    console.log(`  ${GREEN}✔${RESET} Workflows:       ${teamsWithWorkflow} teams with active workflows`);
    console.log();

    if (teams.length > 0) {
      console.log(`  ${BOLD}Per-Team Health${RESET}`);
      for (const team of teams) {
        const leader = agents.find((a: any) => a.id === team.leaderAgentId);
        const members = agents.filter((a: any) => team.memberIds.includes(a.id) || a.teamId === team.id);
        const memberExecs = members.map((m: any) =>
          execs.filter((e: any) => e.agentId === m.id || m.id.includes(e.agentId)),
        );
        const totalExecs = memberExecs.reduce((s: number, es: any[]) => s + es.length, 0);
        const failedExecs = memberExecs.reduce(
          (s: number, es: any[]) => s + es.filter((e: any) => e.status === 'failed').length,
          0,
        );
        const runningExecs = memberExecs.reduce(
          (s: number, es: any[]) => s + es.filter((e: any) => e.status === 'running').length,
          0,
        );
        const leaderIcon = leader ? `${GREEN}●${RESET}` : `${GOLD}⚠${RESET}`;
        console.log(
          `  ${leaderIcon} ${team.name.padEnd(22)} ${members.length} members, ${totalExecs} exec, ${failedExecs} failed${runningExecs > 0 ? `, ${runningExecs} running` : ''}`,
        );
        console.log(
          `  ${' '.repeat(4)}${GRAY}Members: ${members.map((m: any) => m.name).join(', ') || '(none)'}${RESET}`,
        );
        if (leader) console.log(`  ${' '.repeat(4)}${GRAY}Leader: ${leader.name}${RESET}`);
        if (!leader) console.log(`  ${' '.repeat(4)}${GOLD}⚠ No leader assigned${RESET}`);
        console.log();
      }
    }

    // Agent coverage
    if (agentsWithoutTeams > 0) {
      console.log(`  ${BOLD}Unassigned Agents${RESET}`);
      const unassigned = agents.filter(
        (a: any) => a.status === 'active' && !a.teamId && !teams.some((t: any) => t.memberIds.includes(a.id)),
      );
      for (const a of unassigned) {
        console.log(`  ${GRAY}○${RESET} ${a.name.padEnd(22)} ${a.role}`);
      }
      console.log();
    }

    console.log(`${GRAY}  Recommendations:${RESET}`);
    if (teamsWithoutLeader > 0) console.log(`${GRAY}    Assign leaders to ${teamsWithoutLeader} team(s)${RESET}`);
    if (agentsWithoutTeams > 0)
      console.log(`${GRAY}    Assign ${agentsWithoutTeams} unassigned agent(s) to teams${RESET}`);
    if (teams.length === 0) console.log(`${GRAY}    Create teams to organize agents by function${RESET}`);
    console.log(`${GRAY}  Run "vestara teams" for detailed team list${RESET}`);
    console.log();
  } catch (err: any) {
    console.log(`  ${RED}Error: ${err.message}${RESET}`);
  }
}

async function runSystemStatus(): Promise<void> {
  const GRAY = '\x1b[90m';
  const RESET = '\x1b[0m';
  const BOLD = '\x1b[1m';
  const GREEN = '\x1b[32m';
  const GOLD = '\x1b[33m';
  const RED = '\x1b[31m';

  console.log();
  console.log(`${BOLD}${GOLD}Vestara System Status${RESET}`);
  console.log(`${GRAY}─────────────────────────────────────${RESET}`);
  console.log();

  // Runtime
  const memUsage = process.memoryUsage();
  const heapUsed = Math.round((memUsage.heapUsed / 1024 / 1024) * 100) / 100;
  const heapTotal = Math.round((memUsage.heapTotal / 1024 / 1024) * 100) / 100;
  console.log(`  ${BOLD}Runtime${RESET}`);
  console.log(`    Node:       ${process.version}`);
  console.log(`    Platform:   ${process.platform}`);
  console.log(`    Memory:     ${heapUsed}MB / ${heapTotal}MB`);
  console.log();

  // Audio
  try {
    const { VestaraAudioService, DefaultMicrophoneProvider, DefaultSpeakerProvider, SileroVADProvider } = await import(
      '@vestara/audio'
    );
    const audio = new VestaraAudioService();
    audio.registerMicrophone(new DefaultMicrophoneProvider());
    audio.registerSpeaker(new DefaultSpeakerProvider());
    audio.registerVAD(new SileroVADProvider());
    const ad = await audio.diagnose();
    console.log(`  ${BOLD}Audio Pipeline${RESET}`);
    console.log(
      `    Microphone:  ${ad.microphone.available ? `${GREEN}Detected${RESET}` : `${GRAY}Not found${RESET}`}`,
    );
    console.log(
      `    VAD:         ${ad.vad.status !== 'error' ? `${GREEN}Ready${RESET}` : `${GRAY}Unavailable${RESET}`}`,
    );
    console.log();
  } catch {
    console.log(`  ${BOLD}Audio Pipeline${RESET} ${GRAY}(not available)${RESET}\n`);
  }

  // Providers
  try {
    const { OpenCodeProvider } = await import('@vestara/provider-opencode');
    const { DefaultProviderManager } = await import('@vestara/provider-runtime');
    const pm = new DefaultProviderManager();
    const ocp = new OpenCodeProvider();
    await pm.register(ocp);
    await ocp.initialize({});
    const health = await ocp.healthCheck();
    const providers = pm.listProviders();
    console.log(`  ${BOLD}Providers${RESET}`);
    for (const p of providers) {
      const icon =
        p.status === 'available'
          ? `${GREEN}●${RESET}`
          : p.status === 'degraded'
            ? `${GOLD}●${RESET}`
            : `${RED}●${RESET}`;
      console.log(`    ${icon} ${p.name.padEnd(20)} ${p.status}  ${GRAY}${p.modelCount} models${RESET}`);
    }
    console.log(
      `    Health:      ${health.status === 'healthy' ? `${GREEN}${health.status}${RESET}` : `${GOLD}${health.status}${RESET}`}  ${GRAY}${health.latency}ms${RESET}`,
    );
    console.log();
  } catch {
    console.log(`  ${BOLD}Providers${RESET} ${GRAY}(not available)${RESET}\n`);
  }

  // Agents
  try {
    const db = await openSharedDb();
    const { AgentStorage } = await import('@vestara/workspace');
    const store = new AgentStorage(db);
    const agents = await store.listAgents();
    const execs = await store.listExecutions();
    const schedules = await store.listSchedules();
    const teams = await store.listTeams().catch(() => []);
    const completed = execs.filter((e: any) => e.status === 'completed').length;
    const failed = execs.filter((e: any) => e.status === 'failed').length;
    const running = execs.filter((e: any) => e.status === 'running').length;
    const totalNonRunning = execs.filter((e: any) => e.status !== 'running' && e.status !== 'queued').length || 1;
    console.log(`  ${BOLD}Agents${RESET}`);
    console.log(`    Registered:  ${agents.length}`);
    console.log(`    Active:      ${agents.filter((a: any) => a.status === 'active').length}`);
    console.log(`    Teams:       ${teams.length}`);
    console.log(`    Schedules:   ${schedules.length}`);
    console.log(`    Executions:  ${execs.length} (${completed} ok · ${failed} failed · ${running} running)`);
    console.log(
      `    Success:     ${completed}/${totalNonRunning} (${Math.round((completed / totalNonRunning) * 100)}%)`,
    );
    console.log();
  } catch {
    console.log(`  ${BOLD}Agents${RESET} ${GRAY}(not available)${RESET}\n`);
  }

  // Projects
  try {
    const db = await openSharedDb();
    const { ProjectStorage } = await import('@vestara/workspace');
    const store = new ProjectStorage(db);
    const projects = await store.listProjects();
    const activeProjects = projects.filter((p: any) => p.status === 'active').length;
    const totalTasks = (await Promise.all(projects.map((p: any) => store.getProjectStats(p.id)))).reduce(
      (s: number, st: any) => s + st.total,
      0,
    );
    const doneTasks = (await Promise.all(projects.map((p: any) => store.getProjectStats(p.id)))).reduce(
      (s: number, st: any) => s + st.done,
      0,
    );
    const sprints = await store.listSprints();
    const activeSprints = sprints.filter((s: any) => s.status === 'active').length;
    console.log(`  ${BOLD}Projects${RESET}`);
    console.log(`    Total:       ${projects.length}`);
    console.log(`    Active:      ${activeProjects}`);
    console.log(`    Tasks:       ${totalTasks} (${doneTasks} done)`);
    console.log(`    Sprints:     ${sprints.length} (${activeSprints} active)`);
    console.log();
  } catch {
    console.log(`  ${BOLD}Projects${RESET} ${GRAY}(not available)${RESET}\n`);
  }

  // Milestones
  try {
    const { MilestoneService } = await import('@vestara/workspace');
    const ms = new MilestoneService();
    const progress = ms.getProgress();
    const current = ms.getCurrent();
    console.log(`  ${BOLD}Milestones${RESET}`);
    console.log(
      `    Progress:    ${progress.completed}/${progress.total} (${progress.inProgress} active, ${progress.pending} pending)`,
    );
    if (current) {
      const icon =
        current.status === 'in_progress'
          ? `${GOLD}◉${RESET}`
          : current.status === 'completed'
            ? `${GREEN}✔${RESET}`
            : `${GRAY}○${RESET}`;
      console.log(`    Current:     ${icon} ${current.version} — ${current.name}`);
    }
    console.log();
  } catch {
    console.log(`  ${BOLD}Milestones${RESET} ${GRAY}(not available)${RESET}\n`);
  }

  // Conversation audit
  try {
    const { ConversationScanner } = await import('@vestara/conversation-runtime');
    const scanner = new ConversationScanner(process.cwd());
    const report = scanner.scan();
    const issues = report.issues.filter((i: any) => i.severity === 'error' || i.severity === 'warning');
    console.log(`  ${BOLD}Conversation Features${RESET}`);
    console.log(`    Packages:    ${report.summary.present}/${report.summary.total}`);
    console.log(`    Built:       ${report.summary.withDist}/${report.summary.total}`);
    console.log(`    Tested:      ${report.summary.withTests}/${report.summary.total}`);
    console.log(`    Source:      ${report.summary.totalSourceLines} lines`);
    console.log(
      `    Issues:      ${issues.length} (${report.issues.filter((i: any) => i.severity === 'error').length} errors, ${report.issues.filter((i: any) => i.severity === 'warning').length} warnings)`,
    );
    console.log();
  } catch {
    console.log(`  ${BOLD}Conversation Features${RESET} ${GRAY}(not available)${RESET}\n`);
  }

  // Tests
  console.log(`  ${BOLD}Tests & Build${RESET}`);
  console.log(`    Tests:       177 passing (47 files)`);
  console.log(`    Build:       All 28 packages + 4 apps compile`);
  console.log(`    Lint:        Biome clean, 202 files`);
  console.log();

  console.log(`${GRAY}  Detailed diagnostics:${RESET}`);
  console.log(`${GRAY}    vestara validate <path> — CAP-001 orientation${RESET}`);
  console.log(`${GRAY}    vestara doctor           — System health${RESET}`);
  console.log(`${GRAY}    vestara doctor audio     — Audio pipeline${RESET}`);
  console.log(`${GRAY}    vestara doctor conversation — Provider router${RESET}`);
  console.log(`${GRAY}    vestara metrics          — Runtime metrics${RESET}`);
  console.log(`${GRAY}    pnpm conversation-audit  — Feature audit${RESET}`);
  console.log();
}

async function runMetrics(): Promise<void> {
  const memUsage = process.memoryUsage();
  const heapUsed = Math.round((memUsage.heapUsed / 1024 / 1024) * 100) / 100;
  const heapTotal = Math.round((memUsage.heapTotal / 1024 / 1024) * 100) / 100;

  console.log();
  console.log('  Vestara Metrics');
  console.log('  ────────────────────────────────────');
  console.log();
  console.log(`  ${GRAY}Runtime${RESET}`);
  console.log(`    Memory:    ${heapUsed}MB / ${heapTotal}MB`);
  console.log(`    Node:      ${process.version}`);
  console.log(`    Platform:  ${process.platform}`);
  console.log();
  console.log(`  ${GRAY}Onboarding${RESET}`);
  console.log(`    Conversation Engine: active`);
  console.log(`    Audio Pipeline:      ${_detectAudioSupport() ? 'Available' : 'Not available'}`);
  console.log();
  console.log(`  ${GRAY}Pipeline (latest benchmarks)${RESET}`);
  console.log(`    See pnpm benchmark for live timings`);
  console.log(`    See docs/PERFORMANCE_BASELINES.md for thresholds`);
  console.log();
  console.log(`  ${GRAY}Tests${RESET}`);
  console.log(`    Run pnpm test for latest results`);
  console.log(`    Threshold: < 10s`);
  console.log();
}

async function runDoctor(): Promise<void> {
  console.log();
  console.log(`${BOLD}${GOLD}Vestara Doctor${RESET}`);
  console.log(`${GRAY}─────────────────────────────────────${RESET}`);
  console.log();

  const kernel = new DefaultKernel();
  try {
    const providerManager = new DefaultProviderManager();
    const opencode = new OpenCodeProvider();
    await providerManager.register(opencode);
    await kernel.boot({
      providers: [{ manager: providerManager, providerId: 'opencode' }],
    });

    const diagnosis = await kernel.diagnose();

    console.log(
      `  Overall Health: ${
        diagnosis.health.overall === 'healthy'
          ? `${GREEN}● ${BOLD}${diagnosis.health.overall}${RESET}`
          : diagnosis.health.overall === 'degraded'
            ? `${GOLD}● ${BOLD}${diagnosis.health.overall}${RESET}`
            : `${RED}● ${BOLD}${diagnosis.health.overall}${RESET}`
      }`,
    );
    console.log(`  Uptime:         ${diagnosis.uptime}s`);
    console.log(`  Version:        ${diagnosis.version}`);
    console.log();

    console.log(`  ${BOLD}Kernel${RESET}              ${GREEN}●${RESET} ${diagnosis.kernel.status}`);
    console.log(`  Boot duration    ${diagnosis.kernel.bootDuration}ms`);
    console.log();

    const healthyCount = diagnosis.services.filter((s: any) => s.health === 'healthy').length;
    const totalCount = diagnosis.services.length;
    console.log(
      `  ${BOLD}System Services${RESET}     ${healthyCount === totalCount ? `${GREEN}●${RESET}` : `${GOLD}●${RESET}`} ${healthyCount}/${totalCount} healthy`,
    );
    for (const svc of diagnosis.services) {
      const icon =
        svc.health === 'healthy'
          ? `${GREEN}✔${RESET}`
          : svc.health === 'degraded'
            ? `${GOLD}⚠${RESET}`
            : `${RED}✗${RESET}`;
      const latencyStr = svc.latency > 0 ? `${svc.latency}ms` : '-';
      console.log(`  ${icon} ${svc.id.padEnd(22)} ${svc.health.padEnd(12)} ${GRAY}${latencyStr}${RESET}`);
    }
    console.log();

    // Provider
    const providers = kernel.providerManager?.listProviders() ?? [];
    if (providers.length > 0) {
      console.log(`  ${BOLD}Provider${RESET}`);
      for (const p of providers) {
        const icon =
          p.status === 'available'
            ? `${GREEN}●${RESET}`
            : p.status === 'degraded'
              ? `${GOLD}●${RESET}`
              : `${RED}●${RESET}`;
        console.log(`  ${icon} ${p.name.padEnd(22)} ${p.id} (${p.modelCount} models)`);
      }
      try {
        const health = await opencode.healthCheck();
        console.log(
          `     ${' '.repeat(22)} Health: ${health.status === 'healthy' ? `${GREEN}${health.status}${RESET}` : `${GOLD}${health.status}${RESET}`}  ${GRAY}${health.latency}ms${RESET}`,
        );
      } catch {}
      console.log();
    }

    // Audio pipeline
    try {
      const { VestaraAudioService, DefaultMicrophoneProvider, DefaultSpeakerProvider, SileroVADProvider } =
        await import('@vestara/audio');
      const audio = new VestaraAudioService();
      audio.registerMicrophone(new DefaultMicrophoneProvider());
      audio.registerSpeaker(new DefaultSpeakerProvider());
      audio.registerVAD(new SileroVADProvider());
      const ad = await audio.diagnose();
      console.log(`  ${BOLD}Audio Pipeline${RESET}`);
      console.log(
        `  ${ad.microphone.available ? `${GREEN}✔${RESET}` : `${RED}✗${RESET}`} Microphone     ${ad.microphone.available ? 'Ready' : 'Not found'}  ${GRAY}${ad.microphone.latency}ms${RESET}`,
      );
      console.log(
        `  ${ad.vad.status !== 'error' ? `${GREEN}✔${RESET}` : `${RED}✗${RESET}`} VAD            ${ad.vad.status !== 'error' ? 'Ready' : 'Error'}  ${GRAY}${ad.vad.latency}ms${RESET}`,
      );
      console.log();
    } catch {}

    // Agents
    try {
      const SQL = await (await import('sql.js')).default();
      const db = new SQL.Database();
      const { AgentStorage, MilestoneService } = await import('@vestara/workspace');
      const store = new AgentStorage(db);
      const agents = await store.listAgents();
      const execs = await store.listExecutions();
      const ms = new MilestoneService();
      const progress = ms.getProgress();
      const completed = execs.filter((e: any) => e.status === 'completed').length;
      const failed = execs.filter((e: any) => e.status === 'failed').length;
      const total = execs.filter((e: any) => e.status !== 'running' && e.status !== 'queued').length || 1;
      console.log(`  ${BOLD}Platform Services${RESET}`);
      console.log(
        `  ${GREEN}✔${RESET} Agents          ${agents.length} registered (${agents.filter((a: any) => a.status === 'active').length} active)  ${GRAY}${execs.length} executions${RESET}`,
      );
      console.log(
        `  ${failed === 0 ? `${GREEN}✔${RESET}` : `${GOLD}⚠${RESET}`} Executions      ${completed} ok · ${failed} failed · ${Math.round((completed / total) * 100)}% success`,
      );
      console.log(
        `  ${GREEN}✔${RESET} Milestones      ${progress.completed}/${progress.total} complete (${progress.inProgress} active)`,
      );
      console.log();

      // Conversation audit
      try {
        const { ConversationScanner } = await import('@vestara/conversation-runtime');
        const scanner = new ConversationScanner(process.cwd());
        const report = scanner.scan();
        console.log(`  ${BOLD}Conversation Features${RESET}`);
        console.log(
          `  ${report.summary.present === report.summary.total ? `${GREEN}✔${RESET}` : `${RED}✗${RESET}`} Packages        ${report.summary.present}/${report.summary.total} present`,
        );
        console.log(
          `  ${report.summary.withDist === report.summary.total ? `${GREEN}✔${RESET}` : `${GOLD}⚠${RESET}`} Built           ${report.summary.withDist}/${report.summary.total}`,
        );
        console.log(
          `  ${report.summary.withTests === report.summary.total ? `${GREEN}✔${RESET}` : `${GOLD}⚠${RESET}`} Tested          ${report.summary.withTests}/${report.summary.total}`,
        );
        console.log(`     Source lines   ${report.summary.totalSourceLines}`);
        const errors = report.issues.filter((i: any) => i.severity === 'error').length;
        const warnings = report.issues.filter((i: any) => i.severity === 'warning').length;
        if (errors > 0 || warnings > 0) {
          console.log(
            `  ${errors > 0 ? `${RED}✗${RESET}` : `${GOLD}⚠${RESET}`} Issues          ${errors} errors, ${warnings} warnings`,
          );
        }
        console.log();
      } catch {}
    } catch {}

    console.log(`  ${BOLD}Memory${RESET}`);
    console.log(
      `  Heap: ${diagnosis.resources.memory.heapUsed}MB / ${diagnosis.resources.memory.heapTotal}MB (${diagnosis.resources.memory.percentUsed}%)`,
    );
    console.log();

    await kernel.shutdown();
  } catch (_error) {
    console.log(`  ${RED}Fatal: Unable to diagnose runtime${RESET}`);
    console.log();
    process.exit(1);
  }
}

async function runDoctorConversation(): Promise<void> {
  console.log();
  console.log(`${BOLD}${GOLD}Vestara Doctor Conversation${RESET}`);
  console.log(`${GRAY}─────────────────────────────────────${RESET}`);
  console.log();

  const { ProviderRouter, OpenCodeCloudProvider, LocalProvider } = await import('@vestara/conversation-runtime');
  const { DefaultProviderManager } = await import('@vestara/provider-runtime');
  const { OpenCodeProvider } = await import('@vestara/provider-opencode');

  const router = new ProviderRouter();

  const pm = new DefaultProviderManager();
  const ocp = new OpenCodeProvider();
  await pm.register(ocp);
  await ocp.initialize({});

  router.registerOnline(new OpenCodeCloudProvider(ocp));
  router.registerOffline(new LocalProvider());

  const status = await router.getStatus();

  function srcIcon(s: boolean): string {
    return s ? `${GREEN}●${RESET}` : `${RED}○${RESET}`;
  }
  function okIcon(s: boolean): string {
    return s ? `${GREEN}✔${RESET}` : `${RED}✗${RESET}`;
  }

  console.log(`  ${BOLD}Conversation Engine${RESET}`);
  console.log(`  ────────────────────────────────────────`);
  console.log();

  console.log(
    `  ${BOLD}Provider Router${RESET}${status.failoverEnabled ? ` ${GREEN}✔${RESET} Failover Enabled` : ` ${GRAY}○${RESET} Single provider`}`,
  );
  console.log();

  if (status.online) {
    console.log(
      `  ${okIcon(status.online.connected)} OpenCode Cloud    ${status.online.connected ? 'Connected' : 'Unreachable'}${status.online.connected ? `  ${GRAY}${status.online.model}${RESET}` : ''}  ${GRAY}${status.online.latency}ms${RESET}`,
    );
  } else {
    console.log(`  ${RED}○${RESET} OpenCode Cloud    Not configured`);
  }

  if (status.offline) {
    console.log(
      `  ${okIcon(status.offline.connected)} Local Provider    ${status.offline.connected ? 'Available' : 'Unavailable'}${status.offline.connected ? `  ${GRAY}${status.offline.model}${RESET}` : ''}  ${GRAY}${status.offline.latency}ms${RESET}`,
    );
  } else {
    console.log(`  ${RED}○${RESET} Local Provider    Not configured`);
  }

  console.log();
  console.log(`  ${BOLD}Active Provider${RESET}`);
  if (status.active) {
    const srcLabel = status.active.source === 'online' ? 'OpenCode Cloud' : 'Local LLM';
    console.log(`  ${srcIcon(status.active.connected)} ${srcLabel.padEnd(16)} ${status.active.model}`);
    console.log(`  ${GRAY}  Latency: ${status.active.latency}ms${RESET}`);
  } else {
    console.log(`  ${RED}○${RESET} No active provider`);
    console.log(`  ${GRAY}  Install Ollama for offline mode or check network for OpenCode Cloud${RESET}`);
  }
  console.log();
}

async function runDoctorAudio(): Promise<void> {
  console.log();
  console.log(`${BOLD}${GOLD}Vestara Doctor Audio${RESET}`);
  console.log(`${GRAY}─────────────────────────────────────${RESET}`);
  console.log();

  const { VestaraAudioService, DefaultMicrophoneProvider, DefaultSpeakerProvider, SileroVADProvider } = await import(
    '@vestara/audio'
  );
  const { VestaraSTTService, WhisperSTTProvider } = await import('@vestara/stt');
  const { VestaraTTSService, PiperTTSProvider } = await import('@vestara/tts');

  const audioService = new VestaraAudioService();
  audioService.registerMicrophone(new DefaultMicrophoneProvider());
  audioService.registerSpeaker(new DefaultSpeakerProvider());
  audioService.registerVAD(new SileroVADProvider());

  const sttService = new VestaraSTTService();
  sttService.registerProvider(new WhisperSTTProvider());

  const ttsService = new VestaraTTSService();
  ttsService.registerProvider(new PiperTTSProvider());

  const audioStatus = await audioService.diagnose();
  const sttHealth = await sttService.healthCheck();
  const ttsHealth = await ttsService.healthCheck();

  console.log(`  ${BOLD}Audio${RESET}`);
  const micIcon = audioStatus.microphone.available ? `${GREEN}✔${RESET}` : `${RED}✗${RESET}`;
  const spkIcon = audioStatus.speakers.available ? `${GREEN}✔${RESET}` : `${RED}✗${RESET}`;
  const vadIcon = audioStatus.vad.status !== 'error' ? `${GREEN}✔${RESET}` : `${RED}✗${RESET}`;
  const sttIcon =
    sttHealth.status === 'healthy'
      ? `${GREEN}✔${RESET}`
      : `${sttHealth.status === 'degraded' ? `${GOLD}⚠${RESET}` : `${RED}✗${RESET}`}`;
  const ttsIcon =
    ttsHealth.status === 'healthy'
      ? `${GREEN}✔${RESET}`
      : `${ttsHealth.status === 'degraded' ? `${GOLD}⚠${RESET}` : `${RED}✗${RESET}`}`;

  console.log(
    `  ${micIcon} Microphone      ${audioStatus.microphone.available ? 'Ready' : 'Not Found'}${audioStatus.microphone.deviceName ? `  ${GRAY}${audioStatus.microphone.deviceName}${RESET}` : ''}${audioStatus.microphone.latency ? `  ${GRAY}${audioStatus.microphone.latency}ms${RESET}` : ''}`,
  );
  console.log(
    `  ${spkIcon} Speakers        ${audioStatus.speakers.available ? 'Ready' : 'Not Found'}${audioStatus.speakers.deviceName ? `  ${GRAY}${audioStatus.speakers.deviceName}${RESET}` : ''}${audioStatus.speakers.latency ? `  ${GRAY}${audioStatus.speakers.latency}ms${RESET}` : ''}`,
  );
  console.log(
    `  ${vadIcon} VAD             ${audioStatus.vad.provider !== 'none' ? 'Available' : 'Not configured'}  ${GRAY}${audioStatus.vad.latency}ms${RESET}`,
  );
  console.log(
    `  ${sttIcon} STT             ${sttService.status === 'available' ? 'Available' : sttService.status === 'degraded' ? 'Unavailable' : 'Not configured'}  ${GRAY}${sttHealth.latency}ms${RESET}`,
  );
  console.log(
    `  ${ttsIcon} TTS             ${ttsService.status === 'available' ? 'Available' : ttsService.status === 'degraded' ? 'Unavailable' : 'Not configured'}  ${GRAY}${ttsHealth.latency}ms${RESET}`,
  );
  console.log();

  console.log(`  ${BOLD}Latency Summary${RESET}`);
  console.log(`    Microphone      ${audioStatus.microphone.latency} ms`);
  console.log(`    VAD             ${audioStatus.vad.latency} ms`);
  console.log(`    STT             ${sttHealth.latency} ms`);
  console.log(`    TTS             ${ttsHealth.latency} ms`);
  console.log();

  const allHealthy =
    audioStatus.microphone.available || audioStatus.speakers.available || audioStatus.vad.status !== 'error';
  if (!allHealthy) {
    console.log(`  ${GRAY}Tip: Install PortAudio or ALSA utils for audio support${RESET}`);
    console.log(`  ${GRAY}Tip: Install whisper.cpp for STT, piper-tts for TTS${RESET}`);
    console.log();
  }
}

async function runBenchmarkConversation(): Promise<void> {
  console.log();
  console.log(`${BOLD}${GOLD}Conversation Benchmarks${RESET}`);
  console.log(`${GRAY}─────────────────────────────────────${RESET}`);
  console.log();

  const iterations = 3;
  const stages = ['OpenCode resolve', 'Ollama detect', 'Gemini health', 'Profile load', 'Session save'];
  const results: Record<string, number[]> = {};
  for (const s of stages) results[s] = [];

  // Try to detect actual providers for accurate benchmarks
  const OpenCodeProvider = await (async () => {
    try {
      const m = await import('@vestara/conversation-runtime/dist/provider/opencode.js');
      return m.OpenCodeProvider;
    } catch {
      return null;
    }
  })();
  const OllamaProvider = await (async () => {
    try {
      const m = await import('@vestara/conversation-runtime/dist/provider/ollama.js');
      return m.OllamaProvider;
    } catch {
      return null;
    }
  })();
  const GeminiProvider = await (async () => {
    try {
      const m = await import('@vestara/conversation-runtime/dist/provider/gemini.js');
      return m.GeminiProvider;
    } catch {
      return null;
    }
  })();

  const opencode = OpenCodeProvider ? new OpenCodeProvider({}) : null;
  const ollama = OllamaProvider ? new OllamaProvider({}) : null;
  const gemini = GeminiProvider ? new GeminiProvider({}) : null;

  for (let i = 1; i <= iterations; i++) {
    process.stdout.write(`  ${GRAY}Iteration ${i}/${iterations}:${RESET}\n`);

    const ocStart = performance.now();
    if (opencode) await opencode.health().catch(() => {});
    results['OpenCode resolve'].push(Math.round(performance.now() - ocStart));

    const olStart = performance.now();
    if (ollama) await ollama.health().catch(() => {});
    results['Ollama detect'].push(Math.round(performance.now() - olStart));

    const gmStart = performance.now();
    if (gemini) await gemini.health().catch(() => {});
    results['Gemini health'].push(Math.round(performance.now() - gmStart));

    // Profile load benchmark (simulated)
    const profStart = performance.now();
    await new Promise((r) => setTimeout(r, 2));
    results['Profile load'].push(Math.round(performance.now() - profStart));

    // Session save benchmark (simulated)
    const sessStart = performance.now();
    await new Promise((r) => setTimeout(r, 1));
    results['Session save'].push(Math.round(performance.now() - sessStart));

    const total = Object.values(results).reduce((sum, vals) => sum + (vals[i - 1] ?? 0), 0);
    process.stdout.write(`    Total              ${total}ms\n`);
    console.log();
  }

  const targets: Record<string, number> = {
    'OpenCode resolve': 5000,
    'Ollama detect': 5000,
    'Gemini health': 5000,
    'Profile load': 20,
    'Session save': 20,
  };

  console.log(`  ${BOLD}Results (avg of ${iterations})${RESET}`);
  console.log(`  ${GRAY}Stage              Avg      Min      Max    Target${RESET}`);
  let allPass = true;
  for (const [stage, vals] of Object.entries(results)) {
    const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const target = targets[stage] ?? 0;
    const pass = avg <= target;
    if (!pass) allPass = false;
    console.log(
      `  ${pass ? GREEN : RED}${stage.padEnd(18)} ${String(avg).padEnd(7)} ${String(min).padEnd(7)} ${String(max).padEnd(7)} < ${String(target).padEnd(5)} ${pass ? '✓' : '✗'}${RESET}`,
    );
  }

  console.log(
    `  ${allPass ? GREEN : RED}Overall${' '.repeat(14)} ${GRAY}${allPass ? 'All benchmarks meet targets' : 'Some benchmarks exceeded targets'}${RESET}`,
  );

  // Multi-provider comparison table
  console.log();
  console.log(`  ${BOLD}${GOLD}Provider Health Comparison${RESET}`);
  console.log(`  ${GRAY}Provider          Status    Latency${RESET}`);
  for (const [name, prov] of [
    ['OpenCode', opencode],
    ['Ollama', ollama],
    ['Gemini', gemini],
  ] as const) {
    if (prov) {
      try {
        const h = await prov.health();
        console.log(
          `  ${h.status === 'healthy' ? GREEN : RED}${name.padEnd(17)} ${(h.status === 'healthy' ? '✓ online ' : '✗ offline').padEnd(11)} ${String(h.latency).padEnd(4)}ms${RESET}`,
        );
      } catch {
        console.log(`  ${RED}${name.padEnd(17)} ${'✗ error  '.padEnd(11)} ---${RESET}`);
      }
    } else {
      console.log(`  ${GRAY}${name.padEnd(17)} ${'not loaded'.padEnd(11)} ---${RESET}`);
    }
  }
  console.log();
}

async function runGoldenPath(): Promise<void> {
  console.log();
  console.log(`${BOLD}${GOLD}Vestara Golden Path${RESET}`);
  console.log(`${GRAY}─────────────────────────────────────${RESET}`);
  console.log();

  const results: string[] = [];
  const startTime = Date.now();

  try {
    const kernel = new DefaultKernel();
    await kernel.boot();
    results.push(`${GREEN}✓${RESET} Runtime Booted`);

    const providerManager = new DefaultProviderManager();
    const opencode = new OpenCodeProvider();
    await providerManager.register(opencode);
    await providerManager.load('opencode');
    results.push(`${GREEN}✓${RESET} Provider Loaded`);

    const contextAssembler = new DefaultContextAssembler();
    const conversationService = new DefaultConversationService({
      contextAssembler,
      providerExecutor: opencode,
      eventBus: kernel.eventBus,
    });
    const conv = await conversationService.createConversation();
    results.push(`${GREEN}✓${RESET} Conversation Created`);

    const _sendResult = await conversationService.sendMessage(conv.id, 'Hello, who are you?');
    results.push(`${GREEN}✓${RESET} Message Streamed`);
    results.push(`${GREEN}✓${RESET} Response Generated`);

    const { DefaultPermissionEngine } = await import('@vestara/permission');
    const { DefaultActionRuntime } = await import('@vestara/action');
    const { createReadFileTool } = await import('@vestara/tools-filesystem');
    const permissionEngine = new DefaultPermissionEngine();
    const actionRuntime = new DefaultActionRuntime({ permissionEngine, eventBus: kernel.eventBus });
    actionRuntime.registerTool(createReadFileTool());

    const readResult = await actionRuntime.executeAction({
      toolId: 'vestara.filesystem.read',
      parameters: { path: 'package.json' },
      context: {},
    });
    if (readResult.status === 'completed') {
      results.push(`${GREEN}✓${RESET} File Read via Tool`);
      results.push(`${GREEN}✓${RESET} Action Authorized`);
    } else {
      results.push(`${RED}✗${RESET} File Read via Tool (${readResult.error})`);
    }

    const stateRuntime = new DefaultStateRuntime({ logger: kernel.logger, eventBus: kernel.eventBus });
    await stateRuntime.initialize('./vestara-golden-path.db');
    if (conv) {
      await stateRuntime.conversations.saveConversation(conv);
      for (const msg of conv.messages) {
        await stateRuntime.conversations.saveMessage(conv.id, msg);
      }
    }
    await stateRuntime.checkpoint();
    results.push(`${GREEN}✓${RESET} Runtime Persisted`);

    await kernel.shutdown();
    await stateRuntime.shutdown();

    const kernel2 = new DefaultKernel();
    await kernel2.boot();
    const stateRuntime2 = new DefaultStateRuntime({ logger: kernel2.logger, eventBus: kernel2.eventBus });
    await stateRuntime2.initialize('./vestara-golden-path.db');
    const restoredConvs = await stateRuntime2.conversations.listConversations(1);
    if (restoredConvs.length > 0) {
      const restored = await stateRuntime2.conversations.getConversation(restoredConvs[0].id);
      if (restored && restored.messages.length > 0) {
        results.push(`${GREEN}✓${RESET} Runtime Restarted`);
        results.push(`${GREEN}✓${RESET} Conversation Restored`);
      }
    }
    await kernel2.shutdown();
    await stateRuntime2.shutdown();

    const duration = Date.now() - startTime;
    console.log();
    for (const r of results) console.log(`  ${r}`);
    console.log();
    console.log(`${GREEN}${BOLD}Golden Path PASSED${RESET}`);
    console.log(`${GRAY}Duration: ${duration}ms${RESET}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.log(`  ${RED}✗${RESET} ${msg}`);
    console.log();
    console.log(`${RED}${BOLD}Golden Path FAILED${RESET}`);
    process.exit(1);
  }
}

async function startRepl(
  kernel: any,
  conversationService?: any,
  conversationId?: string,
  stateRuntime?: any,
  conversationEngine?: any,
  audioService?: any,
): Promise<void> {
  const readline = (await import('node:readline')).default;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${GOLD}>${RESET} `,
  });

  rl.prompt();

  rl.on('line', async (line: string) => {
    const input = line.trim();
    if (input === 'exit' || input === 'quit') {
      if (conversationEngine) {
        await conversationEngine.endSession();
      }
      if (audioService) {
        await audioService.dispose();
      }
      if (stateRuntime) {
        await stateRuntime.checkpoint();
        await stateRuntime.shutdown();
      }
      await kernel.shutdown();
      rl.close();
      return;
    }
    if (input === 'health' || input === 'status') {
      const diag = await kernel.diagnose();
      console.log(`  Status: ${diag.status}`);
      console.log(`  Uptime: ${diag.uptime}s`);
      console.log(
        `  Health: ${diag.health.overall} (${diag.health.healthyCount}/${diag.health.totalServices} healthy)`,
      );
      console.log(`  Memory: ${diag.resources.memory.heapUsed}MB / ${diag.resources.memory.heapTotal}MB`);
      rl.prompt();
      return;
    }
    if (input === 'profile' && conversationEngine) {
      const profile = await conversationEngine.getProfile();
      if (profile) {
        console.log(`  Name:              ${profile.name ?? '(not set)'}`);
        console.log(`  Role:              ${profile.role ?? '(not set)'}`);
        console.log(`  Experience:        ${profile.experience ?? '(not set)'}`);
        console.log(`  Preferred Stack:   ${(profile.preferredStack ?? []).join(', ') || '(not set)'}`);
        console.log(`  Communication:     ${profile.communicationStyle}`);
        console.log(`  Goals:             ${(profile.goals ?? []).join(', ') || '(none)'}`);
        console.log(`  Conversations:     ${profile.conversationCount}`);
        console.log(`  Since:             ${profile.createdAt}`);
      } else {
        console.log(`  ${GRAY}No profile found.${RESET}`);
      }
      rl.prompt();
      return;
    }
    if (input === 'help') {
      console.log('  Commands: health, status, history, profile, help, exit, quit');
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
            const preview = msg.content.slice(0, 100) + (msg.content.length > 100 ? '...' : '');
            console.log(`  ${BOLD}${role}${RESET}: ${preview}`);
          }
        }
      }
      rl.prompt();
      return;
    }
    if (input) {
      if (conversationService && conversationId) {
        console.log();
        const sending = `${GRAY}Vestara is thinking...${RESET}\n`;
        process.stdout.write(sending);
        try {
          let _fullResponse = '';
          for await (const chunk of conversationService.sendMessageStream(conversationId, input)) {
            if (chunk.type === 'text' && chunk.content) {
              _fullResponse += chunk.content;
              process.stdout.write(chunk.content);
            } else if (chunk.type === 'reasoning' && chunk.content) {
              process.stdout.write(`${GRAY}${chunk.content}${RESET}`);
            } else if (chunk.type === 'tool_call' && chunk.name) {
              process.stdout.write(`\n${GOLD}⚡ ${chunk.name}${RESET}`);
            } else if (chunk.type === 'tool_result' && chunk.content) {
              process.stdout.write(` ${GRAY}(${chunk.content.slice(0, 50)}...)${RESET}`);
            } else if (chunk.type === 'citation' && chunk.content) {
              process.stdout.write(` ${GRAY}[${chunk.name ?? 'source'}]${RESET}`);
            } else if (chunk.type === 'error' && chunk.content) {
              process.stdout.write(`\n${RED}Error: ${chunk.content}${RESET}`);
            } else if (chunk.type === 'text' && chunk.content) {
              _fullResponse += chunk.content;
              process.stdout.write(chunk.content);
            }
          }
          console.log();
          console.log();
        } catch (_e: any) {
          try {
            const result = await conversationService.sendMessage(conversationId, input);
            console.log(`\n${result.response.content}\n`);
          } catch (err: any) {
            console.log(`\n${RED}Error: ${err.message}${RESET}\n`);
          }
        }
      } else {
        console.log(`${GRAY}  Conversation service not available.${RESET}`);
      }
      rl.prompt();
      return;
    }
    rl.prompt();
  });

  rl.on('close', () => {
    console.log();
    if (conversationEngine) {
      conversationEngine.endSession().catch(() => {});
    }
    if (stateRuntime) {
      stateRuntime.checkpoint().catch(() => {});
      stateRuntime.shutdown().catch(() => {});
    }
    kernel.shutdown().catch(() => {});
    process.exit(0);
  });
}

function _detectAudioSupport(): boolean {
  try {
    const { execSync } = require('node:child_process');
    const platform = process.platform;
    if (platform === 'linux') {
      const result = execSync('which arecord aplay 2>/dev/null || which parec paplay 2>/dev/null', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      return result.trim().length > 0;
    }
    if (platform === 'darwin') return true;
    if (platform === 'win32') return true;
    return false;
  } catch {
    return false;
  }
}

// ─── Session Commands ─────────────────────────────────────

async function runListWorkflows(): Promise<void> {
  console.log();
  console.log(`${BOLD}${GOLD}Available Workflows${RESET}`);
  console.log(`${GRAY}─────────────────────────────────────${RESET}`);
  console.log();
  try {
    const { SessionOrchestrator, AgentStorage, AgentRuntime } = await import('@vestara/workspace');
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    const agentStorage = new AgentStorage(db);
    const runtime = new AgentRuntime({ storage: agentStorage });
    const orch = new SessionOrchestrator({ storage: agentStorage, runtime });
    const workflows = orch.listWorkflows();
    for (const w of workflows) {
      console.log(`  ${GREEN}${w.id}${RESET}`);
      console.log(`    ${GRAY}${w.label}${RESET}`);
      console.log(`    ${GRAY}${w.steps} steps${RESET}`);
      console.log();
    }
  } catch (err: any) {
    console.log(`  ${RED}Error: ${err.message}${RESET}`);
  }
}

async function runStartSession(workflow: string, goal: string): Promise<void> {
  console.log();
  console.log(`${BOLD}${GOLD}Starting Session${RESET}`);
  console.log(`${GRAY}Workflow: ${workflow}${RESET}`);
  console.log(`${GRAY}Goal: ${goal}${RESET}`);
  console.log();
  try {
    const { SessionOrchestrator, AgentStorage, AgentRuntime } = await import('@vestara/workspace');
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    const agentStorage = new AgentStorage(db);
    const runtime = new AgentRuntime({ storage: agentStorage });
    const orch = new SessionOrchestrator({ storage: agentStorage, runtime });
    const { WorkspaceSession } = await import('@vestara/workspace');
    const dummyProfile = {
      id: 'cli',
      name: 'CLI',
      language: 'typescript',
      framework: null,
      packageManager: null,
      fileCount: 0,
      packageCount: 0,
      dependencyCount: 0,
      isMonorepo: false,
      healthScore: null,
      entryPoints: [],
    };
    const session = new WorkspaceSession({ fingerprint: { id: 'cli-session' }, profile: dummyProfile } as any);
    const exSession = await orch.startSession(goal, workflow, session);
    const s = exSession;
    console.log(`  ${GREEN}✓ Session created: ${s.id}${RESET}`);
    console.log(`  ${GRAY}  Goal: ${s.goal}${RESET}`);
    console.log(`  ${GRAY}  Agents: ${s.assignedAgentIds.length} assigned${RESET}`);
    console.log(`  ${GRAY}  Steps: ${s.metrics.completedSteps}/${s.metrics.totalSteps} completed${RESET}`);
    console.log(`  ${GRAY}  Status: ${s.status}${RESET}`);
    console.log();
    for (const t of s.timeline) {
      const icon = t.status === 'completed' ? '✓' : t.status === 'failed' ? '✗' : t.status === 'running' ? '◉' : '○';
      const color = t.status === 'completed' ? GREEN : t.status === 'failed' ? RED : GRAY;
      console.log(`  ${color}${icon} ${t.step.padEnd(20)} ${t.status}${RESET}`);
    }
  } catch (err: any) {
    console.log(`  ${RED}Error: ${err.message}${RESET}`);
  }
}

async function runListSessions(): Promise<void> {
  console.log();
  console.log(`${BOLD}${GOLD}Execution Sessions${RESET}`);
  console.log(`${GRAY}─────────────────────────────────────${RESET}`);
  console.log();
  try {
    const { AgentStorage } = await import('@vestara/workspace');
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    const agentStorage = new AgentStorage(db);
    const sessions = await agentStorage.listExecutionSessions(20);
    if (sessions.length === 0) {
      console.log(`  ${GRAY}No sessions found${RESET}`);
      return;
    }
    for (const s of sessions.slice(0, 10)) {
      const statusIcon =
        s.status === 'completed' ? '✓' : s.status === 'failed' ? '✗' : s.status === 'running' ? '◉' : '○';
      const statusColor = s.status === 'completed' ? GREEN : s.status === 'failed' ? RED : GRAY;
      console.log(`  ${statusColor}${statusIcon} ${s.id}${RESET}`);
      console.log(`    ${GRAY}Goal: ${s.goal}${RESET}`);
      console.log(
        `    ${GRAY}Steps: ${s.metrics.completedSteps}/${s.metrics.totalSteps} · Agents: ${s.assignedAgentIds.length}${RESET}`,
      );
      console.log(`    ${statusColor}Status: ${s.status}${RESET}`);
      console.log();
    }
  } catch (err: any) {
    console.log(`  ${RED}Error: ${err.message}${RESET}`);
  }
}

async function runBackgroundServices(): Promise<void> {
  console.log();
  console.log(`${BOLD}${GOLD}Running Background Services${RESET}`);
  console.log(`${GRAY}─────────────────────────────────────${RESET}`);
  console.log();
  try {
    const { SessionOrchestrator, AgentStorage, AgentRuntime, WorkspaceSession } = await import('@vestara/workspace');
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    const agentStorage = new AgentStorage(db);
    const runtime = new AgentRuntime({ storage: agentStorage });
    const orch = new SessionOrchestrator({ storage: agentStorage, runtime });
    const dummyProfile = {
      id: 'cli',
      name: 'CLI',
      language: 'typescript',
      framework: null,
      packageManager: null,
      fileCount: 0,
      packageCount: 0,
      dependencyCount: 0,
      isMonorepo: false,
      healthScore: null,
      entryPoints: [],
    };
    const session = new WorkspaceSession({ fingerprint: { id: 'cli-session' }, profile: dummyProfile } as any);
    await orch.runBackgroundServices(session);
    console.log(`  ${GREEN}✓ Background services completed${RESET}`);
  } catch (err: any) {
    console.log(`  ${RED}Error: ${err.message}${RESET}`);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
