import { describe, expect, it } from 'vitest';
import type { SurfaceLocation } from '@vestara/types';
import {
  isOrchestrationSurface,
  resolveAssistantSuggestions,
  resolveOrchestrationTemplateSuggestions,
} from './assistantSuggestionResolver';

function surface(path: string, overrides: Partial<SurfaceLocation> = {}): SurfaceLocation {
  return { path, routeId: null, title: null, section: null, ...overrides };
}

const TEMPLATES = [
  { id: 'feature-delivery', name: 'Feature Delivery', description: 'Plan, build, verify, and review.' },
  { id: 'activity-room-premium-redesign', name: 'Activity Room Premium Redesign', description: 'Redesign.' },
];

describe('isOrchestrationSurface', () => {
  it('matches the Orchestration route and its children only', () => {
    expect(isOrchestrationSurface(surface('/orchestration'))).toBe(true);
    expect(isOrchestrationSurface(surface('/orchestration/project-1'))).toBe(true);
    expect(isOrchestrationSurface(surface('/activity'))).toBe(false);
    expect(isOrchestrationSurface(surface('/'))).toBe(false);
  });
});

describe('resolveOrchestrationTemplateSuggestions', () => {
  it('is route-scoped to Orchestration', () => {
    expect(resolveOrchestrationTemplateSuggestions(surface('/agents'), TEMPLATES)).toEqual([]);
    expect(resolveOrchestrationTemplateSuggestions(surface('/orchestration'), TEMPLATES)).toHaveLength(2);
  });

  it('maps catalog presets to prefill actions with a prompt fallback', () => {
    const [first] = resolveOrchestrationTemplateSuggestions(surface('/orchestration'), TEMPLATES);
    expect(first).toMatchObject({
      id: 'tpl-feature-delivery',
      label: 'Feature Delivery',
      description: 'Plan, build, verify, and review.',
      category: 'template',
      action: { type: 'create-orchestration-project', templateId: 'feature-delivery', mode: 'prefill' },
    });
    expect(first?.prompt).toContain('Feature Delivery');
  });

  it('returns no rows when the catalog is empty', () => {
    expect(resolveOrchestrationTemplateSuggestions(surface('/orchestration'), [])).toEqual([]);
  });
});

describe('resolveAssistantSuggestions hierarchy', () => {
  it('uses the Orchestration route table', () => {
    const resolved = resolveAssistantSuggestions(surface('/orchestration'));
    expect(resolved.contextual.map((item) => item.id)).toContain('ctx-workflows-active');
    expect(resolved.contextCard.eyebrow).toBe('Build · Orchestration');
  });

  it('selection takes priority over the route table', () => {
    const resolved = resolveAssistantSuggestions(surface('/orchestration'), {
      kind: 'workflow',
      id: 'wf-1',
      label: 'Deploy pipeline',
    });
    expect(resolved.contextual.map((item) => item.id)).toEqual(['sel-summarize', 'sel-explain', 'sel-next']);
  });

  it('falls back for unknown routes', () => {
    const resolved = resolveAssistantSuggestions(surface('/unknown-surface'));
    expect(resolved.contextual.map((item) => item.id)).toEqual(['ctx-inspect', 'ctx-status', 'ctx-architecture']);
  });
});
