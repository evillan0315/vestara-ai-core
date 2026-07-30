import { BOLD, GOLD, GREEN, RED, GRAY, RESET, CYAN } from '../output/format.js';
import type { WorkspaceSession } from '@vestara/workspace';

async function getPlanDb(session: WorkspaceSession): Promise<any> {
  const path = await import('node:path'); const fs = await import('node:fs');
  const dbDir = path.join(session.workspaceDir, 'plans'); fs.mkdirSync(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, 'plans.db');
  const initSqlJs = (await import('sql.js')).default; const SQL = await initSqlJs();
  let db: any; if (fs.existsSync(dbPath)) { const buffer = fs.readFileSync(dbPath); db = new SQL.Database(buffer); } else db = new SQL.Database();
  return db;
}

export async function handleImplement(input: string, line: string, session: WorkspaceSession, provider: any, rl: any): Promise<boolean> {
  if (!input.startsWith('implement ')) return false;
  const sub = input.startsWith('implement show ') ? 'show' : input.startsWith('implement apply ') ? 'apply' : input.startsWith('implement decision ') ? 'decision' : input.startsWith('implement plan ') ? 'plan' : 'default';
  const db = await getPlanDb(session);
  const { PlanStorage, ChangeSetStorage, ImplementationService } = await import('@vestara/workspace');
  const impl = new ImplementationService({ planStorage: new PlanStorage(db), csStorage: new ChangeSetStorage(db), provider });
  if (sub === 'show') {
    const csId = line.slice(14).trim().toUpperCase();
    const cs = await impl.getChangeSet(csId);
    if (!cs) console.log(`${GRAY}  Change Set "${csId}" not found.${RESET}`);
    else process.stdout.write(`\n${impl.renderChangeSet(cs)}\n`);
  } else if (sub === 'apply') {
    const csId = line.slice(15).trim().toUpperCase();
    const cs = await impl.apply(csId, session);
    if (cs) console.log(`\n${GREEN}  Change Set "${csId}" applied.${RESET}\n`);
    else console.log(`${GRAY}  Change Set "${csId}" not found.${RESET}`);
  } else if (sub === 'decision') {
    const decId = line.slice(19).trim().toUpperCase();
    console.log(`${GRAY}  Generating implementation from decision ${decId}...${RESET}`);
    const result = await impl.implementFromDecision(decId, session);
    process.stdout.write(`\n${impl.renderChangeSet(result.changeSet)}\n`);
  } else if (sub === 'plan') {
    const planId = line.slice(13).trim().toUpperCase();
    const result = await impl.implement(planId, session);
    process.stdout.write(`\n${impl.renderChangeSet(result.changeSet)}\n`);
  } else if (sub === 'default') {
    const planId = line.slice(11).trim().toUpperCase();
    if (planId) { const result = await impl.implement(planId, session); process.stdout.write(`\n${impl.renderChangeSet(result.changeSet)}\n`); }
    else console.log(`${GRAY}  Usage: implement <plan-id> or implement show/apply/decision/plan${RESET}`);
  }
  rl.prompt(); return true;
}

export async function handleVerify(input: string, line: string, session: WorkspaceSession, rl: any): Promise<boolean> {
  if (!input.startsWith('verify ')) return false;
  const db = await getPlanDb(session);
  const { PlanStorage, VerificationStorage, VerificationService } = await import('@vestara/workspace');
  const csStore = new (await import('@vestara/workspace')).ChangeSetStorage(db);
  const svc = new VerificationService({ planStorage: new PlanStorage(db), csStorage: csStore, vrStorage: new VerificationStorage(db) });
  if (input === 'verify accuracy' || input === 'predict accuracy') { console.log(`${GREEN}  Prediction accuracy: data pending${RESET}`); }
  else if (input === 'verify trends') { console.log(`${GREEN}  Verification trends: data pending${RESET}`); }
  else if (input.startsWith('verify show ')) {
    const vrId = line.slice(12).trim().toUpperCase();
    const report = await svc.getReport(vrId);
    if (!report) console.log(`${GRAY}  Report "${vrId}" not found.${RESET}`);
    else process.stdout.write(`\n${svc.renderReport(report)}\n`);
  } else if (input === 'verify workspace') { process.stdout.write(`\n${svc.renderReport((await svc.verifyWorkspace(session)) as any)}\n`); }
  else if (input.startsWith('verify plan ')) {
    const planId = line.slice(12).trim().toUpperCase();
    console.log(`${GRAY}  Running plan verification...${RESET}`);
    process.stdout.write(`\n${svc.renderReport((await svc.verifyPlan(planId, session)) as any)}\n`);
  } else if (input.startsWith('verify ')) {
    const csId = line.slice(7).trim().toUpperCase();
    if (csId) { process.stdout.write(`\n${svc.renderReport((await svc.verify(csId, session)) as any)}\n`); }
    else console.log(`${GRAY}  Usage: verify <cs-id> | verify workspace | verify plan <id>${RESET}`);
  }
  rl.prompt(); return true;
}

