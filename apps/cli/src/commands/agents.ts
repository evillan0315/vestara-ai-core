import { openSharedDb } from '../lib/db.js';
import { BOLD, GOLD, GRAY, GREEN, RED, RESET } from '../output/format.js';

export async function runAgentsList(): Promise<void> {
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
    const _ROLE_COLORS: Record<string, string> = {
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
      const running = agentExecs.filter((e: any) => e.status === 'running').length;
      const total = Math.max(agentExecs.filter((e: any) => e.status !== 'running' && e.status !== 'queued').length, 1);
      const successRate = Math.round((completed / total) * 100);
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
