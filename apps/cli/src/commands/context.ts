import * as fs from 'node:fs';
import * as path from 'node:path';
import { BOLD, GOLD, GREEN, RED, GRAY, RESET, CYAN } from '../output/format.js';

export async function runContext(): Promise<void> {
  console.log(); console.log(`${BOLD}${GOLD}Runtime Context${RESET}`); console.log(`${GRAY}─────────────────────────────────────${RESET}`); console.log();
  console.log(`  ${BOLD}Platform${RESET}`); console.log(`    Node:       ${process.version}`); console.log(`    Platform:   ${process.platform} ${process.arch}`); console.log(`    PID:        ${process.pid}`); console.log();
  const wsDir = path.join(process.cwd(), '.vestara');
  const manifestPath = path.join(wsDir, 'workspace.json');
  try {
    if (fs.existsSync(manifestPath)) {
      const raw = fs.readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(raw);
      console.log(`  ${BOLD}Workspace${RESET}`); console.log(`    Name:       ${manifest.name}`); console.log(`    ID:         ${manifest.id}`); console.log(`    Language:   ${manifest.analysis?.language || '?'}`); console.log(`    Monorepo:   ${manifest.analysis?.isMonorepo ? 'yes' : 'no'}`); console.log(`    Files:      ${manifest.analysis?.fileCount || '?'}`); console.log(`    Packages:   ${manifest.analysis?.packageCount || '?'}`); console.log();
      console.log(`  ${BOLD}Knowledge${RESET}`); console.log(`    Documents:  ${manifest.knowledge?.documents || 0}`); console.log(`    Chunks:     ${manifest.knowledge?.chunks || 0}`); console.log(`    Indexed:    ${manifest.knowledge?.lastIndexedAt ? new Date(manifest.knowledge.lastIndexedAt).toLocaleString() : `${GRAY}never${RESET}`}`); console.log();
      console.log(`  ${BOLD}Memory${RESET}`); console.log(`    Events:     ${manifest.memory?.count || 0}`); console.log(`    Last sync:  ${manifest.memory?.lastConsolidatedAt ? new Date(manifest.memory.lastConsolidatedAt).toLocaleString() : `${GRAY}never${RESET}`}`); console.log();
      if (manifest.narrativeCache) { console.log(`  ${BOLD}AI Narrative${RESET}`); console.log(`    Purpose:    ${manifest.narrativeCache.purpose?.slice(0, 80) || '(none)'}`); console.log(`    Cached:     ${new Date(manifest.narrativeCache.cachedAt).toLocaleString()}`); console.log(); }
    } else { console.log(`  ${GRAY}No workspace manifest. Run 'vestara open .' to initialize.${RESET}\n`); }
  } catch { console.log(`  ${GRAY}Manifest unavailable.${RESET}\n`); }

  try {
    const { OpenCodeProvider } = await import('@vestara/provider-opencode');
    const { DefaultProviderManager } = await import('@vestara/provider-runtime');
    const pm = new DefaultProviderManager();
    const ocp = new OpenCodeProvider();
    await pm.register(ocp); await ocp.initialize({});
    const health = await ocp.healthCheck();
    const healthIcon = health.status === 'healthy' ? `${GREEN}●${RESET}` : health.status === 'degraded' ? `${GOLD}●${RESET}` : `${RED}●${RESET}`;
    console.log(`  ${BOLD}Provider${RESET}`); console.log(`  ${healthIcon} OpenCode   ${GRAY}(${health.status}, ${health.modelCount} models, ${health.latency}ms)${RESET}`); console.log();
    const models = await ocp.listModels();
    console.log(`    Models: ${CYAN}${models.map((m: any) => m.id).join(', ')}${RESET}`); console.log();
  } catch { console.log(`  ${BOLD}Provider${RESET} ${GRAY}(unavailable)${RESET}\n`); }

  const prefsPath = path.join(wsDir, 'prefs.db');
  let activeModel = 'deepseek-v4-flash-free'; let activeProvider = 'opencode';
  try {
    if (fs.existsSync(prefsPath)) {
      const initSqlJs = (await import('sql.js')).default; const SQL = await initSqlJs();
      const buf = fs.readFileSync(prefsPath); const pdb = new SQL.Database(buf);
      const mrows = pdb.exec("SELECT value FROM preferences WHERE key = 'model'");
      const prow = pdb.exec("SELECT value FROM preferences WHERE key = 'provider'");
      if (mrows && mrows.length > 0 && mrows[0].values.length > 0) activeModel = String(mrows[0].values[0][0] ?? activeModel);
      if (prow && prow.length > 0 && prow[0].values.length > 0) activeProvider = String(prow[0].values[0][0] ?? activeProvider);
      pdb.close();
    }
  } catch {}
  console.log(`  ${BOLD}Active Configuration${RESET}`); console.log(`    Provider:   ${activeProvider}`); console.log(`    Model:      ${GREEN}${activeModel}${RESET}`); console.log(`    Context:    ${GRAY}${path.join(process.cwd(), '.vestara')}${RESET}`); console.log();
  console.log(`  ${BOLD}Storage${RESET}`);
  for (const [label, sp] of [['Manifest', manifestPath], ['Prefs DB', prefsPath], ['Plans', path.join(wsDir, 'plans', 'plans.db')], ['Sessions', path.join(wsDir, 'sessions')], ['Knowledge', path.join(wsDir, 'knowledge')], ['Memory', path.join(wsDir, 'memory')]] as [string, string][]) {
    console.log(`    ${label.padEnd(12)} ${fs.existsSync(sp) ? `${GREEN}✓${RESET}` : `${GRAY}○${RESET}`}  ${GRAY}${sp}${RESET}`);
  }
  console.log();
  console.log(`  ${BOLD}Context Assembler${RESET}`); console.log(`    Type:       ${GREEN}DefaultContextAssembler${RESET}`); console.log(`    History:    last 20 messages`); console.log(`    Change:     ${GRAY}vestara config set model <id>${RESET}`); console.log();
}
