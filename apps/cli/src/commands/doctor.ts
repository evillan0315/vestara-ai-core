import * as fs from 'node:fs';
import * as path from 'node:path';
import { BOLD, GOLD, GREEN, RED, GRAY, RESET } from '../output/format.js';
import { openSharedDb } from '../lib/db.js';
import { DefaultKernel } from '@vestara/kernel';
import { OpenCodeProvider } from '@vestara/provider-opencode';
import { DefaultProviderManager } from '@vestara/provider-runtime';

export async function runDoctor(): Promise<void> {
  console.log(); console.log(`${BOLD}${GOLD}Vestara Doctor${RESET}`); console.log(`${GRAY}─────────────────────────────────────${RESET}`); console.log();
  const kernel = new DefaultKernel();
  try {
    const providerManager = new DefaultProviderManager(); const opencode = new OpenCodeProvider();
    await providerManager.register(opencode);
    await kernel.boot({ providers: [{ manager: providerManager, providerId: 'opencode' }], logLevel: 'warn' });
    const diagnosis = await kernel.diagnose();
    const overallColor = diagnosis.health.overall === 'healthy' ? `${GREEN}● ${BOLD}${diagnosis.health.overall}${RESET}` : diagnosis.health.overall === 'degraded' ? `${GOLD}● ${BOLD}${diagnosis.health.overall}${RESET}` : `${RED}● ${BOLD}${diagnosis.health.overall}${RESET}`;
    console.log(`  Overall Health: ${overallColor}`); console.log(`  Uptime:         ${diagnosis.uptime}s`); console.log(`  Version:        ${diagnosis.version}`); console.log();
    console.log(`  ${BOLD}Kernel${RESET}              ${GREEN}●${RESET} ${diagnosis.kernel.status}`); console.log(`  Boot duration    ${diagnosis.kernel.bootDuration}ms`); console.log();
    const healthyCount = diagnosis.services.filter((s: any) => s.health === 'healthy').length;
    const totalCount = diagnosis.services.length;
    console.log(`  ${BOLD}System Services${RESET}     ${healthyCount === totalCount ? `${GREEN}●${RESET}` : `${GOLD}●${RESET}`} ${healthyCount}/${totalCount} healthy`);
    for (const svc of diagnosis.services) {
      const icon = svc.health === 'healthy' ? `${GREEN}✔${RESET}` : svc.health === 'degraded' ? `${GOLD}⚠${RESET}` : `${RED}✗${RESET}`;
      console.log(`  ${icon} ${svc.id.padEnd(22)} ${svc.health.padEnd(12)} ${GRAY}${svc.latency > 0 ? `${svc.latency}ms` : '-'}${RESET}`);
    }
    console.log();
    const providers = kernel.providerManager?.listProviders() ?? [];
    if (providers.length > 0) {
      console.log(`  ${BOLD}Provider${RESET}`);
      for (const p of providers) {
        const icon = p.status === 'available' ? `${GREEN}●${RESET}` : p.status === 'degraded' ? `${GOLD}●${RESET}` : `${RED}●${RESET}`;
        console.log(`  ${icon} ${p.name.padEnd(22)} ${p.id} (${p.modelCount} models)`);
      }
      try { const health = await opencode.healthCheck(); console.log(`     ${' '.repeat(22)} Health: ${health.status === 'healthy' ? `${GREEN}${health.status}${RESET}` : `${GOLD}${health.status}${RESET}`}  ${GRAY}${health.latency}ms${RESET}`); } catch {}
      console.log();
    }
    try {
      const { VestaraAudioService, DefaultMicrophoneProvider, DefaultSpeakerProvider, SileroVADProvider } = await import('@vestara/audio');
      const audio = new VestaraAudioService();
      audio.registerMicrophone(new DefaultMicrophoneProvider()); audio.registerSpeaker(new DefaultSpeakerProvider()); audio.registerVAD(new SileroVADProvider());
      const ad = await audio.diagnose();
      console.log(`  ${BOLD}Audio Pipeline${RESET}`);
      console.log(`  ${ad.microphone.available ? `${GREEN}✔${RESET}` : `${RED}✗${RESET}`} Microphone     ${ad.microphone.available ? 'Ready' : 'Not found'}  ${GRAY}${ad.microphone.latency}ms${RESET}`);
      console.log(`  ${ad.vad.status !== 'error' ? `${GREEN}✔${RESET}` : `${RED}✗${RESET}`} VAD            ${ad.vad.status !== 'error' ? 'Ready' : 'Error'}  ${GRAY}${ad.vad.latency}ms${RESET}`);
      console.log();
    } catch {}
    try {
      const SQL = await (await import('sql.js')).default(); const db = new SQL.Database();
      const { AgentStorage, MilestoneService } = await import('@vestara/workspace');
      const store = new AgentStorage(db); const agents = await store.listAgents(); const execs = await store.listExecutions();
      const ms = new MilestoneService(); const progress = ms.getProgress();
      const completed = execs.filter((e: any) => e.status === 'completed').length;
      const failed = execs.filter((e: any) => e.status === 'failed').length;
      const total = execs.filter((e: any) => e.status !== 'running' && e.status !== 'queued').length || 1;
      console.log(`  ${BOLD}Platform Services${RESET}`);
      console.log(`  ${GREEN}✔${RESET} Agents          ${agents.length} registered (${agents.filter((a: any) => a.status === 'active').length} active)  ${GRAY}${execs.length} executions${RESET}`);
      console.log(`  ${failed === 0 ? `${GREEN}✔${RESET}` : `${GOLD}⚠${RESET}`} Executions      ${completed} ok · ${failed} failed · ${Math.round((completed / total) * 100)}% success`);
      console.log(`  ${GREEN}✔${RESET} Milestones      ${progress.completed}/${progress.total} complete (${progress.inProgress} active)`);
      console.log();
      try {
        const { ConversationScanner } = await import('@vestara/conversation-runtime');
        const scanner = new ConversationScanner(process.cwd()); const report = scanner.scan();
        console.log(`  ${BOLD}Conversation Features${RESET}`);
        console.log(`  ${report.summary.present === report.summary.total ? `${GREEN}✔${RESET}` : `${RED}✗${RESET}`} Packages        ${report.summary.present}/${report.summary.total} present`);
        console.log(`  ${report.summary.withDist === report.summary.total ? `${GREEN}✔${RESET}` : `${GOLD}⚠${RESET}`} Built           ${report.summary.withDist}/${report.summary.total}`);
        console.log(`  ${report.summary.withTests === report.summary.total ? `${GREEN}✔${RESET}` : `${GOLD}⚠${RESET}`} Tested          ${report.summary.withTests}/${report.summary.total}`);
        const errors = report.issues.filter((i: any) => i.severity === 'error').length;
        const warnings = report.issues.filter((i: any) => i.severity === 'warning').length;
        if (errors > 0 || warnings > 0) console.log(`  ${errors > 0 ? `${RED}✗${RESET}` : `${GOLD}⚠${RESET}`} Issues          ${errors} errors, ${warnings} warnings`);
        console.log();
      } catch {}
    } catch {}
    console.log(`  ${BOLD}Memory${RESET}`); console.log(`  Heap: ${diagnosis.resources.memory.heapUsed}MB / ${diagnosis.resources.memory.heapTotal}MB (${diagnosis.resources.memory.percentUsed}%)`); console.log();
    if (diagnosis.health.overall !== 'healthy') process.exitCode = 1;
    await kernel.shutdown();
  } catch { console.log(`  ${RED}Fatal: Unable to diagnose runtime${RESET}\n`); process.exit(1); }
}

