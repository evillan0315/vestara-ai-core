/**
 * GA-UX-002 — Assistant UI/UX Suggestion Fixtures
 *
 * Local fixture dataset for the "UI/UX recommendations" section of the
 * Global Assistant default new-conversation launch surface.
 *
 * Governance:
 *   - API first → mock server (:3002) → local fixtures — never inline
 *     arrays in JSX. SuggestionEmptyState renders; the resolver owns
 *     policy; this module owns the static UX vocabulary.
 *   - No visual values here — labels/prompts only. Presentation lives in
 *     ConversationPanel and must use `var(--vestara-*)` tokens.
 *
 * @see apps/workspace/src/components/assistant/assistantSuggestionResolver.ts
 */

import type { AssistantSuggestion } from './assistantSuggestionResolver';

/** Generic UI/UX recommendations — used when no route-specific set matches. */
export const UX_RECOMMENDATION_FALLBACK_FIXTURES: readonly AssistantSuggestion[] = [
  {
    id: 'ux-review-layout',
    label: 'Review this page layout',
    prompt: 'Review the layout of the current page and suggest UI/UX improvements for hierarchy, spacing, and readability.',
    category: 'design',
  },
  {
    id: 'ux-accessibility',
    label: 'Check accessibility',
    prompt: 'Check the current page for accessibility issues (contrast, focus states, labels, keyboard navigation) and recommend fixes.',
    category: 'design',
  },
  {
    id: 'ux-visual-polish',
    label: 'Suggest visual polish',
    prompt: 'Suggest visual polish for the current page using the Vestara design tokens (no hardcoded colors or spacing).',
    category: 'design',
  },
] as const;

/**
 * Route-keyed UI/UX recommendations.
 * Keys match normalized navigation ids (see normalizeRouteKey in the resolver).
 * Each entry: 2–3 high-value design prompts, no fabricated state assertions.
 */
export const UX_ROUTE_RECOMMENDATION_FIXTURES: Record<string, readonly AssistantSuggestion[]> = {
  overview: [
    {
      id: 'ux-overview-hierarchy',
      label: 'Improve overview hierarchy',
      prompt: 'Review the Overview page hierarchy (hero, focus, activity) and suggest UI/UX improvements for clarity and scannability.',
      category: 'design',
    },
    {
      id: 'ux-overview-density',
      label: 'Tune information density',
      prompt: 'Assess the information density of the Overview page and recommend a cleaner arrangement that keeps key signals visible.',
      category: 'design',
    },
    {
      id: 'ux-overview-actions',
      label: 'Clarify quick actions',
      prompt: 'Review the Overview quick actions and suggest improvements so the next step is always obvious.',
      category: 'design',
    },
  ],
  activity: [
    {
      id: 'ux-activity-clarity',
      label: 'Clarify live activity',
      prompt: 'Review the Activity Room presentation and suggest UI/UX improvements so live agent and workflow signals are easy to scan.',
      category: 'design',
    },
    {
      id: 'ux-activity-empty',
      label: 'Improve empty states',
      prompt: 'Suggest better empty and loading states for the Activity Room when there is no live work to show.',
      category: 'design',
    },
  ],
  execution: [
    {
      id: 'ux-exec-status',
      label: 'Clarify execution status',
      prompt: 'Review how execution status is presented and suggest UI/UX improvements for distinguishing running, failed, and completed work.',
      category: 'design',
    },
    {
      id: 'ux-exec-timeline',
      label: 'Improve run timeline',
      prompt: 'Suggest improvements for the execution timeline so progress and failures are understandable at a glance.',
      category: 'design',
    },
  ],
  agents: [
    {
      id: 'ux-agents-clarity',
      label: 'Clarify agent states',
      prompt: 'Review the agent list presentation and suggest UI/UX improvements for showing agent state, role, and availability.',
      category: 'design',
    },
    {
      id: 'ux-agents-compare',
      label: 'Compare agent options',
      prompt: 'Suggest a clearer way to compare agents and pick the right one for a task.',
      category: 'design',
    },
  ],
  orchestration: [
    {
      id: 'ux-flows-pipeline',
      label: 'Clarify workflow pipeline',
      prompt: 'Review the Workflows presentation and suggest UI/UX improvements so pipeline stages and blocked work stand out.',
      category: 'design',
    },
    {
      id: 'ux-flows-next',
      label: 'Surface next steps',
      prompt: 'Suggest how the Workflows page could better surface the next recommended action.',
      category: 'design',
    },
  ],
  marketplace: [
    {
      id: 'ux-market-cards',
      label: 'Improve capability cards',
      prompt: 'Review the Marketplace gallery cards and suggest UI/UX improvements for consistency, ratings, and install clarity.',
      category: 'design',
    },
    {
      id: 'ux-market-discover',
      label: 'Improve discoverability',
      prompt: 'Suggest improvements for discovering relevant Marketplace capabilities from the current workspace context.',
      category: 'design',
    },
  ],
  projects: [
    {
      id: 'ux-projects-structure',
      label: 'Clarify project structure',
      prompt: 'Review the Projects presentation and suggest UI/UX improvements for navigating repositories, branches, and recent changes.',
      category: 'design',
    },
    {
      id: 'ux-projects-health',
      label: 'Surface project health',
      prompt: 'Suggest a clearer way to surface project health and recent activity on the Projects page.',
      category: 'design',
    },
  ],
  files: [
    {
      id: 'ux-files-navigate',
      label: 'Improve file navigation',
      prompt: 'Review the file browsing experience and suggest UI/UX improvements for finding relevant files faster.',
      category: 'design',
    },
    {
      id: 'ux-files-preview',
      label: 'Improve file previews',
      prompt: 'Suggest improvements for file previews so structure and changes are easy to understand.',
      category: 'design',
    },
  ],
  graph: [
    {
      id: 'ux-graph-legibility',
      label: 'Improve graph legibility',
      prompt: 'Review the Engineering Graph presentation and suggest UI/UX improvements for legibility of entities and relationships.',
      category: 'design',
    },
    {
      id: 'ux-graph-focus',
      label: 'Focus key entities',
      prompt: 'Suggest how the graph could better highlight the entities most relevant to my current work.',
      category: 'design',
    },
  ],
  diagnostics: [
    {
      id: 'ux-diag-signals',
      label: 'Clarify health signals',
      prompt: 'Review the Diagnostic Center signals and suggest UI/UX improvements so health, warnings, and errors are instantly distinguishable.',
      category: 'design',
    },
    {
      id: 'ux-diag-actions',
      label: 'Recommend fixes',
      prompt: 'Suggest how diagnostics could better recommend the next fix or investigation step.',
      category: 'design',
    },
  ],
  dashboard: [
    {
      id: 'ux-dashboard-focus',
      label: 'Focus dashboard signals',
      prompt: 'Review the Dashboard presentation and suggest UI/UX improvements so the most important signals stand out first.',
      category: 'design',
    },
    {
      id: 'ux-dashboard-empty',
      label: 'Improve empty dashboard',
      prompt: 'Suggest better empty and onboarding states for the Dashboard when no signals are available yet.',
      category: 'design',
    },
  ],
  settings: [
    {
      id: 'ux-settings-tokens',
      label: 'Review token usage',
      prompt: 'Review the current settings page and recommend improvements that keep every visual value on Vestara design tokens.',
      category: 'design',
    },
    {
      id: 'ux-settings-contrast',
      label: 'Check contrast & spacing',
      prompt: 'Check this settings page for contrast, spacing, and control alignment issues and recommend fixes.',
      category: 'design',
    },
  ],
} as const;
