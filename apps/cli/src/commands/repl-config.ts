import type { WorkspaceSession } from '@vestara/workspace';
import { BOLD, GOLD, GRAY, GREEN, RED, RESET } from '../output/format.js';

export async function handleConfigSet(
  input: string,
  line: string,
  session: WorkspaceSession,
  rl: any,
): Promise<boolean> {
  if (!input.startsWith('config set ') || input.length <= 11) return false;
  const rest = line.slice(11).trim();
  const spaceIdx = rest.indexOf(' ');
  const key = spaceIdx > 0 ? rest.slice(0, spaceIdx) : rest;
  const value = spaceIdx > 0 ? rest.slice(spaceIdx + 1) : '';
  if (!key || !value) {
    console.log(`${GRAY}  Usage: config set <key> <value>${RESET}`);
    rl.prompt();
    return true;
  }
  if (key === 'model' || key === 'provider') {
    try {
      const { WorkspaceManifest } = await import('@vestara/workspace');
      const manifest = await WorkspaceManifest.load(session.workspaceDir);
      const providers = manifest?.providers ?? [];
      if (key === 'provider' && providers.length > 0) {
        const match = providers.find((p: any) => p.id === value);
        if (!match) {
          console.log(`\n${RED}  Provider "${value}" not found in registry.${RESET}\n`);
          rl.prompt();
          return true;
        }
      }
      if (key === 'model' && providers.length > 0) {
        const currentProvider = session.prefs.get('provider');
        const prov = providers.find((p: any) => p.id === currentProvider);
        if (prov && !prov.models.find((m: any) => m.id === value)) {
          console.log(`\n${GOLD}  \u26A0 Model "${value}" not registered for provider "${currentProvider}".${RESET}\n`);
          rl.prompt();
          return true;
        }
      }
    } catch {}
  }
  session.prefs.set(key, value);
  console.log(`\n${GREEN}  ${key} updated to: ${value}${RESET}\n`);
  rl.prompt();
  return true;
}

export async function handleConfigList(input: string, session: WorkspaceSession, rl: any): Promise<boolean> {
  if (input !== 'config list' && input !== 'config') return false;
  try {
    process.stdout.write(`\n${session.prefs.renderAll()}\n`);
    const { WorkspaceManifest } = await import('@vestara/workspace');
    const manifest = await WorkspaceManifest.load(session.workspaceDir);
    if (manifest?.providers && manifest.providers.length > 0) {
      const activeProv = manifest.providers.find((p: any) => p.enabled);
      if (activeProv) {
        const activeModels = activeProv.models.filter((m: any) => m.enabled).map((m: any) => m.id);
        console.log(`\n  Provider Registry: ${manifest.providers.length} provider(s) configured`);
        console.log(`  Active: ${activeProv.id} (${activeModels.length} model(s) enabled)`);
        if (activeModels.length > 0) console.log(`  Models: ${activeModels.join(', ')}`);
      } else console.log(`\n  ${GOLD}\u26A0 No enabled providers in registry${RESET}`);
    }
  } catch (e: any) {
    console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
  }
  rl.prompt();
  return true;
}

export async function handleConfigReset(
  input: string,
  line: string,
  session: WorkspaceSession,
  rl: any,
): Promise<boolean> {
  if (!input.startsWith('config reset ')) return false;
  const key = line.slice(13).trim();
  if (!key) {
    console.log(`${GRAY}  Usage: config reset <key>${RESET}`);
    rl.prompt();
    return true;
  }
  session.prefs.reset(key);
  console.log(`\n${GREEN}  ${key} reset to: ${session.prefs.get(key)}${RESET}\n`);
  rl.prompt();
  return true;
}