export async function runDoctorConversation(): Promise<void> {
  console.log(); console.log(`${BOLD}${GOLD}Vestara Doctor Conversation${RESET}`); console.log(`${GRAY}─────────────────────────────────────${RESET}`); console.log();
  const { ProviderRouter, OpenCodeCloudProvider, LocalProvider } = await import('@vestara/conversation-runtime');
  const { DefaultProviderManager } = await import('@vestara/provider-runtime');
  const { OpenCodeProvider } = await import('@vestara/provider-opencode');
  const router = new ProviderRouter(); const pm = new DefaultProviderManager(); const ocp = new OpenCodeProvider();
  await pm.register(ocp); await ocp.initialize({});
  router.registerOnline(new OpenCodeCloudProvider(ocp)); router.registerOffline(new LocalProvider());
  const status = await router.getStatus();
  function srcIcon(s: boolean) { return s ? `${GREEN}●${RESET}` : `${RED}○${RESET}`; }
  function okIcon(s: boolean) { return s ? `${GREEN}✔${RESET}` : `${RED}✗${RESET}`; }
  console.log(`  ${BOLD}Conversation Engine${RESET}`); console.log(`  ────────────────────────────────────────`); console.log();
  console.log(`  ${BOLD}Provider Router${RESET}${status.failoverEnabled ? ` ${GREEN}✔${RESET} Failover Enabled` : ` ${GRAY}○${RESET} Single provider`}`); console.log();
  if (status.online) console.log(`  ${okIcon(status.online.connected)} OpenCode Cloud    ${status.online.connected ? 'Connected' : 'Unreachable'}${status.online.connected ? `  ${GRAY}${status.online.model}${RESET}` : ''}  ${GRAY}${status.online.latency}ms${RESET}`);
  else console.log(`  ${RED}○${RESET} OpenCode Cloud    Not configured`);
  if (status.offline) console.log(`  ${okIcon(status.offline.connected)} Local Provider    ${status.offline.connected ? 'Available' : 'Unavailable'}${status.offline.connected ? `  ${GRAY}${status.offline.model}${RESET}` : ''}  ${GRAY}${status.offline.latency}ms${RESET}`);
  else console.log(`  ${RED}○${RESET} Local Provider    Not configured`);
  console.log(); console.log(`  ${BOLD}Active Provider${RESET}`);
  if (status.active) { const srcLabel = status.active.source === 'online' ? 'OpenCode Cloud' : 'Local LLM'; console.log(`  ${srcIcon(status.active.connected)} ${srcLabel.padEnd(16)} ${status.active.model}`); console.log(`  ${GRAY}  Latency: ${status.active.latency}ms${RESET}`); }
  else { console.log(`  ${RED}○${RESET} No active provider`); console.log(`  ${GRAY}  Install Ollama for offline mode or check network for OpenCode Cloud${RESET}`); process.exitCode = 1; }
  console.log();
}

