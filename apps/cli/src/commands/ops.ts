import { TelemetryRuntime } from '@vestara/telemetry';
import { BOLD, GOLD, GREEN, RED, GRAY, RESET, CYAN } from '../output/format.js';

const STATUS_ICONS: Record<string, string> = {
  idle: `${GRAY}○${RESET}`,
  thinking: `${CYAN}◌${RESET}`,
  working: `${GREEN}●${RESET}`,
  waiting: `${GOLD}◉${RESET}`,
  reviewing: `${CYAN}◆${RESET}`,
  verifying: `${GOLD}◆${RESET}`,
  completed: `${GREEN}✓${RESET}`,
  failed: `${RED}✗${RESET}`,
};

function makeRuntime(): TelemetryRuntime {
  const rt = new TelemetryRuntime();

  if ((globalThis as any).__vestara_telemetry) {
    return (globalThis as any).__vestara_telemetry;
  }

  rt.addAgent('planner', 'Planner');
  rt.addAgent('engineer', 'Engineer');
  rt.addAgent('reviewer', 'Reviewer');
  rt.addAgent('verifier', 'Verifier');
  rt.addAgent('context', 'Context');

  (globalThis as any).__vestara_telemetry = rt;
  return rt;
}

function printAgentCard(agent: { id: string; name: string; status: string; currentTask: string; currentOperation: string; activeFilePath?: string; progress: number; elapsedMs: number; phase: string; detail: string }): void {
  const icon = STATUS_ICONS[agent.status] ?? `${GRAY}?${RESET}`;
  const bar = progressBar(agent.progress, agent.status === 'working' || agent.status === 'verifying');

  console.log(`  ${icon} ${BOLD}${agent.name}${RESET}`);
  console.log(`      Status:    ${agent.status}`);
  if (agent.currentTask) console.log(`      Task:      ${agent.currentTask}`);
  if (agent.currentOperation !== 'unknown') console.log(`      Operation: ${agent.currentOperation}`);
  if (agent.activeFilePath) console.log(`      File:      ${agent.activeFilePath}`);
  if (agent.phase) console.log(`      Phase:     ${agent.phase}`);
  if (agent.detail) console.log(`      Detail:    ${agent.detail}`);
  if (agent.status === 'working' || agent.status === 'verifying') {
    console.log(`      Progress:  ${bar} ${agent.progress}%`);
  }
  if (agent.elapsedMs > 0) {
    const s = Math.floor(agent.elapsedMs / 1000);
    console.log(`      Elapsed:   ${formatDuration(s)}`);
  }
}

