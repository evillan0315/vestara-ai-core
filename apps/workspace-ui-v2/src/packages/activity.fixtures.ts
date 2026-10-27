// Activity Room fixture — participant rail, live records, bridge status.
// Pattern: apps/workspace/src/features/overview/overview.fixtures.ts.

export type ParticipantStatus = 'Idle' | 'Active' | 'Working';

export interface Participant {
  agent: string;
  detail: string;
  status: ParticipantStatus;
}

export const ACTIVITY_PARTICIPANTS: Participant[] = [
  { agent: 'Context', detail: '', status: 'Idle' },
  { agent: 'Analyst', detail: '', status: 'Idle' },
  { agent: 'Developer', detail: '', status: 'Active' },
  { agent: 'Planner', detail: '', status: 'Idle' },
  { agent: 'Architect', detail: '', status: 'Idle' },
  { agent: 'Reviewer', detail: '', status: 'Idle' },
  { agent: 'Verifier', detail: '', status: 'Idle' },
  { agent: 'Assistant', detail: 'eddie', status: 'Idle' },
  { agent: 'Browser', detail: '', status: 'Active' },
  { agent: 'System', detail: '', status: 'Idle' },
];

export function participantLabel(p: Participant): string {
  return p.detail ? `${p.agent} ${p.detail} ${p.status}` : `${p.agent} ${p.status}`;
}

export interface ActivityRecord {
  actor: string;
  message: string;
  age: string;
}

export const ACTIVITY_RECORDS: ActivityRecord[] = [
  { actor: 'Developer', message: 'TaskNode Shell 7 completed', age: 'now' },
  { actor: 'Assistant', message: 'VestaraWindow drag shell extracted', age: '2m' },
  { actor: 'Browser', message: 'Teal logo bound to wallpaper', age: '5m' },
];

export const ACTIVITY_BRIDGE_STATUS = {
  service: 'CodexServerStatus',
  state: 'Unreachable • 0 SESSIONS',
  endpoint: 'ws://127.0.0.1:4500/',
} as const;

export const ACTIVITY_COUNTS = {
  participants: 25,
  records: 50,
} as const;
