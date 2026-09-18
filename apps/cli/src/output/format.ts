export const GOLD = '\x1b[33m';
export const GREEN = '\x1b[32m';
export const RED = '\x1b[31m';
export const RESET = '\x1b[0m';
export const BOLD = '\x1b[1m';
export const GRAY = '\x1b[90m';
export const CYAN = '\x1b[36m';

export function renderStatus(success: boolean, label: string, detail?: string): string {
  const icon = success ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
  const detailStr = detail ? `${GRAY}${detail}${RESET}` : '';
  return `  ${icon} ${label} ${detailStr}`;
}

export function renderStep(success: boolean, label: string, detail?: string): void {
  process.stdout.write(`${renderStatus(success, label, detail)}\n`);
}

/**
 * VDS-REPAIR-001: CLI VDS status adapter (presentation projection only).
 *
 * Authority (not duplicated here):
 *   - `VdsStatus` vocabulary + `normalizeVdsStatus` in
 *     packages/tui/src/theme.ts (cross-surface semantic states)
 *   - `ProviderOperationalState` in
 *     packages/routing-types/src/provider-state.ts
 *     (healthy | degraded | unavailable | cooling-down | disabled |
 *      authentication-required | rate-limited)
 *
 * This adapter projects the same canonical semantic state the Workspace
 * Status UI (`settings-ui.tsx`) and the TUI render, using only the CLI's
 * existing ANSI palette (GREEN/YELLOW/GOLD/RED/CYAN/GRAY) — no new color
 * authority. Meaning is carried by the textual label, never color alone.
 */
export type VdsCliStatus =
  | 'healthy'
  | 'degraded'
  | 'unavailable'
  | 'cooling-down'
  | 'disabled'
  | 'authentication-required'
  | 'approval-required'
  | 'rate-limited'
  | 'conflict'
  | 'saving'
  | 'saved'
  | 'failed'
  | 'blocked'
  | 'pending'
  | 'working'
  | 'info';

const WARN = GOLD;

function normalizeCliStatus(value: string | boolean): VdsCliStatus {
  if (value === true) return 'healthy';
  if (value === false) return 'failed';
  const normalized = value.toLowerCase().replace(/[_ ]/g, '-');
  if (['running', 'available', 'connected', 'passed', 'ok', 'ready', 'enabled', 'active'].includes(normalized))
    return 'healthy';
  if (normalized === 'error') return 'failed';
  if (normalized === 'auth-required' || normalized === 'authentication') return 'authentication-required';
  if (normalized === 'approval') return 'approval-required';
  if (normalized === 'loading') return 'saving';
  const known: readonly string[] = [
    'healthy',
    'degraded',
    'unavailable',
    'cooling-down',
    'disabled',
    'authentication-required',
    'approval-required',
    'rate-limited',
    'conflict',
    'saving',
    'saved',
    'failed',
    'blocked',
    'pending',
    'working',
    'info',
  ];
  return (known.includes(normalized) ? normalized : 'info') as VdsCliStatus;
}

export function renderSemanticStatus(value: string | boolean, label?: string, detail?: string): string {
  const status = normalizeCliStatus(value);
  const text = label ?? String(value);
  const detailStr = detail ? `${GRAY}${detail}${RESET}` : '';
  switch (status) {
    case 'healthy':
    case 'saved':
      return `  ${GREEN}✓${RESET} ${text} ${detailStr}`;
    case 'degraded':
    case 'cooling-down':
    case 'rate-limited':
    case 'authentication-required':
    case 'approval-required':
    case 'pending':
      return `  ${WARN}!${RESET} ${text} ${detailStr}`;
    case 'working':
    case 'saving':
      return `  ${CYAN}●${RESET} ${text} ${detailStr}`;
    case 'disabled':
      return `  ${GRAY}○${RESET} ${text} ${detailStr}`;
    case 'blocked':
      return `  ${GOLD}⊘${RESET} ${text} ${detailStr}`;
    case 'info':
      return `  ${GRAY}·${RESET} ${text} ${detailStr}`;
    default:
      return `  ${RED}✗${RESET} ${text} ${detailStr}`;
  }
}
