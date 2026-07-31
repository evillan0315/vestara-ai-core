import { openSharedDb } from '../lib/db.js';
import { BOLD, CYAN, GOLD, GRAY, GREEN, RED, RESET } from '../output/format.js';

export async function runListWorkflows(): Promise<void> {
  console.log();
  console.log(`${BOLD}${GOLD}Available Workflows${RESET}`);
  console.log(`${GRAY}─────────────────────────────────────${RESET}`);
  console.log();
  try {
    const workflows = [
      {
        id: 'feature',
        name: 'Feature Development',
        description: 'Build a new feature from understanding through verification.',
      },
      { id: 'bugfix', name: 'Bug Fix', description: 'Diagnose and fix a reported bug.' },
      { id: 'refactor', name: 'Refactor', description: 'Improve existing code without changing behavior.' },
    ];
    if (workflows.length === 0) {
      console.log(`  ${GRAY}No workflows registered.${RESET}\n`);
      return;
    }
    for (const wf of workflows) {
      console.log(`  ${GREEN}●${RESET} ${BOLD}${wf.name}${RESET}  ${GRAY}${wf.id}${RESET}`);
      console.log(`     ${wf.description}`);
      console.log();
    }
  } catch (err: any) {
    console.log(`  ${RED}Error: ${err.message}${RESET}\n`);
  }
}

export async function runStartSession(workflowId: string, goal: string): Promise<void> {
  console.log();
  console.log(`${BOLD}${GOLD}Starting session...${RESET}`);
  console.log(`${GRAY}Workflow: ${workflowId}${RESET}`);
  console.log(`${GRAY}Goal: ${goal}${RESET}`);
  console.log();
  try {
    const { SessionOrchestrator } = await import('@vestara/workspace');
    const db = await openSharedDb();
    const { AgentStorage, AgentRuntime } = await import('@vestara/workspace');
    const agentStorage = new AgentStorage(db);
    const runtime = new AgentRuntime({ storage: agentStorage });
    const so = new SessionOrchestrator({ storage: agentStorage, runtime });
    const { WorkspaceSession } = await import('@vestara/workspace');
    const dummySession = new WorkspaceSession({
      fingerprint: { id: 'cli-session' },
      profile: { id: 'cli', name: 'CLI', primaryLanguage: { name: 'TypeScript' } },
    } as any);
    const session = await so.startSession(goal, workflowId, dummySession);
    console.log(`  ${GREEN}✓${RESET} Session started  ${GRAY}(id: ${session.id})${RESET}`);
    console.log(`  ${GRAY}Status: ${session.status}${RESET}`);
    console.log();
  } catch (err: any) {
    console.log(`  ${RED}Error: ${err.message}${RESET}\n`);
  }
}

export async function runListSessions(): Promise<void> {
  console.log();
  console.log(`${BOLD}${GOLD}Execution Sessions${RESET}`);
  console.log(`${GRAY}─────────────────────────────────────${RESET}`);
  console.log();
  try {
    const db = await openSharedDb();
    const { AgentStorage } = await import('@vestara/workspace');
    const store = new AgentStorage(db);
    const sessions = await store.listExecutionSessions(20);
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
      console.log(`    ${statusColor}Status: ${s.status}${RESET}`);
      console.log();
    }
  } catch (err: any) {
    console.log(`  ${RED}Error: ${err.message}${RESET}\n`);
  }
}

export async function runBackgroundServices(): Promise<void> {
  console.log();
  console.log(`${BOLD}${GOLD}Background Services${RESET}`);
  console.log(`${GRAY}─────────────────────────────────────${RESET}`);
  console.log();
  try {
    const { startServer } = await import('@vestara/events-server');
    const server = startServer(3002);
    console.log(`  ${GREEN}✓${RESET} Events server started on port 3002`);
    console.log();
    (globalThis as any).__vestara_background_server = server;
  } catch (err: any) {
    console.log(`  ${GOLD}⚠${RESET} Events server unavailable: ${err.message}${RESET}\n`);
  }
}
