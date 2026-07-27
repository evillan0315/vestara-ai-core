export interface LiveEvent {
  id: string;
  type: string;
  category: string;
  actor: { id: string; name: string; type: string };
  resource: { type: string; id: string; name: string };
  message: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}
export interface MilestoneData {
  version: string;
  name: string;
  era: string;
  status: string;
  description: string;
}
export interface MilestoneResponse {
  milestones: MilestoneData[];
  byEra: Record<string, MilestoneData[]>;
  current: MilestoneData | null;
  progress: { total: number; completed: number; inProgress: number; pending: number };
}
export interface Execution {
  id: string;
  agentId: string;
  task: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  result?: string;
}

export const EVENT_ICONS: Record<string, string> = {
  'conversation.started': '💬',
  'conversation.response.completed': '🤖',
  'conversation.listening': '🎤',
  'conversation.transcribed': '📝',
  'conversation.speaking': '🔊',
  'conversation.finished': '✅',
  'workspace.opened': '📂',
  'workspace.indexed': '📊',
  'workspace.updated': '🔄',
  'plan.created': '📋',
  'plan.approved': '✅',
  'plan.completed': '🏁',
  'plan.cancelled': '🚫',
  'changeset.created': '📝',
  'changeset.applied': '💾',
  'verification.started': '🔍',
  'verification.completed': '✔️',
  'collab.submitted': '📨',
  'collab.approved': '👍',
  'collab.rejected': '👎',
  'agent.started': '▶️',
  'agent.completed': '⏹️',
  'memory.indexed': '🧠',
  'memory.queried': '🔎',
  'user.profile.created': '👤',
  'user.profile.updated': '✏️',
  'system.heartbeat': '💓',
  'system.ready': '🟢',
  'system.error': '🔴',
  'milestone:completed': '🎯',
};

export const CATEGORY_COLORS: Record<string, string> = {
  conversation: '#6366f1',
  workspace: '#3b82f6',
  planning: '#f59e0b',
  implementation: '#ef4444',
  verification: '#10b981',
  collaboration: '#8b5cf6',
  agent: '#06b6d4',
  memory: '#ec4899',
  profile: '#14b8a6',
  system: '#6b7280',
};

export const ERA_COLORS: Record<string, string> = {
  Architecture: '#8b5cf6',
  Product: '#3b82f6',
  Quality: '#10b981',
  Conversational: '#f59e0b',
  Operational: '#06b6d4',
  Dashboard: '#ec4899',
};
export const ERA_ORDER = ['Architecture', 'Product', 'Quality', 'Conversational', 'Operational', 'Dashboard'];

export const REFRESH_EVENTS = new Set([
  'plan.created',
  'plan.approved',
  'plan.completed',
  'plan.cancelled',
  'changeset.created',
  'changeset.applied',
  'verification.started',
  'verification.completed',
  'collab.submitted',
  'collab.approved',
  'collab.rejected',
  'session.created',
  'system.heartbeat',
  'milestone:completed',
  'agent.started',
  'agent.completed',
  'conversation.response.completed',
]);

export function eventIcon(type: string): string {
  return (
    EVENT_ICONS[type] ||
    (type.includes('completed') || type.includes('passed')
      ? '✅'
      : type.includes('error') || type.includes('failed')
        ? '❌'
        : '🔹')
  );
}

export async function fetchMilestones(): Promise<MilestoneResponse | null> {
  try {
    const r = await fetch('/api/milestones');
    return r.ok ? r.json() : null;
  } catch {
    return null;
  }
}
export async function fetchExecutions(): Promise<Execution[]> {
  try {
    const r = await fetch('/api/agents');
    const d = await r.json();
    return d.executions ?? [];
  } catch {
    return [];
  }
}
