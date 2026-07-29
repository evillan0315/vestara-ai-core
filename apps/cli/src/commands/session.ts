import { BOLD, GOLD, GREEN, GRAY, RESET, CYAN } from '../output/format.js';

export async function runListWorkflows(): Promise<void> {
  console.log(); console.log(`${BOLD}${GOLD}Available Workflows${RESET}`); console.log(`${GRAY}─────────────────────────────────────${RESET}`); console.log();
  try {
    const { WorkflowService } = await import('@vestara/workspace');
    const ws = new WorkflowService(); const workflows = ws.listWorkflows();
    if (workflows.length === 0) { console.log(`  ${GRAY}No workflows registered.${RESET}\n`); return; }
    for (const wf of workflows) {
      console.log(`  ${GREEN}●${RESET} ${BOLD}${wf.name}${RESET}  ${GRAY}${wf.id}${RESET}`); console.log(`     ${wf.description}`);
      if (wf.agents && wf.agents.length > 0) console.log(`     Agents: ${CYAN}${wf.agents.join(', ')}${RESET}`); console.log();
    }
  } catch (err: any) { console.log(`  ${RED}Error: ${err.message}${RESET}\n`); }
}

export async function runStartSession(workflowId: string, goal: string): Promise<void> {
  console.log(); console.log(`${BOLD}${GOLD}Starting session...${RESET}`); console.log(`${GRAY}Workflow: ${workflowId}${RESET}`); console.log(`${GRAY}Goal: ${goal}${RESET}`); console.log();
  try {
    const { SessionOrchestrator } = await import('@vestara/workspace');
    const so = new SessionOrchestrator(); const session = await so.startSession(workflowId, goal);
    console.log(`  ${GREEN}✓${RESET} Session started  ${GRAY}(id: ${session.id})${RESET}`); console.log(`  ${GRAY}Status: ${session.status}${RESET}`); console.log(`  ${GRAY}Agents: ${session.agents?.join(', ') || 'pending'}${RESET}`); console.log();
  } catch (err: any) { console.log(`  ${RED}Error: ${err.message}${RESET}\n`); }
}

export async function runListSessions(): Promise<void> {
  console.log(); console.log(`${BOLD}${GOLD}Active Sessions${RESET}`); console.log(`${GRAY}─────────────────────────────────────${RESET}`); console.log();
  try {
    const { SessionOrchestrator } = await import('@vestara/workspace');
    const so = new SessionOrchestrator(); const sessions = await so.listSessions();
    if (sessions.length === 0) { console.log(`  ${GRAY}No active sessions.${RESET}\n`); return; }
    for (const s of sessions) {
      const icon = s.status === 'running' ? `${GREEN}●${RESET}` : s.status === 'completed' ? `${GREEN}✔${RESET}` : `${GRAY}○${RESET}`;
      console.log(`  ${icon} ${BOLD}${s.id}${RESET}  ${GRAY}${s.workflowId}${RESET}`); console.log(`     Goal: ${s.goal}`); console.log(`     Status: ${s.status}  ·  Agents: ${s.agents?.length || 0}`); console.log();
    }
  } catch (err: any) { console.log(`  ${RED}Error: ${err.message}${RESET}\n`); }
}

export async function runBackgroundServices(): Promise<void> {
  console.log(); console.log(`${BOLD}${GOLD}Background Services${RESET}`); console.log(`${GRAY}─────────────────────────────────────${RESET}`); console.log();
  try {
    const { startServer } = await import('@vestara/events-server');
    const server = startServer(3002); console.log(`  ${GREEN}✓${RESET} Events server started on port 3002`); console.log(); (globalThis as any).__vestara_background_server = server;
  } catch (err: any) { console.log(`  ${GOLD}⚠${RESET} Events server unavailable: ${err.message}${RESET}\n`); }
}
