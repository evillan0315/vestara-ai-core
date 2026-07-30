import * as fs from 'node:fs';
import * as path from 'node:path';
import { BOLD, GOLD, GREEN, RED, GRAY, RESET, CYAN } from '../output/format.js';

export async function runModelsList(): Promise<void> {
  console.log(); console.log(`${BOLD}${GOLD}Available AI Models${RESET}`); console.log(`${GRAY}────────────────────────────────────────────────────────────────${RESET}`); console.log();
  try {
    const { OpenCodeProvider } = await import('@vestara/provider-opencode');
    const ocp = new OpenCodeProvider(); await ocp.initialize({});
    const models = await ocp.listModels();
    if (models.length === 0) { console.log(`  ${GRAY}No models available. Provider may be offline.${RESET}\n`); return; }
    const namePad = Math.max(...models.map((m: any) => m.name.length), 10) + 2;
    const idPad = Math.max(...models.map((m: any) => m.id.length), 10) + 2;
    console.log(`  ${BOLD}Provider${RESET}  ${BOLD}Model ID${RESET.padEnd(idPad)}  ${BOLD}Name${RESET.padEnd(namePad)}  ${BOLD}Context${RESET}    ${BOLD}Max Out${RESET}   ${BOLD}Chat${RESET}  ${BOLD}Stream${RESET}  ${BOLD}FnCall${RESET}  ${BOLD}Vision${RESET}`);
    console.log(`  ${GRAY}────────  ${'─'.repeat(idPad + 6)}  ${'─'.repeat(namePad + 2)}  ───────  ───────  ────  ──────  ──────  ──────${RESET}`);
    for (const model of models as any[]) {
      const pricing = model.pricing ? `${GRAY}$${model.pricing.inputPerMillionTokens}/M in, $${model.pricing.outputPerMillionTokens}/M out${RESET}` : '';
      console.log(`  ${CYAN}opencode${RESET}  ${model.id.padEnd(idPad - 1)} ${model.name.padEnd(namePad - 1)} ${(model.contextWindow / 1000).toFixed(0)}K`.padEnd(8) + ` ${(model.maxOutput / 1000).toFixed(0)}K`.padEnd(8) + ` ${model.capabilities.chat ? `${GREEN}✓${RESET}` : `${GRAY}✗${RESET}`}   ${model.capabilities.streaming ? `${GREEN}✓${RESET}` : `${GRAY}✗${RESET}`}    ${model.capabilities.functionCalling ? `${GREEN}✓${RESET}` : `${GRAY}✗${RESET}`}    ${model.capabilities.vision ? `${GREEN}✓${RESET}` : `${GRAY}✗${RESET}`}   ${pricing}`);
    }
    console.log();
    const prefsPath = path.join(process.cwd(), '.vestara', 'prefs.db');
    if (fs.existsSync(prefsPath)) {
      try {
        const initSqlJs = (await import('sql.js')).default; const SQL = await initSqlJs();
        const buf = fs.readFileSync(prefsPath); const db = new SQL.Database(buf);
        const rows = db.exec("SELECT value FROM preferences WHERE key = 'model'");
        if (rows && rows.length > 0 && rows[0].values.length > 0) {
          const current = String(rows[0].values[0][0] ?? '');
          console.log(`  ${BOLD}Current model:${RESET} ${GREEN}${current}${RESET}`); console.log(`  ${GRAY}  Change with: vestara config set model <model-id>${RESET}`); console.log();
        }
        db.close();
      } catch {}
    }
  } catch (err: any) { console.log(`  ${RED}Error loading models: ${err.message}${RESET}\n`); }
}