function progressBar(pct: number, active: boolean): string {
  const w = 14;
  const filled = Math.round((pct / 100) * w);
  const empty = w - filled;
  const c = active ? GREEN : GRAY;
  return `${c}${'█'.repeat(filled)}${GRAY}${'░'.repeat(empty)}${RESET}`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export async function runOps(cliArgs: string[]): Promise<void> {
  const sub = cliArgs[0];
  const rt = makeRuntime();

  if (!sub || sub === 'feed') {
    const events = rt.getEvents(30);
    console.log(`\n  ${BOLD}${GOLD}Engineering Activity Feed${RESET}`);
    console.log(`  ${GRAY}${events.length} recent events  |  ${rt.getEventCount()} total  |  ${rt.getAllAgents().length} agents${RESET}\n`);

    if (events.length === 0) {
      console.log(`  ${GRAY}(no activity yet — run 'vestara ops demo' to see a simulation)${RESET}\n`);
      return;
    }

    for (const ev of events) {
      const icon = STATUS_ICONS[ev.status] ?? ' ';
      const time = ev.timestamp.slice(11, 19);
      console.log(`  ${time} ${icon} ${BOLD}${ev.agent}${RESET} ${ev.detail || ev.task || ev.operation}`);
    }
    console.log();
    return;
  }

  if (sub === 'status') {
    const agents = rt.getAllAgents();
    console.log(`\n  ${BOLD}${GOLD}Agent Status${RESET}`);
    console.log(`  ${GRAY}${'-'.repeat(40)}${RESET}\n`);
    for (const agent of agents) {
      printAgentCard(agent);
      console.log();
    }
    return;
  }

  if (sub === 'timeline') {
    const events = rt.getEvents(100);
    const agentFilter = cliArgs[1];
    console.log(`\n  ${BOLD}${GOLD}Engineering Timeline${RESET}\n`);

    const filtered = agentFilter ? events.filter((e) => e.agent === agentFilter) : events;

    if (filtered.length === 0) {
      if (agentFilter) {
        console.log(`  ${GRAY}(no events for agent '${agentFilter}')${RESET}\n`);
      } else {
        console.log(`  ${GRAY}(no events yet)${RESET}\n`);
      }
      return;
    }

    let lastMinute = '';
    for (const ev of filtered) {
      const time = ev.timestamp.slice(11, 19);
      const minute = time.slice(0, 5);
      if (minute !== lastMinute) {
        console.log(`  ${BOLD}${GRAY}${minute}${RESET}`);
        lastMinute = minute;
      }
      const icon = STATUS_ICONS[ev.status] ?? ' ';
      const file = ev.filePath ? ` ${GRAY}${ev.filePath}${RESET}` : '';
      console.log(`    ${icon} ${BOLD}${ev.agent}${RESET} ${ev.detail || ev.task}${file}`);
    }
    console.log();
    return;
  }

  if (sub === 'demo') {
    const rt2 = makeRuntime();
    rt2.trackOp('context', 'working', 'analyze', 'Reading AGENTS.md...', { progress: 30, phase: 'discovery', detail: 'Loading repository' });
    rt2.trackOp('context', 'completed', 'analyze', 'Loaded AGENTS.md', { progress: 100, detail: '✓ Loaded' });
    rt2.trackOp('planner', 'thinking', 'reason', 'Analyzing packages/workspace...', { progress: 0, phase: 'analysis', detail: 'Found 3 architectural issues' });
    rt2.trackOp('planner', 'working', 'plan', 'Generating task list', { progress: 50, phase: 'planning', detail: 'Prioritizing EV-004' });
    rt2.trackOp('planner', 'completed', 'plan', 'Task list generated', { progress: 100, detail: '4 tasks created' });
    rt2.trackOp('engineer', 'working', 'file.read', 'Reading runtime.ts...', { filePath: 'packages/runtime/src/index.ts', progress: 20, detail: 'Analyzing exports' });
    rt2.trackOp('engineer', 'working', 'file.write', 'Writing types.ts...', { filePath: 'packages/runtime/src/types.ts', progress: 60, detail: 'Adding GraphRuntime interface' });
    rt2.trackOp('engineer', 'working', 'file.write', 'Updating imports...', { filePath: 'packages/runtime/src/index.ts', progress: 85, detail: 'Re-exporting types' });
    rt2.trackOp('engineer', 'completed', 'file.write', 'Implementation complete', { progress: 100, detail: '4 files modified (+128 -43)' });
    rt2.trackOp('verifier', 'verifying', 'verify', 'Running build...', { progress: 30, phase: 'build', detail: 'TypeScript compilation' });
    rt2.trackOp('verifier', 'verifying', 'verify', 'Running tests...', { progress: 70, phase: 'test', detail: '12 passing, 0 failing' });
    rt2.trackOp('verifier', 'completed', 'verify', 'Verification complete', { progress: 100, detail: '✓ Build passed  ·  ✓ Tests passed  ·  ✓ Types correct' });
    rt2.trackOp('reviewer', 'reviewing', 'review', 'Reviewing changes...', { progress: 40, detail: 'Checking architecture compliance' });
    rt2.trackOp('reviewer', 'completed', 'review', 'Review complete', { progress: 100, detail: 'Approved — no architectural violations' });

    // Show feed and status inline since CLI invocations are stateless
    const events = rt2.getEvents(30);
    console.log(`\n  ${BOLD}${GOLD}Demo: Engineering Activity Feed${RESET}\n`);
    for (const ev of events) {
      const icon = STATUS_ICONS[ev.status] ?? ' ';
      const time = ev.timestamp.slice(11, 19);
      console.log(`  ${time} ${icon} ${BOLD}${ev.agent}${RESET} ${ev.detail || ev.task || ev.operation}`);
    }

    console.log(`\n  ${BOLD}${GOLD}Demo: Agent Status${RESET}\n`);
    for (const agent of rt2.getAllAgents()) {
      printAgentCard(agent);
      console.log();
    }
    return;
  }

  console.log(`${GOLD}Usage:${RESET}`);
  console.log(`  vestara ops feed              Live activity feed`);
  console.log(`  vestara ops status             Current agent statuses`);
  console.log(`  vestara ops timeline [agent]   Engineering timeline (optionally filtered)`);
  console.log(`  vestara ops demo               Generate demo events`);
}

export function getTelemetryRuntime(): TelemetryRuntime {
  return makeRuntime();
}
