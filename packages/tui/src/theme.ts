export type VdsStatus =
  | 'healthy'
  | 'degraded'
  | 'unavailable'
  | 'disabled'
  | 'authentication-required'
  | 'approval-required'
  | 'conflict'
  | 'saving'
  | 'saved'
  | 'failed'
  | 'blocked'
  | 'pending'
  | 'working'
  | 'info';

export interface TuiStatusMeta {
  readonly icon: string;
  readonly color: 'green' | 'yellow' | 'red' | 'cyan' | 'magenta' | 'gray' | 'white';
}

export const VDS_STATUS: Record<VdsStatus, TuiStatusMeta> = {
  healthy: { icon: '✓', color: 'green' },
  degraded: { icon: '!', color: 'yellow' },
  unavailable: { icon: '×', color: 'red' },
  disabled: { icon: '○', color: 'gray' },
  'authentication-required': { icon: '🔑', color: 'yellow' },
  'approval-required': { icon: '?', color: 'yellow' },
  conflict: { icon: '!', color: 'red' },
  saving: { icon: '…', color: 'cyan' },
  saved: { icon: '✓', color: 'green' },
  failed: { icon: '×', color: 'red' },
  blocked: { icon: '⊘', color: 'magenta' },
  pending: { icon: '○', color: 'gray' },
  working: { icon: '●', color: 'cyan' },
  info: { icon: '·', color: 'white' },
};

export function normalizeVdsStatus(value: string | boolean): VdsStatus {
  if (value === true) return 'healthy';
  if (value === false) return 'failed';
  const normalized = value.toLowerCase().replace(/[_ ]/g, '-');
  if (['running', 'available', 'connected', 'passed', 'ok', 'ready', 'enabled', 'active'].includes(normalized))
    return 'healthy';
  if (normalized === 'error') return 'failed';
  if (normalized === 'auth-required' || normalized === 'authentication') return 'authentication-required';
  if (normalized === 'approval') return 'approval-required';
  if (normalized === 'loading') return 'saving';
  return (normalized in VDS_STATUS ? normalized : 'info') as VdsStatus;
}

export function formatVdsStatus(value: string | boolean): string {
  const status = normalizeVdsStatus(value);
  return `${VDS_STATUS[status].icon} ${String(value)}`;
}
