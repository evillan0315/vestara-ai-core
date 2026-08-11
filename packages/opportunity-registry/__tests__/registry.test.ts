import { describe, expect, it } from 'vitest';
import {
  deriveOpportunityConfidence,
  MemoryOpportunityRegistryStore,
  OpportunityError,
  type OpportunityObservation,
  OpportunityRegistry,
  opportunityKeyFor,
  RECOMMENDED_OPPORTUNITY_CATEGORIES,
} from '../src/index';

const NOW = '2026-08-06T00:00:00.000Z';
const registry = () => new OpportunityRegistry(new MemoryOpportunityRegistryStore(), () => NOW);

function observation(patch: Partial<OpportunityObservation> = {}): OpportunityObservation {
  return {
    id: `obs-${Math.random().toString(16).slice(2)}`,
    opportunityKey: opportunityKeyFor('architecture', 'Authentication duplication'),
    title: 'Duplicate authentication logic',
    description: 'Authentication logic exists in five independent implementations.',
    category: 'architecture',
    origin: { workflowId: 'wf-1', taskId: 't-1', agentId: 'developer-1', role: 'engineer', observedAt: NOW },
    evidenceRefs: ['ev-1'],
    affectedRepositories: ['repo-a'],
    affectedPackages: [],
    affectedFiles: ['src/auth/a.ts'],
    suggestedActions: ['investigate shared authentication abstraction'],
    ...patch,
  };
}

describe('evidence-first', () => {
  it('rejects observations without evidence references', () => {
    const r = registry();
    expect(() => r.observe(observation({ evidenceRefs: [] }))).toThrow(OpportunityError);
    expect(r.list()).toHaveLength(0);
  });
});

describe('opportunity creation and grouping', () => {
  it('creates a proposed opportunity from a single observation', () => {
    const r = registry();
    const opportunity = r.observe(observation());
    expect(opportunity.status).toBe('proposed');
    expect(opportunity.independentObservers).toEqual(['developer-1']);
    expect(opportunity.confidence.level).toBe('medium');
    expect(opportunity.history[0]?.action).toBe('created');
  });

  it('merges independent observations of the same discovery into one opportunity', () => {
    const r = registry();
    const developer = r.observe(
      observation({ origin: { workflowId: 'wf-1', agentId: 'developer-1', role: 'engineer', observedAt: NOW } }),
    );
    const reviewer = r.observe(
      observation({ origin: { workflowId: 'wf-1', agentId: 'reviewer-1', role: 'reviewer', observedAt: NOW } }),
    );
    const verifier = r.observe(
      observation({ origin: { workflowId: 'wf-1', agentId: 'verifier-1', role: 'verifier', observedAt: NOW } }),
    );

    expect(r.list()).toHaveLength(1);
    expect(reviewer.id).toBe(developer.id);
    expect(verifier.id).toBe(developer.id);
    const merged = r.get(developer.id)!;
    expect(merged.observations).toHaveLength(3);
    expect(merged.independentObservers).toEqual(['developer-1', 'reviewer-1', 'verifier-1']);
    expect(merged.confidence.level).toBe('high');
    expect(merged.history.filter((entry) => entry.action === 'confidence-recomputed')).toHaveLength(2);
  });

  it('derives a stable grouping key from category and subject', () => {
    expect(opportunityKeyFor('Architecture', '  Authentication DUPLICATION! ')).toBe(
      opportunityKeyFor('architecture', 'authentication duplication'),
    );
  });
});

describe('independent discovery confidence', () => {
  it('does not raise confidence when the same agent repeats the observation', () => {
    const r = registry();
    const single = r.observe(observation({ evidenceRefs: ['ev-1'] }));

    const r2 = registry();
    r2.observe(
      observation({
        origin: { workflowId: 'wf-1', agentId: 'developer-1', role: 'engineer', observedAt: NOW },
        evidenceRefs: ['ev-1'],
      }),
    );
    r2.observe(
      observation({
        origin: { workflowId: 'wf-1', agentId: 'developer-1', role: 'engineer', observedAt: NOW },
        evidenceRefs: ['ev-1'],
      }),
    );
    r2.observe(
      observation({
        origin: { workflowId: 'wf-1', agentId: 'developer-1', role: 'engineer', observedAt: NOW },
        evidenceRefs: ['ev-1'],
      }),
    );

    const repeated = r2.list()[0]!;
    expect(repeated.independentObservers).toEqual(['developer-1']);
    expect(repeated.confidence.score).toBe(single.confidence.score);
    expect(repeated.confidence.reasons).toContain('repeated statements by one agent do not raise confidence');
  });

  it('raises confidence with a second independent observer', () => {
    const first = deriveOpportunityConfidence([observation()]);
    const second = deriveOpportunityConfidence([
      observation({ origin: { workflowId: 'wf-1', agentId: 'developer-1', role: 'engineer', observedAt: NOW } }),
      observation({ origin: { workflowId: 'wf-1', agentId: 'reviewer-1', role: 'reviewer', observedAt: NOW } }),
    ]);
    expect(second.score).toBeGreaterThan(first.score);
    expect(second.independentObservers).toBe(2);
  });
});

describe('lifecycle governance', () => {
  it('allows the intended lifecycle forward and back to review', () => {
    const r = registry();
    const opportunity = r.observe(observation());
    r.transition(opportunity.id, 'under-review', 'planner', 'triage');
    r.transition(opportunity.id, 'accepted', 'planner', 'worth pursuing');
    r.transition(opportunity.id, 'planned', 'planner', 'scheduled next cycle');
    r.transition(opportunity.id, 'scheduled', 'planner', 'queued');
    const done = r.transition(opportunity.id, 'implemented', 'engineer', 'authorized workflow completed');
    expect(done.status).toBe('implemented');
  });

  it('rejects invalid transitions', () => {
    const r = registry();
    const opportunity = r.observe(observation());
    expect(() => r.transition(opportunity.id, 'implemented', 'agent', 'skip the gates')).toThrow(/Cannot transition/i);
    expect(r.get(opportunity.id)?.status).toBe('proposed');
  });

  it('rejects and archives without ever executing', () => {
    const r = registry();
    const opportunity = r.observe(observation());
    r.transition(opportunity.id, 'rejected', 'planner', 'not a priority');
    const archived = r.transition(opportunity.id, 'archived', 'planner', 'closed');
    expect(archived.status).toBe('archived');
    expect(() => r.transition(archived.id, 'accepted', 'agent', 'revive')).toThrow(/Cannot transition/i);
  });
});

describe('querying', () => {
  it('filters by status and category and searches text', () => {
    const r = registry();
    r.observe(
      observation({
        category: 'security',
        opportunityKey: opportunityKeyFor('security', 'signing keys'),
        suggestedActions: ['rotate signing keys'],
      }),
    );
    r.observe(
      observation({
        category: 'performance',
        opportunityKey: opportunityKeyFor('performance', 'query path'),
        suggestedActions: ['index the query path'],
      }),
    );

    expect(r.list({ category: 'security' })).toHaveLength(1);
    expect(r.list({ status: 'proposed' })).toHaveLength(2);
    expect(r.search('signing')).toHaveLength(1);
    expect(r.search('')).toHaveLength(2);
  });

  it('exposes the recommended extensible categories', () => {
    expect(RECOMMENDED_OPPORTUNITY_CATEGORIES).toContain('technical-debt');
    // Custom categories are accepted — the taxonomy stays extensible.
    const r = registry();
    const opportunity = r.observe(observation({ category: 'compliance' }));
    expect(opportunity.category).toBe('compliance');
  });
});