export async function runDoctorAudio(): Promise<void> {
  console.log(); console.log(`${BOLD}${GOLD}Vestara Doctor Audio${RESET}`); console.log(`${GRAY}─────────────────────────────────────${RESET}`); console.log();
  const { VestaraAudioService, DefaultMicrophoneProvider, DefaultSpeakerProvider, SileroVADProvider } = await import('@vestara/audio');
  const { VestaraSTTService, WhisperSTTProvider } = await import('@vestara/stt');
  const { VestaraTTSService, PiperTTSProvider } = await import('@vestara/tts');
  const audioService = new VestaraAudioService();
  audioService.registerMicrophone(new DefaultMicrophoneProvider()); audioService.registerSpeaker(new DefaultSpeakerProvider()); audioService.registerVAD(new SileroVADProvider());
  const sttService = new VestaraSTTService(); sttService.registerProvider(new WhisperSTTProvider());
  const ttsService = new VestaraTTSService(); ttsService.registerProvider(new PiperTTSProvider());
  const audioStatus = await audioService.diagnose(); const sttHealth = await sttService.healthCheck(); const ttsHealth = await ttsService.healthCheck();
  console.log(`  ${BOLD}Audio${RESET}`); console.log(`  ${audioStatus.microphone.available ? `${GREEN}✔${RESET}` : `${RED}✗${RESET}`} Microphone  ${audioStatus.microphone.available ? 'Ready' : 'Not found'}  ${GRAY}${audioStatus.microphone.latency}ms${RESET}`);
  console.log(`  ${audioStatus.speaker.available ? `${GREEN}✔${RESET}` : `${GRAY}○${RESET}`} Speaker     ${audioStatus.speaker.available ? 'Ready' : 'Not found'}  ${GRAY}${audioStatus.speaker.latency}ms${RESET}`);
  console.log(`  ${audioStatus.vad.status !== 'error' ? `${GREEN}✔${RESET}` : `${RED}✗${RESET}`} VAD         ${audioStatus.vad.status !== 'error' ? 'Ready' : 'Error'}  ${GRAY}${audioStatus.vad.latency}ms${RESET}`);
  console.log(); console.log(`  ${BOLD}Speech-to-Text${RESET}`); console.log(`  ${sttHealth.status === 'healthy' ? `${GREEN}✔${RESET}` : `${RED}✗${RESET}`} STT         ${sttHealth.status === 'healthy' ? 'Ready' : 'Unavailable'}  ${GRAY}${sttHealth.providers} provider(s)${RESET}`);
  console.log(); console.log(`  ${BOLD}Text-to-Speech${RESET}`); console.log(`  ${ttsHealth.status === 'healthy' ? `${GREEN}✔${RESET}` : `${RED}✗${RESET}`} TTS         ${ttsHealth.status === 'healthy' ? 'Ready' : 'Unavailable'}  ${GRAY}${ttsHealth.providers} provider(s)${RESET}`);
  console.log();
}

