/**
 * Durable appearance persistence — the generic, reachable path for approved
 * visual changes to survive reload.
 *
 * Invariant (post-ORB Run 4): an accepted behavior is reachable through the
 * actual user-visible execution path. The appearance the Director approves in
 * the UI is written to durable workspace settings (`appearance.theme`,
 * `general.theme`) and reconstructed on reload from the resolved server
 * settings — not only from ephemeral client storage.
 *
 * The write path lives here (used by the theme provider, which every
 * appearance UI surfaces through `useTheme`); the read path is the theme
 * provider's mount hydration.
 */

import type { ResolvedConfiguration } from '@vestara/configuration';
import type { ThemeMode, ThemeSettings } from './theme';

export interface HydratedTheme {
  mode?: ThemeMode;
  /** Approved appearance settings (partial); the consumer merges defaults. */
  settings?: Partial<ThemeSettings>;
}

const APPEARANCE_THEME_KEY = 'appearance.theme';
const GENERAL_THEME_KEY = 'general.theme';

/**
 * Derive the approved visual configuration from resolved workspace settings.
 * Returns only the entries present and valid, so an approved change is
 * re-applied after reload even when ephemeral client storage is absent.
 */
export function resolveHydratedTheme(resolved: ResolvedConfiguration): HydratedTheme {
  const hydrated: HydratedTheme = {};
  for (const setting of resolved.settings) {
    if (setting.key === APPEARANCE_THEME_KEY && typeof setting.value === 'string' && setting.value) {
      try {
        const parsed = JSON.parse(setting.value) as Partial<ThemeSettings>;
        if (parsed && typeof parsed === 'object' && typeof parsed.colorTheme === 'string') {
          hydrated.settings = parsed;
        }
      } catch {
        // invalid stored appearance — ignore and keep current values
      }
    } else if (setting.key === GENERAL_THEME_KEY && (setting.value === 'dark' || setting.value === 'light')) {
      hydrated.mode = setting.value;
    }
  }
  return hydrated;
}

/** Persist the approved appearance settings durably (appearance.theme). */
export async function persistAppearanceSettings(settings: ThemeSettings): Promise<boolean> {
  return putSetting('appearance', APPEARANCE_THEME_KEY, JSON.stringify(settings));
}

/** Persist the approved theme mode durably (general.theme). */
export async function persistThemeMode(mode: ThemeMode): Promise<boolean> {
  return putSetting('general', GENERAL_THEME_KEY, mode);
}

async function putSetting(section: string, key: string, value: unknown): Promise<boolean> {
  try {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section, overrides: { [key]: value }, source: 'workspace-ui' }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
