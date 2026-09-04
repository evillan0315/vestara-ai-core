/**
 * Message receipts — the Activity Room trust model for human → agent delivery.
 *
 * Tracks whether each workflow participant has received/observed a human
 * message, and which agent(s) a message is addressed to (via @mention).
 *
 * Broadcast messages are observed by every participant. An @mention marks its
 * target as the intended responder (addressed). Observation is marked by the
 * harness context assembler when it injects the message into an agent's context.
 *
 * The registry is process-lifetime (in-memory). Persisting receipts to the
 * durable activity store is a follow-up; the source messages themselves are
 * already durable via the activity room store.
 */

import type { AgentMessageActivity } from '@vestara/activity-room';

export type MessageReceiptState = 'pending' | 'observed' | 'addressed' | 'responding' | 'failed';

export interface AgentMessageReceipt {
  readonly messageId: string;
  readonly agentId: string;
  state: MessageReceiptState;
  observedAt?: string;
  respondedAt?: string;
}

interface MessageReceipts {
  readonly messageId: string;
  readonly content: string;
  readonly workflowId?: string;
  readonly createdAt: string;
  readonly receipts: Map<string, AgentMessageReceipt>;
}

const registry = new Map<string, MessageReceipts>();

/** Whether a human message @mentions the given agent (aliases included). */
export function messageTargetsAgent(content: string, agentId: string, role: string): boolean {
  if (!content) return false;
  const aliases = new Set<string>();
  if (agentId) {
    aliases.add(agentId.toLowerCase());
    if (agentId.startsWith('vestara-')) aliases.add(agentId.slice('vestara-'.length).toLowerCase());
  }
  if (role) {
    aliases.add(role.toLowerCase());
    aliases.add(`${role}-agent`.toLowerCase());
  }
  const lower = content.toLowerCase();
  for (const alias of aliases) {
    if (alias && lower.includes(`@${alias}`)) return true;
  }
  return false;
}

/** Register a human message and seed a receipt per participant agent. */
export function registerMessage(
  message: AgentMessageActivity,
  participantAgentIds: readonly string[],
  agentRoles: ReadonlyMap<string, string>,
  forcedAddressed?: ReadonlySet<string>,
): void {
  const content = message.content ?? '';
  const byAgent = new Map<string, AgentMessageReceipt>();
  for (const agentId of participantAgentIds) {
    const role = agentRoles.get(agentId) ?? '';
    const addressed = forcedAddressed?.has(agentId) ?? messageTargetsAgent(content, agentId, role);
    byAgent.set(agentId, {
      messageId: message.id,
      agentId,
      state: addressed ? 'addressed' : 'pending',
      ...(addressed ? { observedAt: undefined } : {}),
    });
  }
  registry.set(message.id, {
    messageId: message.id,
    content,
    workflowId: message.workflowId,
    createdAt: message.timestamp,
    receipts: byAgent,
  });
}

/** Mark that the given agent has observed a message. */
export function markMessageObserved(messageId: string, agentId: string): void {
  const entry = registry.get(messageId);
  const receipt = entry?.receipts.get(agentId);
  if (!receipt) return;
  receipt.observedAt = receipt.observedAt ?? new Date().toISOString();
  // An addressed agent remains addressed (expected to respond); a pending
  // (broadcast) message becomes observed once delivered to the agent's context.
  if (receipt.state === 'pending') receipt.state = 'observed';
}

/** Mark that the given agent is responding to an addressed message. */
export function markMessageResponding(messageId: string, agentId: string): void {
  const receipt = registry.get(messageId)?.receipts.get(agentId);
  if (!receipt) return;
  receipt.state = 'responding';
  receipt.observedAt = receipt.observedAt ?? new Date().toISOString();
}

export function markMessageResponded(messageId: string, agentId: string): void {
  const receipt = registry.get(messageId)?.receipts.get(agentId);
  if (!receipt) return;
  receipt.state = 'observed';
  receipt.respondedAt = new Date().toISOString();
}

export function receiptsForMessage(messageId: string): AgentMessageReceipt[] {
  const entry = registry.get(messageId);
  if (!entry) return [];
  return [...entry.receipts.values()];
}

/** Receipts for all messages belonging to a workflow. */
export function receiptsForWorkflow(workflowId: string): Record<string, AgentMessageReceipt[]> {
  const out: Record<string, AgentMessageReceipt[]> = {};
  for (const [messageId, entry] of registry) {
    if (entry.workflowId !== workflowId) continue;
    out[messageId] = [...entry.receipts.values()];
  }
  return out;
}

/** Unread (pending) message count per agent, optionally scoped to a workflow. */
export function unreadCountsForWorkflow(workflowId: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of registry.values()) {
    if (entry.workflowId !== workflowId) continue;
    for (const receipt of entry.receipts.values()) {
      if (receipt.state !== 'pending') continue;
      counts[receipt.agentId] = (counts[receipt.agentId] ?? 0) + 1;
    }
  }
  return counts;
}
