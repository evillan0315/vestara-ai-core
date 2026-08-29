// Renderer-neutral presentation helpers for harness execution data.

export type HarnessTone = 'success' | 'warning' | 'error' | 'active' | 'muted';

const SUCCESS = new Set(['completed', 'verified', 'approved', 'healthy', 'passed', 'ok']);
const ERROR = new Set(['failed', 'error', 'denied', 'unhealthy', 'cancelled']);
const WARNING = new Set(['blocked', 'awaiting', 'attention', 'attention-required', 'pending', 'approval-required']);
const ACTIVE = new Set(['running', 'active', 'executing', 'thinking', 'queued']);

/** Map a harness status string to a semantic tone for display. */
export function harnessStatusTone(status: string | undefined): HarnessTone {
  if (!status) return 'muted';
  const normalized = status.toLowerCase();
  if (SUCCESS.has(normalized) || normalized.includes('verified') || normalized.includes('approved')) {
    return 'success';
  }
  if (ERROR.has(normalized)) return 'error';
  if (WARNING.has(normalized) || normalized.includes('approval')) return 'warning';
  if (ACTIVE.has(normalized)) return 'active';
  return 'muted';
}
