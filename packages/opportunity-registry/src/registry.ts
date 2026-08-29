/**
 * Opportunity Registry — evidence-backed discovery records.
 *
 * The registry preserves engineering observations as opportunities. It has no
 * execution authority: it records, merges, transitions, and searches. Unsupported
 * opinions (no evidence references) never become opportunities.
 */

import { deriveOpportunityConfidence } from './confidence';
import type {
  Opportunity,
  OpportunityHistoryEntry,
  OpportunityObservation,
  OpportunityStatus,
} from './opportunity-types';

export class OpportunityError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'OpportunityError';
  }
}

export interface OpportunityRegistryStore {
  get(id: string): Opportunity | undefined;
  getByKey(key: string): Opportunity | undefined;
  list(): readonly Opportunity[];
  save(opportunity: Opportunity): void;
}

export class MemoryOpportunityRegistryStore implements OpportunityRegistryStore {
  private readonly byId = new Map<string, Opportunity>();
  private readonly byKey = new Map<string, string>();

  get(id: string): Opportunity | undefined {
    return this.byId.get(id);
  }

  getByKey(key: string): Opportunity | undefined {
    const id = this.byKey.get(key);
    return id ? this.byId.get(id) : undefined;
  }

  list(): readonly Opportunity[] {
    return [...this.byId.values()];
  }

  save(opportunity: Opportunity): void {
    this.byId.set(opportunity.id, opportunity);
    this.byKey.set(opportunity.key, opportunity.id);
  }
}

export interface OpportunityListQuery {
  readonly status?: OpportunityStatus;
  readonly category?: string;
}

const ALLOWED_TRANSITIONS: Record<OpportunityStatus, readonly OpportunityStatus[]> = {
  proposed: ['under-review', 'rejected', 'archived'],
  'under-review': ['accepted', 'proposed', 'rejected', 'archived'],
  accepted: ['planned', 'rejected', 'archived'],
  planned: ['scheduled', 'rejected', 'archived'],
  scheduled: ['implemented', 'rejected', 'archived'],
  implemented: ['archived'],
  rejected: ['under-review', 'archived'],
  archived: [],
};

export class OpportunityRegistry {
  constructor(
    private readonly store: OpportunityRegistryStore,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  /**
   * Record an evidence-backed observation. Creates a proposed opportunity or
   * merges into the existing one by grouping key, recomputing confidence from
   * independent observers.
   */
  observe(observation: OpportunityObservation): Opportunity {
    if (observation.evidenceRefs.length === 0) {
      throw new OpportunityError(
        'opportunity.evidence-required',
        'Unsupported opinions do not become opportunities — evidence references are required',
      );
    }
    const existing = this.store.getByKey(observation.opportunityKey);
    const opportunity = existing ? this.merge(existing, observation) : this.create(observation);
    this.store.save(opportunity);
    return opportunity;
  }

  transition(id: string, to: OpportunityStatus, by: string, reason: string): Opportunity {
    const opportunity = this.mustGet(id);
    if (!ALLOWED_TRANSITIONS[opportunity.status].includes(to)) {
      throw new OpportunityError(
        'opportunity.invalid-transition',
        `Cannot transition opportunity ${id} from ${opportunity.status} to ${to}`,
      );
    }
    const history: OpportunityHistoryEntry[] = [
      ...opportunity.history,
      {
        at: this.now(),
        action: 'status-changed',
        detail: `${opportunity.status} → ${to} by ${by}: ${reason}`,
      },
    ];
    const updated: Opportunity = { ...opportunity, status: to, history, updatedAt: this.now() };
    this.store.save(updated);
    return updated;
  }

  get(id: string): Opportunity | undefined {
    return this.store.get(id);
  }

  list(query: OpportunityListQuery = {}): readonly Opportunity[] {
    return this.store.list().filter((opportunity) => {
      if (query.status && opportunity.status !== query.status) return false;
      if (query.category && opportunity.category !== query.category) return false;
      return true;
    });
  }

  /** Case-insensitive text search over title, description, category, and suggested actions. */
  search(query: string): readonly Opportunity[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return this.list();
    return this.store
      .list()
      .filter((opportunity) =>
        [opportunity.title, opportunity.description, opportunity.category, ...opportunity.suggestedActions].some(
          (text) => text.toLowerCase().includes(needle),
        ),
      );
  }

  private create(observation: OpportunityObservation): Opportunity {
    const at = this.now();
    return {
      id: opportunityId(observation.opportunityKey),
      key: observation.opportunityKey,
      title: observation.title,
      description: observation.description,
      category: observation.category,
      status: 'proposed',
      observations: [observation],
      independentObservers: [observation.origin.agentId],
      evidenceRefs: [...observation.evidenceRefs],
      affectedRepositories: [...observation.affectedRepositories],
      affectedPackages: [...observation.affectedPackages],
      affectedFiles: [...observation.affectedFiles],
      suggestedActions: [...observation.suggestedActions],
      estimatedImpact: observation.estimatedImpact,
      estimatedEffort: observation.estimatedEffort,
      confidence: deriveOpportunityConfidence([observation]),
      history: [{ at, action: 'created', detail: `opportunity created from ${observation.origin.role} observation` }],
      createdAt: at,
      updatedAt: at,
    };
  }

  private merge(existing: Opportunity, observation: OpportunityObservation): Opportunity {
    const observations = [...existing.observations, observation];
    const confidence = deriveOpportunityConfidence(observations);
    const hadObserver = existing.independentObservers.includes(observation.origin.agentId);
    const independentObservers = hadObserver
      ? existing.independentObservers
      : [...existing.independentObservers, observation.origin.agentId];

    const history: OpportunityHistoryEntry[] = [
      ...existing.history,
      {
        at: this.now(),
        action: 'observation-recorded',
        detail: `${observation.origin.role} (${observation.origin.agentId}) observed ${observation.opportunityKey}`,
      },
    ];
    if (!hadObserver) {
      history.push({
        at: this.now(),
        action: 'confidence-recomputed',
        detail: `new independent observer ${observation.origin.agentId}; confidence ${existing.confidence.score.toFixed(2)} → ${confidence.score.toFixed(2)}`,
      });
    }

    return {
      ...existing,
      observations,
      independentObservers,
      evidenceRefs: union(existing.evidenceRefs, observation.evidenceRefs),
      affectedRepositories: union(existing.affectedRepositories, observation.affectedRepositories),
      affectedPackages: union(existing.affectedPackages, observation.affectedPackages),
      affectedFiles: union(existing.affectedFiles, observation.affectedFiles),
      suggestedActions: union(existing.suggestedActions, observation.suggestedActions),
      estimatedImpact: observation.estimatedImpact ?? existing.estimatedImpact,
      estimatedEffort: observation.estimatedEffort ?? existing.estimatedEffort,
      confidence,
      history,
      updatedAt: this.now(),
    };
  }

  private mustGet(id: string): Opportunity {
    const opportunity = this.store.get(id);
    if (!opportunity) throw new OpportunityError('opportunity.not-found', `Opportunity ${id} not found`);
    return opportunity;
  }
}

function opportunityId(key: string): string {
  return `opportunity-${key}`;
}

function union(first: readonly string[], second: readonly string[]): string[] {
  return [...new Set([...first, ...second])];
}