export async function runDoctorAgents(): Promise<void> {
  console.log(); console.log(`${BOLD}${GOLD}Vestara Doctor Agents${RESET}`); console.log(`${GRAY}─────────────────────────────────────${RESET}`); console.log();
  try {
    const db = await openSharedDb();
    const { AgentStorage, MilestoneService } = await import('@vestara/workspace');
    const store = new AgentStorage(db); const agents = await store.listAgents(); const execs = await store.listExecutions();
    const schedules = await store.listSchedules().catch(() => []); const teams = await store.listTeams().catch(() => []);
    const ms = new MilestoneService();
    const completed = execs.filter((e: any) => e.status === 'completed').length;
    const failed = execs.filter((e: any) => e.status === 'failed').length;
    const running = execs.filter((e: any) => e.status === 'running').length;
    const queued = execs.filter((e: any) => e.status === 'queued').length;
    const totalFinished = completed + failed;
    const successRate = totalFinished > 0 ? Math.round((completed / totalFinished) * 100) : 0;
    console.log(`  ${BOLD}Overview${RESET}`);
    console.log(`  ${agents.length === 8 ? `${GREEN}✔${RESET}` : `${GOLD}⚠${RESET}`} Agents registered:  ${agents.length}/8`);
    console.log(`  ${agents.filter((a: any) => a.status === 'active').length === agents.length ? `${GREEN}✔${RESET}` : `${GOLD}⚠${RESET}`} Active:           ${agents.filter((a: any) => a.status === 'active').length}/${agents.length}`);
    console.log(`  ${execs.length > 0 ? `${GREEN}✔${RESET}` : `${GRAY}○${RESET}`} Executions:      ${execs.length} total (${completed} ok, ${failed} failed, ${running} running, ${queued} queued)`);
    console.log(`  ${failed === 0 ? `${GREEN}✔${RESET}` : failed > 2 ? `${RED}✗${RESET}` : `${GOLD}⚠${RESET}`} Success rate:    ${successRate}%`);
    console.log(`  ${GREEN}✔${RESET} Schedules:      ${schedules.length} configured`);
    console.log(`  ${teams.length > 0 ? `${GREEN}✔${RESET}` : `${GRAY}○${RESET}`} Teams:           ${teams.length}`); console.log();
    console.log(`  ${BOLD}Per-Agent Health${RESET}`);
    for (const agent of agents) {
      const agentExecs = execs.filter((e: any) => e.agentId === agent.id || agent.id.includes(e.agentId));
      const aCompleted = agentExecs.filter((e: any) => e.status === 'completed').length;
      const aFailed = agentExecs.filter((e: any) => e.status === 'failed').length;
      const aRunning = agentExecs.filter((e: any) => e.status === 'running').length;
      const aTotal = aCompleted + aFailed;
      const aRate = aTotal > 0 ? Math.round((aCompleted / aTotal) * 100) : 0;
      console.log(`  ${aRunning > 0 ? `${GOLD}⚡${RESET}` : `${GREEN}●${RESET}`} ${agent.name.padEnd(22)} ${agent.status === 'active' ? `${GREEN}active${RESET}` : `${GRAY}disabled${RESET}`}  ${aTotal > 0 ? `${aCompleted}/${aTotal} (${aRate}%)` : 'no executions'}${aFailed > 0 ? `  ${RED}${aFailed} failed${RESET}` : ''}`);
    }
    console.log();
    const progress = ms.getProgress();
    console.log(`  ${BOLD}Milestones${RESET}`); console.log(`  ${GREEN}✔${RESET} Progress:       ${progress.completed}/${progress.total} (${progress.inProgress} active, ${progress.pending} pending)`); console.log();
    console.log(`${GRAY}  Run "vestara agents" for detailed agent list${RESET}`); console.log(`${GRAY}  Run "vestara doctor audio" for audio pipeline${RESET}`); console.log();
    if (agents.length === 0 || agents.filter((a: any) => a.status === 'active').length === 0) process.exitCode = 1;
  } catch (err: any) { console.log(`  ${RED}Error: ${err.message}${RESET}`); process.exitCode = 1; }
}

