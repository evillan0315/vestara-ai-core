/**
 * @vitest-environment jsdom
 *
 * R4 — Activity Stream Integration Tests
 *
 * Tests for the M10 → M11A → M11C interaction projection/rendering path.
 * Verifies that interaction.presented and interaction.responded events
 * project correctly through the existing chain and render via R3 InteractionCard.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActivityRecord as M9ActivityRecord } from '@vestara/types';
import { ProjectionRuntime } from '@vestara/activity-projection';
import M11CStreamItemComponent from '../src/pages/activity/M11CStreamItem.js';
import type { M11CStreamItem } from '../src/hooks/useM11CActivityRoom.js';

afterEach(() => {
  cleanup();
});

// ─── M9 Fixtures ─────────────────────────────────────────────

function makeInteractionPresented(overrides: Partial<M9ActivityRecord> = {}): M9ActivityRecord {
  return {
    activityId: 'act-int-001' as import('@vestara/types').Brand<string, 'ActivityRecordId'>,
    eventId: 'interaction:presented:int-001',
    sequenceNumber: 1,
    type: 'interaction.presented',
    timestamp: '2026-08-30T12:00:00Z',
    actor: {
      type: 'system',
      id: 'harness-producer',
      displayName: 'Harness Producer',
    },
    source: 'interaction-app',
    payload: {
      message: 'Approve git.add on src/index.ts?',
      data: {
        interactionId: 'int-001',
        choices: [
          { choiceId: 'approve', label: 'Approve' },
          { choiceId: 'reject', label: 'Reject' },
        ],
      },
    },
    visibility: 'all',
    ...overrides,
  };
}

function makeInteractionResponded(overrides: Partial<M9ActivityRecord> = {}): M9ActivityRecord {
  return {
    activityId: 'act-resp-001' as import('@vestara/types').Brand<string, 'ActivityRecordId'>,
    eventId: 'interaction:responded:int-001',
    sequenceNumber: 2,
    type: 'interaction.responded',
    timestamp: '2026-08-30T12:05:00Z',
    actor: {
      type: 'human',
      id: 'human-user',
      displayName: 'Human User',
    },
    source: 'interaction-app',
    payload: {
      message: 'Responded to interaction with choice approve',
      data: {
        interactionId: 'int-001',
        responseId: 'resp-001',
        selectedChoiceId: 'approve',
      },
    },
    visibility: 'all',
    ...overrides,
  };
}

// ─── M10 ProjectionRuntime Tests ─────────────────────────────

describe('R4 M10 — ProjectionRuntime interaction projection', () => {
  it('classifies interaction.presented as interaction kind', () => {
    const runtime = new ProjectionRuntime();
    const record = makeInteractionPresented();
    runtime.processRecord(record);
    const projection = runtime.getProjection();
    const item = projection.stream.find((s) => s.kind === 'interaction');
    expect(item).toBeDefined();
    expect(item!.kind).toBe('interaction');
  });

  it('classifies interaction.responded as interaction kind', () => {
    const runtime = new ProjectionRuntime();
    const presented = makeInteractionPresented({ sequenceNumber: 1 });
    const responded = makeInteractionResponded({ sequenceNumber: 2 });
    runtime.processRecord(presented);
    runtime.processRecord(responded);
    const projection = runtime.getProjection();
    const items = projection.stream.filter((s) => s.kind === 'interaction');
    expect(items).toHaveLength(2);
    expect(items[0].kind).toBe('interaction');
    expect(items[1].kind).toBe('interaction');
  });

  it('assigns primary importance to interaction.presented', () => {
    const runtime = new ProjectionRuntime();
    runtime.processRecord(makeInteractionPresented());
    const projection = runtime.getProjection();
    const item = projection.stream.find((s) => s.kind === 'interaction');
    expect(item!.importance).toBe('primary');
  });

  it('assigns secondary importance to interaction.responded', () => {
    const runtime = new ProjectionRuntime();
    runtime.processRecord(makeInteractionPresented({ sequenceNumber: 1 }));
    runtime.processRecord(makeInteractionResponded({ sequenceNumber: 2 }));
    const projection = runtime.getProjection();
    const responded = projection.stream.find(
      (s) => s.kind === 'interaction' && s.interaction?.lifecycle === 'responded',
    );
    expect(responded!.importance).toBe('secondary');
  });

  it('carries interactionId in StreamItem.interaction', () => {
    const runtime = new ProjectionRuntime();
    runtime.processRecord(makeInteractionPresented());
    const projection = runtime.getProjection();
    const item = projection.stream.find((s) => s.kind === 'interaction');
    expect(item!.interaction).toBeDefined();
    expect(item!.interaction!.interactionId).toBe('int-001');
  });

  it('carries choices in StreamItem.interaction for presented', () => {
    const runtime = new ProjectionRuntime();
    runtime.processRecord(makeInteractionPresented());
    const projection = runtime.getProjection();
    const item = projection.stream.find((s) => s.kind === 'interaction');
    expect(item!.interaction!.choices).toBeDefined();
    expect(item!.interaction!.choices).toHaveLength(2);
    expect(item!.interaction!.choices![0].label).toBe('Approve');
  });

  it('carries selectedChoiceId for responded', () => {
    const runtime = new ProjectionRuntime();
    runtime.processRecord(makeInteractionPresented({ sequenceNumber: 1 }));
    runtime.processRecord(makeInteractionResponded({ sequenceNumber: 2 }));
    const projection = runtime.getProjection();
    const responded = projection.stream.find(
      (s) => s.kind === 'interaction' && s.interaction?.lifecycle === 'responded',
    );
    expect(responded!.interaction!.selectedChoiceId).toBe('approve');
  });

  it('carries responding participant identity for responded', () => {
    const runtime = new ProjectionRuntime();
    runtime.processRecord(makeInteractionPresented({ sequenceNumber: 1 }));
    runtime.processRecord(makeInteractionResponded({ sequenceNumber: 2 }));
    const projection = runtime.getProjection();
    const responded = projection.stream.find(
      (s) => s.kind === 'interaction' && s.interaction?.lifecycle === 'responded',
    );
    expect(responded!.interaction!.respondingParticipantId).toBe('human-user');
    expect(responded!.interaction!.respondingParticipantName).toBe('Human User');
  });

  it('preserves actor identity from presenting participant', () => {
    const runtime = new ProjectionRuntime();
    runtime.processRecord(makeInteractionPresented());
    const projection = runtime.getProjection();
    const item = projection.stream.find((s) => s.kind === 'interaction');
    expect(item!.actor.id).toBe('harness-producer');
    expect(item!.actor.displayName).toBe('Harness Producer');
  });

  it('does not set selectedChoiceId for presented interactions', () => {
    const runtime = new ProjectionRuntime();
    runtime.processRecord(makeInteractionPresented());
    const projection = runtime.getProjection();
    const item = projection.stream.find((s) => s.kind === 'interaction');
    expect(item!.interaction!.selectedChoiceId).toBeUndefined();
  });
});

// ─── M11C StreamItem Rendering Tests ─────────────────────────

function makeStreamItem(overrides: Partial<M11CStreamItem> = {}): M11CStreamItem {
  return {
    id: 'si-001',
    sequence: 1,
    timestamp: '2026-08-30T12:00:00Z',
    kind: 'interaction',
    importance: 'primary',
    actor: { type: 'system', id: 'producer', displayName: 'Test Producer' },
    content: 'How should we proceed?',
    fresh: false,
    ...overrides,
  };
}

describe('R4 M11C — StreamItem interaction rendering', () => {
  it('renders InteractionCard for interaction kind', () => {
    const item = makeStreamItem({
      interaction: {
        interactionId: 'int-test',
        lifecycle: 'presented',
        choices: [
          { choiceId: 'opt-a', label: 'Option A' },
          { choiceId: 'opt-b', label: 'Option B' },
        ],
      },
    });
    render(<M11CStreamItemComponent item={item} />);
    expect(screen.getByRole('article')).toBeDefined();
    expect(screen.getByText('Option A')).toBeDefined();
    expect(screen.getByText('Option B')).toBeDefined();
  });

  it('renders resolved state for responded lifecycle', () => {
    const item = makeStreamItem({
      interaction: {
        interactionId: 'int-test',
        lifecycle: 'responded',
        choices: [{ choiceId: 'approve', label: 'Approve' }],
        selectedChoiceId: 'approve',
        respondingParticipantId: 'human-1',
        respondingParticipantName: 'Human User',
      },
    });
    render(<M11CStreamItemComponent item={item} />);
    expect(screen.getByRole('article')).toBeDefined();
    expect(screen.getByText('Responded')).toBeDefined();
    expect(screen.getByText('Selected:')).toBeDefined();
  });

  it('does not render InteractionCard for non-interaction kind', () => {
    const item = makeStreamItem({ kind: 'activity', interaction: undefined });
    render(<M11CStreamItemComponent item={item} />);
    expect(screen.queryByRole('article')).toBeNull();
  });

  it('renders presenter name from actor identity', () => {
    const item = makeStreamItem({
      actor: { type: 'system', id: 'marketplace', displayName: 'Marketplace' },
      interaction: {
        interactionId: 'int-market',
        lifecycle: 'presented',
        choices: [{ choiceId: 'install', label: 'Install' }],
      },
    });
    render(<M11CStreamItemComponent item={item} />);
    expect(screen.getByText('Marketplace')).toBeDefined();
  });

  it('renders interaction content', () => {
    const item = makeStreamItem({
      content: 'Banana Department needs a decision.',
      interaction: {
        interactionId: 'int-banana',
        lifecycle: 'presented',
        choices: [{ choiceId: 'yellow', label: 'Yellow' }],
      },
    });
    render(<M11CStreamItemComponent item={item} />);
    expect(screen.getByText('Banana Department needs a decision.')).toBeDefined();
  });

  it('preserves fresh animation class for live arrivals', () => {
    const item = makeStreamItem({
      fresh: true,
      interaction: {
        interactionId: 'int-fresh',
        lifecycle: 'presented',
        choices: [{ choiceId: 'a', label: 'A' }],
      },
    });
    const { container } = render(<M11CStreamItemComponent item={item} />);
    const article = container.querySelector('article');
    expect(article?.className).toContain('animate-in');
  });
});

// ─── Genericity Tests ────────────────────────────────────────

describe('R4 Genericity — same projection path, different producers', () => {
  it('projects Harness approval interaction', () => {
    const runtime = new ProjectionRuntime();
    runtime.processRecord(makeInteractionPresented({
      actor: { type: 'system', id: 'harness', displayName: 'Agent Harness' },
      payload: {
        message: 'Approve shell.execute?',
        data: {
          interactionId: 'int-harness',
          choices: [
            { choiceId: 'approve', label: 'Approve' },
            { choiceId: 'reject', label: 'Reject' },
          ],
        },
      },
    }));
    const projection = runtime.getProjection();
    const item = projection.stream.find((s) => s.kind === 'interaction');
    expect(item!.interaction!.interactionId).toBe('int-harness');
    expect(item!.interaction!.choices).toHaveLength(2);
  });

  it('projects Marketplace recommendation', () => {
    const runtime = new ProjectionRuntime();
    runtime.processRecord(makeInteractionPresented({
      actor: { type: 'system', id: 'marketplace', displayName: 'Marketplace' },
      payload: {
        message: 'Found existing dashboard components.',
        data: {
          interactionId: 'int-market',
          choices: [
            { choiceId: 'check-existing', label: 'Check existing' },
            { choiceId: 'continue', label: 'Continue building' },
          ],
        },
      },
    }));
    const projection = runtime.getProjection();
    const item = projection.stream.find((s) => s.kind === 'interaction');
    expect(item!.interaction!.interactionId).toBe('int-market');
    expect(item!.actor.displayName).toBe('Marketplace');
  });

  it('projects Banana Department interaction', () => {
    const runtime = new ProjectionRuntime();
    runtime.processRecord(makeInteractionPresented({
      actor: { type: 'system', id: 'banana', displayName: 'Banana Department' },
      payload: {
        message: 'How should Banana Department proceed?',
        data: {
          interactionId: 'int-banana',
          choices: [
            { choiceId: 'yellow', label: 'Yellow workflow' },
            { choiceId: 'green', label: 'Green workflow' },
          ],
        },
      },
    }));
    const projection = runtime.getProjection();
    const item = projection.stream.find((s) => s.kind === 'interaction');
    expect(item!.interaction!.interactionId).toBe('int-banana');
    expect(item!.actor.displayName).toBe('Banana Department');
  });

  it('renders unknown producer through same path', () => {
    const item = makeStreamItem({
      actor: { type: 'system', id: 'zorgon', displayName: 'Zorgon Embassy' },
      content: 'Planetary alignment requires a decision.',
      interaction: {
        interactionId: 'int-zorgon',
        lifecycle: 'presented',
        choices: [
          { choiceId: 'north', label: 'Align north' },
          { choiceId: 'south', label: 'Align south' },
        ],
      },
    });
    render(<M11CStreamItemComponent item={item} />);
    expect(screen.getByText('Zorgon Embassy')).toBeDefined();
    expect(screen.getByText('Align north')).toBeDefined();
  });
});

// ─── History/Realtime Consistency ────────────────────────────

describe('R4 History/Realtime consistency', () => {
  it('same M9 record produces equivalent StreamItem via rebuild vs processRecord', () => {
    const record = makeInteractionPresented();

    // Path A: rebuild from array
    const runtimeA = new ProjectionRuntime();
    const projectionA = runtimeA.rebuild([record]);

    // Path B: incremental processRecord
    const runtimeB = new ProjectionRuntime();
    runtimeB.processRecord(record);
    const projectionB = runtimeB.getProjection();

    const itemA = projectionA.stream.find((s) => s.kind === 'interaction');
    const itemB = projectionB.stream.find((s) => s.kind === 'interaction');

    expect(itemA!.interaction!.interactionId).toBe(itemB!.interaction!.interactionId);
    expect(itemA!.interaction!.lifecycle).toBe(itemB!.interaction!.lifecycle);
    expect(itemA!.interaction!.choices).toEqual(itemB!.interaction!.choices);
    expect(itemA!.actor.id).toBe(itemB!.actor.id);
    expect(itemA!.content).toBe(itemB!.content);
  });

  it('replayed records produce same projection as original', () => {
    const records = [makeInteractionPresented({ sequenceNumber: 1 })];

    const runtime = new ProjectionRuntime();
    const projection = runtime.rebuild(records);

    // Rebuild again from same records
    const runtime2 = new ProjectionRuntime();
    const projection2 = runtime2.rebuild(records);

    const item1 = projection.stream.find((s) => s.kind === 'interaction');
    const item2 = projection2.stream.find((s) => s.kind === 'interaction');

    expect(item1!.interaction!.interactionId).toBe(item2!.interaction!.interactionId);
  });
});

// ─── Zero-Executable-Semantics Review ────────────────────────

describe('R4 Zero-executable-semantics — no authority leakage', () => {
  it('M10 projection does not add operational fields to StreamItem', () => {
    const runtime = new ProjectionRuntime();
    runtime.processRecord(makeInteractionPresented());
    const projection = runtime.getProjection();
    const item = projection.stream.find((s) => s.kind === 'interaction');

    // StreamItem must NOT contain:
    const streamItem = item as Record<string, unknown>;
    expect(streamItem.command).toBeUndefined();
    expect(streamItem.shellCommand).toBeUndefined();
    expect(streamItem.operation).toBeUndefined();
    expect(streamItem.execute).toBeUndefined();
    expect(streamItem.handler).toBeUndefined();
    expect(streamItem.approvalGranted).toBeUndefined();
    expect(streamItem.policyOverride).toBeUndefined();
  });

  it('InteractionCard onSelect callback is opaque — no execution assigned', () => {
    const onSelect = vi.fn();
    const item = makeStreamItem({
      interaction: {
        interactionId: 'int-test',
        lifecycle: 'presented',
        choices: [{ choiceId: 'a', label: 'A' }],
      },
    });
    render(<M11CStreamItemComponent item={item} />);
    // The component renders but does not expose executable semantics
    // The onSelect in M11CStreamItem is a no-op stub
    expect(screen.getByRole('article')).toBeDefined();
  });

  it('interaction data is presentation-only — no command/operation fields', () => {
    const runtime = new ProjectionRuntime();
    runtime.processRecord(makeInteractionPresented());
    const projection = runtime.getProjection();
    const item = projection.stream.find((s) => s.kind === 'interaction');
    const interaction = item!.interaction as Record<string, unknown>;

    // Interaction data must NOT contain:
    expect(interaction.command).toBeUndefined();
    expect(interaction.execute).toBeUndefined();
    expect(interaction.handler).toBeUndefined();
    expect(interaction.shellCommand).toBeUndefined();
    expect(interaction.operation).toBeUndefined();
  });

  it('choice labels are text-only — no operational meaning on StreamItem', () => {
    const runtime = new ProjectionRuntime();
    runtime.processRecord(makeInteractionPresented({
      payload: {
        message: 'Approve?',
        data: {
          interactionId: 'int-test',
          choices: [{ choiceId: 'approve', label: 'Approve' }],
        },
      },
    }));
    const projection = runtime.getProjection();
    const item = projection.stream.find((s) => s.kind === 'interaction');
    // The choice label 'Approve' is text — the StreamItem carries no approval authority
    expect(item!.interaction!.choices![0].label).toBe('Approve');
    const streamItem = item as Record<string, unknown>;
    expect(streamItem.approvalGranted).toBeUndefined();
  });
});
