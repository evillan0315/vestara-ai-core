/**
 * AR-REPORT fixtures — typed activity records for report drawer tests.
 *
 * Fixed ISO timestamps across three days; never hardcoded inside JSX.
 */

import type { ActivityProjectionRecord } from './activity-types';

function base(sequence: number, timestamp: string, kind: ActivityProjectionRecord['kind']) {
  return {
    id: `report-fixture-${sequence}`,
    sequence,
    timestamp,
    actor: { type: 'agent', id: 'agent-1', displayName: 'Verifier', role: 'verifier' },
    evidenceRefs: [],
    kind,
  };
}

export const REPORT_FIXTURES: readonly ActivityProjectionRecord[] = [
  {
    ...base(11, '2026-10-09T10:00:00.000Z', 'workflow'),
    workflowId: 'workflow-1',
    previousState: 'pending',
    currentState: 'running',
    reason: 'deployment started',
    authoritative: true,
    observed: false,
  },
  {
    ...base(12, '2026-10-10T10:00:00.000Z', 'agent-message'),
    agentId: 'agent-1',
    content: 'Day-two status update from the deployment run.',
  },
  {
    ...base(13, '2026-10-10T14:00:00.000Z', 'tool-result'),
    agentId: 'agent-1',
    toolName: 'read',
    callID: 'call-13',
    status: 'completed',
    output: '{"ok":true}',
  },
  {
    ...base(14, '2026-10-11T10:00:00.000Z', 'agent-message'),
    agentId: 'agent-1',
    content: `${'Long rollout note. '.repeat(20)}End of note.`,
    hasDetails: true,
  },
].map((record) => record as unknown as ActivityProjectionRecord);
