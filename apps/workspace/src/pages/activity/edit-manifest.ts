export type Alignment = 'left' | 'center' | 'right';
export type Density = 'compact' | 'comfortable' | 'spacious';
export type Presentation = 'bubble' | 'minimal';

export interface EditTargetInfo {
  readonly component: string;
  readonly file: string;
}

export interface ImplementationProposal {
  readonly intent: {
    readonly target: string;
    readonly instance?: string;
    readonly alignment?: Alignment;
    readonly density?: Density;
    readonly presentation?: Presentation;
  };
  readonly resolvedTarget: string;
  readonly affectedSource: string;
  readonly proposedImplementation: string;
  readonly expectedVisualOutcome: string;
  readonly scope: string;
  readonly risk: string;
  readonly unrelatedBehavior: string;
  readonly verification: string;
}

/**
 * VE-4 — semantic target → component architecture resolution.
 *
 * The smallest bridge between what the human pointed at (VE-1), shaped (VE-2),
 * and had understood (VE-3), and what the software architecture requires. This
 * is a proposal only: it never mutates source.
 */
const EDIT_MANIFEST: Record<string, EditTargetInfo> = {
  'Activity Composer': {
    component: 'ActivityComposer',
    file: 'apps/workspace/src/pages/activity/ActivityComposer.tsx',
  },
  'Activity Stream': {
    component: 'ActivityStream',
    file: 'apps/workspace/src/pages/activity/ActivityStream.tsx',
  },
  'Activity Message': {
    component: 'ActivityItem (human/agent message variant)',
    file: 'apps/workspace/src/pages/activity/ActivityItem.tsx',
  },
  'Organizational Event': {
    component: 'ActivityItem (organizational-event variant)',
    file: 'apps/workspace/src/pages/activity/ActivityItem.tsx',
  },
};

export function implementationProposal(intent: {
  target: string;
  instance?: string;
  alignment?: Alignment;
  density?: Density;
  presentation?: Presentation;
}): ImplementationProposal {
  const info = EDIT_MANIFEST[intent.target] ?? {
    component: intent.target,
    file: 'unknown — not yet mapped',
  };

  const operations = [
    intent.alignment !== undefined ? `${intent.alignment} aligned` : undefined,
    intent.density !== undefined ? `${intent.density} density` : undefined,
    intent.presentation !== undefined ? `${intent.presentation} presentation` : undefined,
  ].filter((entry): entry is string => Boolean(entry));

  return {
    intent: {
      target: intent.target,
      instance: intent.instance,
      alignment: intent.alignment,
      density: intent.density,
      presentation: intent.presentation,
    },
    resolvedTarget: info.component,
    affectedSource: info.file,
    proposedImplementation: `Modify presentation configuration for the selected semantic variant (${operations.join(', ')}).`,
    expectedVisualOutcome: `Selected ${intent.target} becomes: ${operations.join(', ')}.`,
    scope: 'instance',
    risk: 'Low',
    unrelatedBehavior: 'No expected changes to unrelated components or behavior.',
    verification: 'Re-render target; compare resulting geometry/presentation against the confirmed Design Intent.',
  };
}
