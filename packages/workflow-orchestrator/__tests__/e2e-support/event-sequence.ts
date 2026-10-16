/**
 * WFO-E2E event-order matching.
 *
 * Verifies partial ordering invariants over the recorded event stream rather
 * than relying on timestamps. Concurrent tasks may interleave freely as long as
 * the declared dependency ordering holds.
 */

export interface EventOrderRule {
  /** `before(a, b)`: the first `a` must precede the first `b`. */
  readonly before?: [string, string];
  /** `neverBefore(a, b)`: no `b` may occur before the first `a`. */
  readonly neverBefore?: [string, string];
}

export function firstIndex(events: readonly { type: string }[], type: string): number {
  return events.findIndex((event) => event.type === type);
}

export function eventOrderViolations(events: readonly { type: string }[], rules: readonly EventOrderRule[]): string[] {
  const violations: string[] = [];
  for (const rule of rules) {
    if (rule.before) {
      const [before, after] = rule.before;
      const beforeIndex = firstIndex(events, before);
      const afterIndex = firstIndex(events, after);
      if (afterIndex >= 0 && (beforeIndex < 0 || beforeIndex >= afterIndex)) {
        violations.push(`expected ${before} before ${after}`);
      }
    }
    if (rule.neverBefore) {
      const [guard, guarded] = rule.neverBefore;
      const guardIndex = firstIndex(events, guard);
      const guardedIndex = firstIndex(events, guarded);
      if (guardedIndex >= 0 && (guardIndex < 0 || guardedIndex < guardIndex)) {
        violations.push(`forbidden: ${guarded} occurred before ${guard}`);
      }
    }
  }
  return violations;
}

export function assertEventOrder(events: readonly { type: string }[], rules: readonly EventOrderRule[]): void {
  const violations = eventOrderViolations(events, rules);
  if (violations.length > 0) throw new Error(`event-order violation: ${violations.join('; ')}`);
}

/** Fluent matcher: `expectEventSequence(events).toSatisfy([before(a, b), neverBefore(c, d)])`. */
export function expectEventSequence(events: readonly { type: string }[]) {
  return {
    toSatisfy(rules: readonly EventOrderRule[]): void {
      assertEventOrder(events, rules);
    },
    violations(rules: readonly EventOrderRule[]): string[] {
      return eventOrderViolations(events, rules);
    },
  };
}

export function beforeEvent(a: string, b: string): EventOrderRule {
  return { before: [a, b] };
}

export function neverBefore(a: string, b: string): EventOrderRule {
  return { neverBefore: [a, b] };
}
