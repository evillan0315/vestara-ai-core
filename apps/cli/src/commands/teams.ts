import { openSharedDb } from '../lib/db.js';
import { BOLD, GOLD, GRAY, GREEN, RED, RESET } from '../output/format.js';

export async function runTeamsList(): Promise<void> {
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

export async function runTeamsCreate(names: string[]): Promise<void> {
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
    const teamId = `team-${Date.now()}`;
    await store.saveTeam({
      id: teamId,
      name: teamName,
      description: '',
      leaderAgentId: '',
      memberIds: [],
      sharedContext: '',
      activeWorkflowId: '',
      createdAt: new Date().toISOString(),
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

export async function runTeamsAssign(teamId: string, agentIds: string[]): Promise<void> {
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
