import type { ActivityRecord } from './contracts';

/** User-facing severity derived from the typed activity record. */
export type ActivitySeverity = 'info' | 'success' | 'warning' | 'error';

/**
 * Deterministically derives a severity from the typed fields of a record.
 * Severity is never stored and never reinterpreted by the API; it is a pure
 * projection of the normalized activity model.
 */
export function severityOf(record: ActivityRecord): ActivitySeverity {
  switch (record.kind) {
    case 'workflow': {
      if (record.currentState === 'completed' || record.currentState === 'approved') return 'success';
      if (record.currentState === 'cancelled') return 'warning';
      return 'info';
    }
    case 'task': {
      switch (record.status) {
        case 'completed':
          return 'success';
        case 'failed':
          return 'error';
        case 'blocked':
        case 'cancelled':
          return 'warning';
        default:
          return 'info';
      }
    }
    case 'agent-message': {
      if (record.messageKind === 'tool-result' && record.status === 'failed') return 'error';
      if (record.messageKind === 'approval-request') return 'warning';
      if (record.risk === 'high' || record.risk === 'critical') return 'warning';
      return 'info';
    }
    case 'test': {
      if (record.failed > 0) return 'error';
      if (record.passed > 0) return 'success';
      return 'info';
    }
    case 'verification': {
      switch (record.outcome) {
        case 'passed':
          return 'success';
        case 'failed':
          return 'error';
        case 'blocked':
          return 'warning';
        default:
          return 'info';
      }
    }
    case 'acceptance': {
      if (record.conditional) return 'warning';
      if (record.materialUncertainties.length > 0) return 'warning';
      return 'info';
    }
  }
}