export async function runDoctorTeams(): Promise<void> {
  console.log(); console.log(`${BOLD}${GOLD}Vestara Doctor Teams${RESET}`); console.log(`${GRAY}─────────────────────────────────────${RESET}`); console.log();
  try {
    const db = await openSharedDb();
    const { AgentStorage } = await import('@vestara/workspace');
    const store = new AgentStorage(db); const agents = await store.listAgents(); const teams = await store.listTeams().catch(() => []); const execs = await store.listExecutions();
    const totalMembers = teams.reduce((s: number, t: any) => s + t.memberIds.length, 0);
    const agentsInTeams = agents.filter((a: any) => a.teamId || teams.some((t: any) => t.memberIds.includes(a.id))).length;
    const agentsWithoutTeams = agents.filter((a: any) => a.status === 'active' && !a.teamId && !teams.some((t: any) => t.memberIds.includes(a.id))).length;
    const teamsWithoutLeader = teams.filter((t: any) => !t.leaderAgentId).length;
    const teamsWithWorkflow = teams.filter((t: any) => t.activeWorkflowId).length;
    console.log(`  ${BOLD}Overview${RESET}`); console.log(`  ${teams.length > 0 ? `${GREEN}✔${RESET}` : `${GRAY}○${RESET}`} Total teams:     ${teams.length}`);
    console.log(`  ${totalMembers > 0 ? `${GREEN}✔${RESET}` : `${GRAY}○${RESET}`} Total members:   ${totalMembers} across ${teams.length} teams`);
    console.log(`  ${agentsInTeams > 0 ? `${GREEN}✔${RESET}` : `${GRAY}○${RESET}`} Agents in teams: ${agentsInTeams}/${agents.length}`);
    console.log(`  ${agentsWithoutTeams === 0 ? `${GREEN}✔${RESET}` : `${GOLD}⚠${RESET}`} Unassigned:      ${agentsWithoutTeams} active agents not in any team`);
    console.log(`  ${teamsWithoutLeader === 0 ? `${GREEN}✔${RESET}` : `${GOLD}⚠${RESET}`} Teams w/o leader: ${teamsWithoutLeader}`);
    console.log(`  ${GREEN}✔${RESET} Workflows:       ${teamsWithWorkflow} teams with active workflows`); console.log();
    if (teams.length > 0) {
      console.log(`  ${BOLD}Per-Team Health${RESET}`);
      for (const team of teams) {
        const leader = agents.find((a: any) => a.id === team.leaderAgentId);
        const members = agents.filter((a: any) => team.memberIds.includes(a.id) || a.teamId === team.id);
        const memberExecs = members.map((m: any) => execs.filter((e: any) => e.agentId === m.id || m.id.includes(e.agentId)));
        const totalExecs = memberExecs.reduce((s: number, es: any[]) => s + es.length, 0);
        const failedExecs = memberExecs.reduce((s: number, es: any[]) => s + es.filter((e: any) => e.status === 'failed').length, 0);
        const runningExecs = memberExecs.reduce((s: number, es: any[]) => s + es.filter((e: any) => e.status === 'running').length, 0);
        console.log(`  ${leader ? `${GREEN}●${RESET}` : `${GOLD}⚠${RESET}`} ${team.name.padEnd(22)} ${members.length} members, ${totalExecs} exec, ${failedExecs} failed${runningExecs > 0 ? `, ${runningExecs} running` : ''}`);
        console.log(`  ${' '.repeat(4)}${GRAY}Members: ${members.map((m: any) => m.name).join(', ') || '(none)'}${RESET}`);
        if (leader) console.log(`  ${' '.repeat(4)}${GRAY}Leader: ${leader.name}${RESET}`);
        else console.log(`  ${' '.repeat(4)}${GOLD}⚠ No leader assigned${RESET}`); console.log();
      }
    }
    if (agentsWithoutTeams > 0) {
      console.log(`  ${BOLD}Unassigned Agents${RESET}`);
      const unassigned = agents.filter((a: any) => a.status === 'active' && !a.teamId && !teams.some((t: any) => t.memberIds.includes(a.id)));
      for (const a of unassigned) console.log(`  ${GRAY}○${RESET} ${a.name.padEnd(22)} ${a.role}`);
      console.log();
    }
    console.log(`${GRAY}  Recommendations:${RESET}`);
    if (teamsWithoutLeader > 0) console.log(`${GRAY}    Assign leaders to ${teamsWithoutLeader} team(s)${RESET}`);
    if (agentsWithoutTeams > 0) console.log(`${GRAY}    Assign ${agentsWithoutTeams} unassigned agent(s) to teams${RESET}`);
    if (teams.length === 0) console.log(`${GRAY}    Create teams to organize agents by function${RESET}`); console.log();
    if (teamsWithoutLeader > 0 || agentsWithoutTeams > 0) process.exitCode = 1;
  } catch (err: any) { console.log(`  ${RED}Error: ${err.message}${RESET}`); process.exitCode = 1; }
}

