import type { ConflictInput, ConflictResolution, PolicyDecision } from '@vestara/policy-types';

export class ConflictResolver {
  resolve(input: ConflictInput): PolicyDecision {
    if (input.decisions.length === 0) {
      throw new Error('Cannot resolve conflicts: no decisions provided');
    }
    if (input.decisions.length === 1) {
      return input.decisions[0];
    }

    switch (input.strategy) {
      case 'deny_overrides':
        return this.denyOverrides(input);
      case 'allow_overrides':
        return this.allowOverrides(input);
      case 'priority_ordered':
        return this.priorityOrdered(input);
      case 'first_match':
        return this.firstMatch(input);
      case 'most_restrictive':
        return this.mostRestrictive(input);
      case 'merge':
        return this.merge(input);
      case 'consensus':
        return this.consensus(input);
    }
  }

  private denyOverrides(input: ConflictInput): PolicyDecision {
    const deny = input.decisions.find((d) => d.result === 'deny');
    return deny ?? input.decisions[0];
  }

  private allowOverrides(input: ConflictInput): PolicyDecision {
    const allow = input.decisions.find((d) => d.result === 'allow');
    return allow ?? input.decisions[0];
  }

  private priorityOrdered(input: ConflictInput): PolicyDecision {
    const sorted = [...input.decisions].sort((a, b) => {
      const aMax = Math.max(...a.matchedPolicies.map((p) => p.priority));
      const bMax = Math.max(...b.matchedPolicies.map((p) => p.priority));
      return bMax - aMax;
    });
    return sorted[0];
  }

  private firstMatch(input: ConflictInput): PolicyDecision {
    return input.decisions[0];
  }

  private mostRestrictive(input: ConflictInput): PolicyDecision {
    const order: PolicyDecision['result'][] = ['deny', 'modify', 'allow'];
    let best: PolicyDecision = input.decisions[0];
    for (const d of input.decisions) {
      if (order.indexOf(d.result) < order.indexOf(best.result)) {
        best = d;
      }
    }
    return best;
  }

  private merge(input: ConflictInput): PolicyDecision {
    const base = input.decisions[0];
    const allMatched = input.decisions.flatMap((d) => [...d.matchedPolicies]);
    const allApplied = input.decisions.flatMap((d) => [...d.actionsApplied]);
    const allModifications = input.decisions.flatMap((d) => [...d.modifications]);
    const conflicts: ConflictResolution[] = [];

    for (let i = 1; i < input.decisions.length; i++) {
      const a = input.decisions[0];
      const b = input.decisions[i];
      if (a.result !== b.result) {
        conflicts.push({
          betweenPolicies: ['merge.root', `merge.${i}`],
          strategy: 'merge',
          resolution: `Merged result=${a.result} with result=${b.result} → keeping ${a.result}`,
        });
      }
    }

    return {
      ...base,
      matchedPolicies: allMatched,
      actionsApplied: allApplied,
      modifications: allModifications,
      conflictsResolved: [
        ...base.conflictsResolved,
        ...conflicts,
        ...input.decisions.slice(1).flatMap((d) => [...d.conflictsResolved]),
      ],
    };
  }

  private consensus(input: ConflictInput): PolicyDecision {
    const counts: Record<string, number> = {};
    for (const d of input.decisions) {
      counts[d.result] = (counts[d.result] ?? 0) + 1;
    }
    let bestResult = input.decisions[0].result;
    let bestCount = 0;
    for (const [result, count] of Object.entries(counts)) {
      if (count > bestCount) {
        bestCount = count;
        bestResult = result as PolicyDecision['result'];
      }
    }
    const winner = input.decisions.find((d) => d.result === bestResult);
    return winner ?? input.decisions[0];
  }
}