export async function handleCollab(input: string, line: string, session: WorkspaceSession, rl: any): Promise<boolean> {
  if (!input.startsWith('collab') && !input.startsWith('collaborate')) return false;
  const db = await getPlanDb(session);
  const { CollaborationStorage, CollaborationService, ChangeSetStorage } = await import('@vestara/workspace');
  const collab = new CollaborationService({ storage: new CollaborationStorage(db) });
  const collabStore = new CollaborationStorage(db);
  if (input === 'collab list' || input === 'collaborate list') {
    const items = await collabStore.listByWorkspace(session.fingerprint.id);
    if (items.length === 0) console.log(`${GRAY}  No collaboration records.${RESET}`);
    else for (const c of items as any[]) console.log(`  ${c.id}: ${c.title || c.id} (${c.status})`);
  } else {
    const prefix = input.startsWith('collaborate ') ? 12 : 6;
    const parts = line.slice(prefix).trim().split(' ');
    const sub = parts[0]; const id = parts[1]?.toUpperCase();
    if (sub === 'status' && id) {
      const records = await collabStore.listByWorkspace(session.fingerprint.id);
      const record = records.find((r: any) => r.id === id);
      if (record) { console.log(`\n  ${BOLD}${(record as any).title || record.id}${RESET} (${record.id})`); console.log(`  Status: ${record.status}`); console.log(`  Reviewers: ${record.ownership.reviewers.join(', ')}`); console.log(); }
    } else if (sub === 'comment' && id) {
      const message = parts.slice(2).join(' '); await (collab as any).addComment(id, message, session);
      console.log(`${GREEN}  Comment added to ${id}.${RESET}`);
    } else if (sub === 'approve' && id) { await collab.approve(id, session.fingerprint.id); console.log(`${GREEN}  ${id} approved.${RESET}`); }
    else if (sub === 'reject' && id) { const reason = parts.slice(2).join(' ') || 'No reason given'; await collab.reject(id, session.fingerprint.id, reason); console.log(`${GREEN}  ${id} rejected.${RESET}`); }
  }
  rl.prompt(); return true;
}

export async function handlePredict(input: string, line: string, session: WorkspaceSession, provider: any, rl: any): Promise<boolean> {
  if (!input.startsWith('predict')) return false;
  const db = await getPlanDb(session);
  const { ImpactStorage, PredictionService, PlanStorage } = await import('@vestara/workspace');
  const svc = new PredictionService({ storage: new ImpactStorage(db), planStorage: new PlanStorage(db), provider });
  if (input.startsWith('predict plan ')) {
    const planId = line.slice(13).trim().toUpperCase();
    if (!planId) { console.log(`${GRAY}  Usage: predict plan <id>${RESET}`); rl.prompt(); return true; }
    process.stdout.write(`\n${GRAY}  Analyzing...${RESET}\n\n`);
    const assessment = await svc.predictPlan(planId, session);
    if (assessment) process.stdout.write(`${svc.render(assessment)}\n`); else console.log(`${GRAY}  Plan "${planId}" not found.${RESET}`);
  } else if (input.startsWith('predict compare ')) {
    const parts = line.slice(16).trim().toUpperCase().split(' ');
    if (parts.length < 2) { console.log(`${GRAY}  Usage: predict compare <id1> <id2>${RESET}`); return true; }
    console.log(`\n${await svc.compare(parts[0], parts[1])}\n`);
  } else if (input.startsWith('predict history')) {
    const history = await svc.list(session.fingerprint.id);
    if (history.length === 0) console.log(`${GRAY}  No predictions yet.${RESET}`);
    else for (const a of history) console.log(`  ${a.id}: ${a.target} (risk: ${a.risk.level}, health: ${a.health.current} \u2192 ${a.health.predicted})`);
  } else if (input.startsWith('predict ')) {
    const goal = line.slice(8).trim();
    if (!goal) { console.log(`${GRAY}  Usage: predict <goal>${RESET}`); rl.prompt(); return true; }
    process.stdout.write(`\n${GRAY}  Analyzing...${RESET}\n\n`); process.stdout.write(`${svc.render(await svc.predict(goal, session))}\n`);
  }
  rl.prompt(); return true;
}