export async function runDoctorModels(): Promise<void> {
  console.log(); console.log(`${BOLD}${GOLD}Provider & Model Diagnostics${RESET}`); console.log(`${GRAY}─────────────────────────────────────${RESET}`); console.log();
  try {
    const { OpenCodeProvider } = await import('@vestara/provider-opencode');
    const ocp = new OpenCodeProvider(); await ocp.initialize({});
    const health = await ocp.healthCheck();
    const healthIcon = health.status === 'healthy' ? `${GREEN}●${RESET}` : health.status === 'degraded' ? `${GOLD}●${RESET}` : `${RED}●${RESET}`;
    console.log(`  ${BOLD}OpenCode Provider${RESET}`); console.log(`  ${healthIcon} Status:     ${health.status}`); console.log(`    Latency:    ${health.latency}ms`); console.log(`    Heartbeat:  ${health.lastHeartbeat ? new Date(health.lastHeartbeat).toLocaleString() : 'never'}`); if (health.message) console.log(`    Message:    ${health.message}`); console.log();
    const models = await ocp.listModels();
    console.log(`  ${BOLD}Available Models (${models.length})${RESET}`);
    for (const m of models) {
      const features: string[] = []; if (m.capabilities.chat) features.push('chat'); if (m.capabilities.streaming) features.push('streaming'); if (m.capabilities.functionCalling) features.push('function-calling'); if (m.capabilities.vision) features.push('vision');
      const pricing = m.pricing && m.pricing.inputPerMillionTokens === 0 && m.pricing.outputPerMillionTokens === 0 ? 'free' : `$${m.pricing?.inputPerMillionTokens ?? '?'} in / $${m.pricing?.outputPerMillionTokens ?? '?'} out`;
      console.log(`  ${GREEN}✓${RESET} ${m.name}  ${GRAY}(${m.id})${RESET}`); console.log(`       Context: ${(m.contextWindow / 1000).toFixed(0)}K  ·  Output: ${(m.maxOutput / 1000).toFixed(0)}K  ·  ${pricing}`); console.log(`       Features: ${features.join(', ')}`); console.log();
    }
    const prefsPath = path.join(process.cwd(), '.vestara', 'prefs.db');
    if (fs.existsSync(prefsPath)) {
      try {
        const initSqlJs = (await import('sql.js')).default; const SQL = await initSqlJs(); const buf = fs.readFileSync(prefsPath); const db = new SQL.Database(buf);
        const rows = db.exec("SELECT value FROM preferences WHERE key = 'model'"); const prow = db.exec("SELECT value FROM preferences WHERE key = 'provider'");
        const currentModel = rows && rows.length > 0 && rows[0].values.length > 0 ? String(rows[0].values[0][0] ?? '') : 'default';
        const currentProvider = prow && prow.length > 0 && prow[0].values.length > 0 ? String(prow[0].values[0][0] ?? '') : 'default';
        console.log(`  ${BOLD}Active Configuration${RESET}`); console.log(`    Provider:   ${currentProvider}`); console.log(`    Model:      ${currentModel}`); console.log(`    Change:     vestara config set model <model-id>`); console.log(); db.close();
      } catch {}
    }
  } catch (err: any) { console.log(`  ${RED}Diagnostic error: ${err.message}${RESET}\n`); process.exitCode = 1; }
}

