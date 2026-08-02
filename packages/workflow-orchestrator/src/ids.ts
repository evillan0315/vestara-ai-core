/**
 * Workflow ID generation — `{type}-{timestamp}-{seq}` per PCS-025 §9.
 */

const counters = new Map<string, number>();

export function generateId(prefix: string): string {
  const seq = (counters.get(prefix) ?? 0) + 1;
  counters.set(prefix, seq);
  return `${prefix}-${Date.now()}-${seq}`;
}