export async function handleSuggest(input: string, session: WorkspaceSession, provider: any, rl: any): Promise<boolean> {
  if (input !== 'suggest' && !input.startsWith('suggest ')) return false;
  const { SuggestionService } = await import('@vestara/workspace');
  process.stdout.write(`\n${GRAY}  Analyzing workspace...${RESET}\n\n`);
  process.stdout.write(`${await new SuggestionService({ provider }).aiSuggest(session)}\n`);
  rl.prompt(); return true;
}

export async function handleRecommend(input: string, line: string, session: WorkspaceSession, provider: any, rl: any): Promise<boolean> {
  if (!input.startsWith('recommend')) return false;
  const db = await getPlanDb(session);
  const { DecisionStorage, DecisionService, PlanStorage, ImpactStorage } = await import('@vestara/workspace');
  const svc = new DecisionService({ storage: new DecisionStorage(db), planStorage: new PlanStorage(db), impactStorage: new ImpactStorage(db), provider });
  if (input.startsWith('recommend accept ')) {
    const decId = line.slice(17).trim().toUpperCase();
    const dec = await svc.accept(decId, 'current-user');
    if (!dec) console.log(`${GRAY}  Decision "${decId}" not found.${RESET}`); else console.log(`\n${GREEN}  Decision ${decId} accepted.${RESET}\n`);
  } else if (input === 'recommend history') {
    const decisions = await svc.list(session.fingerprint.id);
    if (decisions.length === 0) console.log(`${GRAY}  No recommendations yet.${RESET}`);
    else for (const d of decisions) console.log(`  ${d.accepted ? '\u2713' : '\u00B7'} ${d.id}: ${d.recommendation.slice(0, 80)} (${(d.confidence * 100).toFixed(0)}%)`);
  } else if (input === 'recommend next' || input === 'recommend') {
    process.stdout.write(`\n${GRAY}  Analyzing...${RESET}\n\n`);
    process.stdout.write(`${svc.render(input === 'recommend next' ? await svc.recommendNext(session) : await svc.recommend(session))}\n`);
  } else if (input.startsWith('recommend plan ')) {
    const planId = line.slice(15).trim().toUpperCase();
    process.stdout.write(`\n${GRAY}  Analyzing...${RESET}\n\n`);
    process.stdout.write(`${svc.render(await svc.recommendPlan(planId, session))}\n`);
  }
  rl.prompt(); return true;
}

export async function handleAgent(input: string, line: string, session: WorkspaceSession, provider: any, rl: any): Promise<boolean> {
  if (!input.startsWith('agent') && input !== 'agents') return false;
  const db = await getPlanDb(session);
  const { AgentStorage, AgentRuntime } = await import('@vestara/workspace');
  const runtime = new AgentRuntime({ storage: new AgentStorage(db), provider });
  if (input === 'agent list' || input === 'agents') { process.stdout.write(`\n${runtime.renderAgentList(await runtime.listAgents())}\n`); }
  else if (input.startsWith('agent inspect ')) {
    const agentId = line.slice(14).trim();
    const agent = await runtime.getAgent(agentId);
    if (!agent) console.log(`${GRAY}  Agent "${agentId}" not found.${RESET}`); else process.stdout.write(`\n${runtime.renderAgentDetail(agent)}\n`);
  } else if (input.startsWith('agent run ')) {
    const rest = line.slice(10).trim(); const spaceIdx = rest.indexOf(' ');
    if (spaceIdx <= 0) { console.log(`${GRAY}  Usage: agent run <agent-id> "<task>"${RESET}`); rl.prompt(); return true; }
    const agentId = rest.slice(0, spaceIdx); const task = rest.slice(spaceIdx + 1);
    process.stdout.write(`\n${GRAY}  Running agent "${agentId}"...${RESET}\n\n`);
    process.stdout.write(`${runtime.renderExecution((await runtime.run(agentId, task, session)).execution)}\n`);
  }
  rl.prompt(); return true;
}

