/**
 * Orchestration project templates — curated creation presets for the
 * project-based Orchestration surface (ADR-118 / PCS-025).
 *
 * These are CREATE presets (goal + plan task rows) for
 * `POST /api/orchestration/projects`. They are deliberately NOT the
 * multi-agent stage catalog (`MULTI_AGENT_WORKFLOW_TEMPLATES` in
 * `@vestara/workspace`), which governs `POST /api/workflows` stage execution.
 * Two ids are shared with that catalog for recognition, but the payloads are
 * not interchangeable: a stage plan is not a project plan.
 *
 * The catalog is the single source of truth for template labels, goals, and
 * task rows. UI surfaces must fetch it (`GET /api/orchestration/templates`)
 * rather than re-declaring names or tasks.
 */

export interface OrchestrationTemplateTask {
  readonly summary: string;
  readonly files: readonly string[];
  readonly requiredCapabilities: readonly string[];
}

export interface OrchestrationTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Default goal prefilled into the creation surface. */
  readonly goal: string;
  readonly tasks: readonly OrchestrationTemplateTask[];
}

export const ORCHESTRATION_TEMPLATES: readonly OrchestrationTemplate[] = [
  {
    id: 'feature-delivery',
    name: 'Feature Delivery',
    description: 'Plan, build, verify, and review a scoped feature.',
    goal: 'Deliver a scoped feature end to end, with verification and review before completion.',
    tasks: [
      {
        summary: 'Analyze the codebase and produce an implementation plan',
        files: [],
        requiredCapabilities: ['planning', 'architecture-analysis'],
      },
      {
        summary: 'Implement the planned changes',
        files: [],
        requiredCapabilities: ['code-generation'],
      },
      {
        summary: 'Verify the changes with build, lint, and tests',
        files: [],
        requiredCapabilities: ['testing'],
      },
      {
        summary: 'Review the diff against the acceptance boundary',
        files: [],
        requiredCapabilities: ['design-review'],
      },
    ],
  },
  {
    id: 'agent-control-restructure',
    name: 'Restructure Agent Control',
    description: 'Decompose the Agent Control page into focused, testable sub-components without changing behavior.',
    goal: 'Refactor the Agent Control Center page into focused, testable sub-components without changing behavior.',
    tasks: [
      {
        summary: 'Analyze the Agent Control page and propose a component decomposition',
        files: ['apps/workspace/src/pages/Agents.tsx'],
        requiredCapabilities: ['architecture-analysis', 'planning'],
      },
      {
        summary: 'Extract the identified sub-components and move co-located state',
        files: ['apps/workspace/src/pages/Agents.tsx'],
        requiredCapabilities: ['refactoring'],
      },
      {
        summary: 'Add focused tests for previously untested extracted components',
        files: [],
        requiredCapabilities: ['testing'],
      },
      {
        summary: 'Verify behavior is unchanged and the acceptance boundary holds',
        files: [],
        requiredCapabilities: ['testing', 'quality-analysis'],
      },
      {
        summary: 'Review the restructure diff for scope creep',
        files: [],
        requiredCapabilities: ['design-review'],
      },
    ],
  },
  {
    id: 'activity-room-premium-redesign',
    name: 'Activity Room Premium Redesign',
    description:
      'Redesign the Activity Room toward the premium operations-room contract while preserving protected behaviors.',
    goal: 'Redesign the Activity Room toward the premium operations-room contract while preserving all protected behaviors.',
    tasks: [
      {
        summary: 'Produce the visual design spec and protected-behavior inventory',
        files: ['apps/workspace/src/pages/activity/'],
        requiredCapabilities: ['architecture-analysis'],
      },
      {
        summary: 'Implement the layout and component changes',
        files: ['apps/workspace/src/pages/activity/'],
        requiredCapabilities: ['code-generation'],
      },
      {
        summary: 'Verify protected behaviors with build, lint, and tests',
        files: [],
        requiredCapabilities: ['testing'],
      },
      {
        summary: 'Review the redesign against the visual contract',
        files: [],
        requiredCapabilities: ['design-review'],
      },
    ],
  },
] as const;

export function findOrchestrationTemplate(templateId: string): OrchestrationTemplate | undefined {
  return ORCHESTRATION_TEMPLATES.find((template) => template.id === templateId);
}
