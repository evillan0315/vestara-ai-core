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
  {
    id: 'monorepo-build-matrix',
    name: 'Marketplace Monorepo Build Matrix',
    description:
      'Build every app and package in apps/ and packages/ (including providers and tools) in dependency order, then verify boundaries, artifacts, and lint.',
    goal: 'Build all 5 apps and 118 packages/providers/tools in dependency order (per workflows/monorepo-build-matrix.workflow.json) with verification passing.',
    tasks: [
      {
        summary: 'Install dependencies and regenerate build references (pnpm install + pnpm build:references)',
        files: [
          'package.json',
          'pnpm-workspace.yaml',
          'build-order.sh',
          'workflows/monorepo-build-matrix.workflow.json',
          'workflows/monorepo-build-matrix.sh',
        ],
        requiredCapabilities: ['code-generation'],
      },
      {
        summary: 'Build packages wave 1 of 3 (action → external-runtime) in topological order',
        files: [
          'packages/action',
          'packages/activity-room',
          'packages/agent-harness',
          'packages/agent-types',
          'packages/architecture-runtime',
          'packages/audio',
          'packages/boot-runtime',
          'packages/browser-runtime',
          'packages/capabilities',
          'packages/channel-runtime',
          'packages/channel-types',
          'packages/ci-contracts',
          'packages/ci-observer',
          'packages/ci-reviewer',
          'packages/codex-runtime',
          'packages/cognitive',
          'packages/configuration',
          'packages/context',
          'packages/context-intelligence',
          'packages/conversation',
          'packages/conversation-runtime',
          'packages/decision-pipeline',
          'packages/design-system',
          'packages/diff-engine',
          'packages/documentation',
          'packages/engineering-event-store',
          'packages/engineering-graph',
          'packages/evaluation',
          'packages/event-bus',
          'packages/events',
          'packages/events-server',
          'packages/evidence',
          'packages/execution-center',
          'packages/execution-types',
          'packages/extension-contracts',
          'packages/extension-runtime',
          'packages/external-runtime',
        ],
        requiredCapabilities: ['code-generation'],
      },
      {
        summary: 'Build packages wave 2 of 3 (filesystem-runtime → scheduler) in topological order',
        files: [
          'packages/filesystem-runtime',
          'packages/github-ci-adapter',
          'packages/health',
          'packages/history',
          'packages/host-runtime',
          'packages/intent',
          'packages/interaction-app',
          'packages/interaction-persistence',
          'packages/job',
          'packages/kernel',
          'packages/knowledge',
          'packages/knowledge-assertions',
          'packages/logger',
          'packages/marketplace',
          'packages/marketplace-ui',
          'packages/media-conference',
          'packages/media-runtime',
          'packages/memory',
          'packages/metrics',
          'packages/native-installer',
          'packages/observer',
          'packages/opencode-runtime',
          'packages/opportunity-registry',
          'packages/os-controller',
          'packages/ownership',
          'packages/permission',
          'packages/permission-contracts',
          'packages/permissions',
          'packages/policy-engine',
          'packages/policy-types',
          'packages/provider-runtime',
          'packages/reasoning',
          'packages/registry',
          'packages/repository-contracts',
          'packages/routing-types',
          'packages/runtime',
          'packages/scheduler',
        ],
        requiredCapabilities: ['code-generation'],
      },
      {
        summary: 'Build packages wave 3 of 3 (screen-capture → worktree-runtime) in topological order',
        files: [
          'packages/screen-capture',
          'packages/service-registry',
          'packages/settings-framework',
          'packages/shared',
          'packages/sqlite-migrations',
          'packages/state-machine',
          'packages/state-runtime',
          'packages/stream',
          'packages/stt',
          'packages/telegram-integration',
          'packages/telemetry',
          'packages/terminal-runtime',
          'packages/thread-runtime',
          'packages/tool-runtime',
          'packages/trust',
          'packages/tts',
          'packages/tui',
          'packages/tui-projections',
          'packages/tui-protocol',
          'packages/tui-renderer',
          'packages/types',
          'packages/ui',
          'packages/ui-components',
          'packages/ui-theme',
          'packages/ui-tokens',
          'packages/understanding',
          'packages/verification',
          'packages/verification-evidence',
          'packages/voice-browser',
          'packages/widget-runtime',
          'packages/worker',
          'packages/workflow-orchestrator',
          'packages/workflow-projections',
          'packages/workspace',
          'packages/worktree-runtime',
        ],
        requiredCapabilities: ['code-generation'],
      },
      {
        summary: 'Build providers and tools (packages/providers/*, packages/tools/*)',
        files: [
          'packages/providers/opencode',
          'packages/tools/browser',
          'packages/tools/filesystem',
          'packages/tools/git',
          'packages/tools/knowledge',
          'packages/tools/mcp-server',
          'packages/tools/memory',
          'packages/tools/project',
          'packages/tools/shell',
        ],
        requiredCapabilities: ['code-generation'],
      },
      {
        summary:
          'Build apps (api, cli, onboarding-lab, workspace, workspace-ui-v2); workspace-ui separately per architecture boundary',
        files: ['apps/api', 'apps/cli', 'apps/onboarding-lab', 'apps/workspace', 'apps/workspace-ui-v2'],
        requiredCapabilities: ['code-generation'],
      },
      {
        summary: 'Verify with dependency boundaries, source artifacts, build, lint, and tests',
        files: ['scripts/workspace-architecture.mjs', 'scripts/check-source-artifacts.mjs'],
        requiredCapabilities: ['testing'],
      },
    ],
  },
] as const;

export function findOrchestrationTemplate(templateId: string): OrchestrationTemplate | undefined {
  return ORCHESTRATION_TEMPLATES.find((template) => template.id === templateId);
}