export async function handleWorkflow(input: string, line: string, session: WorkspaceSession, provider: any, rl: any): Promise<boolean> {
  if (!input.startsWith('workflow') && !input.startsWith('wf')) return false;
  const initSqlJs = (await import('sql.js')).default; const SQL = await initSqlJs(); const db = new SQL.Database();
  const { PlanStorage, ChangeSetStorage, VerificationStorage, AgentWorkflowService } = await import('@vestara/workspace');
  const svc = new AgentWorkflowService({ planStorage: new PlanStorage(db), csStorage: new ChangeSetStorage(db), vrStorage: new VerificationStorage(db), provider });
  if (input === 'workflow list' || input === 'workflows' || input === 'wf list') {
    process.stdout.write(`\n${svc.renderDefinitionList()}\n`); console.log(`${GRAY}  Use "workflow start <id> <goal>" to begin${RESET}`);
  } else if (input.startsWith('workflow start ') || input.startsWith('wf start ')) {
    const rest = line.slice(input.startsWith('wf') ? 9 : 15).trim(); const spaceIdx = rest.indexOf(' ');
    const wfId = spaceIdx > 0 ? rest.slice(0, spaceIdx) : rest; const goal = spaceIdx > 0 ? rest.slice(spaceIdx + 1) : '';
    if (!wfId || !goal) { console.log(`${GRAY}  Usage: workflow start <id> "<goal>"${RESET}`); rl.prompt(); return true; }
    const wf = svc.start(wfId, goal); console.log(`\n${GRAY}  Running workflow: ${wf.name} (${wf.steps.length} steps)...${RESET}\n`);
    const result = await svc.run(wf.id, session); process.stdout.write(`\n${svc.renderInstance(result)}\n`);
    console.log(result.status === 'completed' ? `\n${GREEN}  \u2705 Workflow complete${RESET}\n` : `\n${RED}  \u274C Workflow failed${RESET}\n`);
  } else if (input === 'workflow status' || input === 'wf status') {
    const instances = svc.listInstances();
    if (instances.length === 0) console.log(`${GRAY}  No workflow instances.${RESET}`);
    else for (const wf of instances) process.stdout.write(`\n${svc.renderInstance(wf)}\n`);
  }
  rl.prompt(); return true;
}

export async function handlePlugin(input: string, line: string, session: WorkspaceSession, rl: any): Promise<boolean> {
  if (!input.startsWith('plugin')) return false;
  const db = await getPlanDb(session);
  const { PluginRegistry, PluginRuntime } = await import('@vestara/workspace');
  const rt = new PluginRuntime({ registry: new PluginRegistry(db) });
  if (input.startsWith('plugin exec ')) {
    const hook = line.slice(12).trim();
    if (!hook) { console.log(`${GRAY}  Usage: plugin exec <hook>${RESET}`); rl.prompt(); return true; }
    const results = await rt.executeHook(hook, session);
    console.log(`\n  Hook "${hook}" executed on ${results.length} plugin(s):\n`);
    for (const r of results) console.log(`  ${r.status === 'success' ? '\u2713' : '\u2717'} ${r.pluginId} (${r.duration}ms): ${r.message}`);
    console.log('');
  } else if (input.startsWith('plugin info ')) {
    const pluginId = line.slice(12).trim();
    const plugin = await rt.getPlugin(pluginId);
    if (plugin) { console.log(`\n  ${BOLD}${plugin.name}${RESET} (${plugin.id})`); console.log(`  Version: ${plugin.version}`); console.log(`  Hooks: ${plugin.hooks.join(', ')}`); console.log(); }
    else console.log(`${GRAY}  Plugin "${pluginId}" not found.${RESET}`);
  } else if (input.startsWith('plugin toggle ')) {
    const pluginId = line.slice(14).trim();
    const plugin = await rt.togglePlugin(pluginId);
    if (!plugin) console.log(`${GRAY}  Plugin "${pluginId}" not found.${RESET}`);
    else console.log(`\n${GREEN}  Plugin ${plugin.id} toggled: ${(plugin as any).status}${RESET}\n`);
  } else if (input.startsWith('plugin list') || input === 'plugins') {
    const plugins = await rt.listPlugins(); console.log(`\n  ${plugins.length} plugin(s) registered:`);
    for (const p of plugins) console.log(`  ${p.id.padEnd(20)} ${p.name} (${p.version})  ${GRAY}${p.hooks.length} hooks${RESET}`);
    console.log('');
  }
  rl.prompt(); return true;
}