export async function runDoctorWorkspace(): Promise<void> {
  console.log(); console.log(`${BOLD}${GOLD}Workspace Diagnostics${RESET}`); console.log(`${GRAY}─────────────────────────────────────${RESET}`); console.log();
  const wsDir = path.join(process.cwd(), '.vestara');
  const checks: { label: string; ok: boolean; detail?: string }[] = [];
  const hasDir = fs.existsSync(wsDir); checks.push({ label: '.vestara directory', ok: hasDir, detail: hasDir ? wsDir : 'not found' });
  const manifestPath = path.join(wsDir, 'workspace.json'); const hasManifest = fs.existsSync(manifestPath); checks.push({ label: 'workspace.json', ok: hasManifest });
  let manifest: any = null;
  if (hasManifest) { try { const raw = fs.readFileSync(manifestPath, 'utf-8'); manifest = JSON.parse(raw); checks.push({ label: 'Manifest valid JSON', ok: true }); } catch { checks.push({ label: 'Manifest valid JSON', ok: false, detail: 'parse error' }); } }
  checks.push({ label: 'prefs.db', ok: fs.existsSync(path.join(wsDir, 'prefs.db')) });
  checks.push({ label: 'Plans database', ok: fs.existsSync(path.join(wsDir, 'plans', 'plans.db')) });
  checks.push({ label: 'Knowledge directory', ok: fs.existsSync(path.join(wsDir, 'knowledge')) });
  checks.push({ label: 'Memory directory', ok: fs.existsSync(path.join(wsDir, 'memory')) });
  checks.push({ label: 'Sessions directory', ok: fs.existsSync(path.join(wsDir, 'sessions')) });
  let allOk = true;
  for (const check of checks) { console.log(`  ${check.ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`} ${check.label.padEnd(22)} ${check.detail ? GRAY + check.detail + RESET : ''}`); if (!check.ok) allOk = false; }
  console.log();
  if (manifest) { console.log(`  ${BOLD}Workspace Summary${RESET}`); console.log(`    Name:       ${manifest.name || '?'}`); console.log(`    ID:         ${manifest.id || '?'}`); console.log(`    Language:   ${manifest.analysis?.language || '?'}`); console.log(`    Files:      ${manifest.analysis?.fileCount ?? '?'}`); console.log(`    Packages:   ${manifest.analysis?.packageCount ?? '?'}`); console.log(`    Knowledge:  ${manifest.knowledge?.documents ?? 0} docs, ${manifest.knowledge?.chunks ?? 0} chunks`); console.log(`    Memory:     ${manifest.memory?.count ?? 0} events`); console.log(); }
  console.log(`  ${BOLD}Verdict${RESET}`);
  if (allOk) console.log(`  ${GREEN}✓${RESET} All workspace storage paths verified.`);
  else { console.log(`  ${RED}✗${RESET} ${checks.filter((c) => !c.ok).length} issue(s) detected:`); for (const f of checks.filter((c) => !c.ok)) console.log(`    - ${f.label}${f.detail ? `: ${f.detail}` : ''}`); process.exitCode = 1; }
  console.log();
}

export async function runDoctorAll(): Promise<void> {
  console.log(); console.log(`${BOLD}${GOLD}Full System Diagnostics${RESET}`); console.log(`${GRAY}─────────────────────────────────────${RESET}`); console.log();
  process.exitCode = 0;
  const sections: Array<{ name: string; fn: () => Promise<void> }> = [
    { name: 'General Health', fn: runDoctor }, { name: 'Workspace', fn: runDoctorWorkspace },
    { name: 'Provider & Models', fn: runDoctorModels }, { name: 'Conversation', fn: runDoctorConversation },
    { name: 'Audio', fn: runDoctorAudio }, { name: 'Agents', fn: runDoctorAgents }, { name: 'Teams', fn: runDoctorTeams },
  ];
  for (const section of sections) {
    console.log(`${BOLD}${GOLD}▸ ${section.name}${RESET}`);
    try { await section.fn(); } catch (err: any) { console.log(`  ${RED}Error in ${section.name}: ${err.message}${RESET}\n`); process.exitCode = 1; }
  }
  if (process.exitCode !== 0) process.exit(process.exitCode);
}
