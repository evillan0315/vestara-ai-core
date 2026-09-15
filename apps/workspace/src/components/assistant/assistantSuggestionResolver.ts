/**
 * GA-UX-002 — Assistant Suggestion Resolver
 *
 * Bounded presentation resolver: SurfaceContext → SuggestionModel[].
 *
 * ConversationPanel renders; this module owns suggestion intelligence.
 * No execution authority, no retrieval, no RAG.
 *
 * Hierarchy:
 *   SELECTED ENTITY
 *     ↓
 *   CURRENT SECTION / ROUTE
 *     ↓
 *   WORKSPACE CONTEXT
 *     ↓
 *   GENERIC ASSISTANT ACTIONS
 *
 * Canonical route intelligence consumed from:
 *   - WORKSPACE_NAVIGATION (workspace-navigation.tsx)
 *   - APP_ROUTES (routes.ts)
 *   - ROUTE_HERO_CONFIG (PageHero/route-hero-config.ts)
 *   - SETTINGS_SECTIONS (pages/Settings/settings-navigation.ts)
 *
 * Route detection and suggestion policy are separate concerns:
 *   Workspace/Page Registry → SurfaceContext → Resolver
 */

import type { SurfaceContext, SurfaceLocation } from '@vestara/types';
import { WORKSPACE_NAVIGATION } from '../../layouts/workspace-navigation.js';
import { ROUTE_HERO_CONFIG } from '../layout/PageHero/route-hero-config.js';
import { SETTINGS_SECTIONS } from '../../pages/Settings/settings-navigation.js';
import {
  UX_RECOMMENDATION_FALLBACK_FIXTURES,
  UX_ROUTE_RECOMMENDATION_FIXTURES,
} from './assistantUxSuggestions.fixtures.js';

// ─── Suggestion Model ──────────────────────────────────────────

export type SuggestionCategory = 'context' | 'workspace' | 'attention' | 'quick_action' | 'design';

export interface AssistantSuggestion {
  readonly id: string;
  readonly label: string;
  readonly prompt: string;
  readonly category: SuggestionCategory;
  readonly icon?: string;
  readonly priority?: 'high' | 'medium' | 'low';
}

export interface AssistantContextCard {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly path: string;
}

export interface ResolvedLaunchSurface {
  readonly contextCard: AssistantContextCard;
  readonly contextual: readonly AssistantSuggestion[];
  readonly quickActions: readonly AssistantSuggestion[];
  /** GA-UX-002: UI/UX suggestions and recommendations for the current surface. */
  readonly uxRecommendations: readonly AssistantSuggestion[];
}

// ─── Helpers ───────────────────────────────────────────────────

function truncateLabel(value: string, max: number): string {
  const clean = value.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function stripTab(path: string): string {
  return path.split('?')[0] ?? path;
}

function getTab(path: string): string | null {
  try {
    return new URLSearchParams(path.split('?')[1] ?? '').get('tab');
  } catch {
    return null;
  }
}

// ─── Canonical lookup ──────────────────────────────────────────

function lookupNavigation(pathname: string) {
  const clean = stripTab(pathname);
  const entries = [...WORKSPACE_NAVIGATION].sort((a, b) => (b.path?.length ?? 0) - (a.path?.length ?? 0));
  return entries.find((e) => e.path && (clean === e.path || clean.startsWith(e.path + '/') || clean === e.path + '/*'));
}

function groupLabel(group: string): string {
  const map: Record<string, string> = {
    workspace: 'Workspace',
    build: 'Build',
    automation: 'Automation',
    intelligence: 'Intelligence',
    runtime: 'Runtime',
    operations: 'Operations',
    extend: 'Extend',
    system: 'System',
  };
  return map[group] ?? group;
}

// ─── Context Card ──────────────────────────────────────────────

const TAB_META: Record<string, { label: string; description: string }> = {
  appearance: { label: 'Appearance', description: 'Configure how Vestara looks and feels.' },
  typography: { label: 'Typography', description: 'Configure fonts, sizes, and text presentation.' },
  layout: { label: 'Layout', description: 'Adjust workspace layout, density, and structure.' },
  profiles: { label: 'Profiles', description: 'Manage workspace profiles and theme presets.' },
};

function resolveSettingsContextCard(path: string, navEntry: ReturnType<typeof lookupNavigation>): AssistantContextCard {
  const tab = getTab(path);
  const clean = stripTab(path);
  const sub = clean.replace(/^\/settings\/?/, '').split('/')[0] ?? '';

  // Inner tab (e.g. /settings/general?tab=appearance) — highest fidelity
  if (tab && TAB_META[tab]) {
    const meta = TAB_META[tab];
    return {
      eyebrow: `Settings · ${meta.label}`,
      title: meta.label,
      description: meta.description,
      path,
    };
  }

  // Sub-section (e.g. /settings/providers, /settings/runtime)
  if (sub) {
    const section = SETTINGS_SECTIONS.find((s) => s.id === sub);
    if (section) {
      return {
        eyebrow: `Settings · ${section.label}`,
        title: section.label,
        description: section.description,
        path,
      };
    }
  }

  // Fallback — canonical Settings hero
  const hero = ROUTE_HERO_CONFIG.settings;
  return {
    eyebrow: navEntry ? `${groupLabel(navEntry.group)} · Settings` : 'System · Settings',
    title: hero?.title ?? navEntry?.label ?? 'Settings',
    description: hero?.subtitle ?? navEntry?.description ?? 'Configure how Vestara looks and feels.',
    path,
  };
}

export function resolveContextCard(surface: SurfaceLocation): AssistantContextCard {
  const path = surface.path ?? '/';
  const nav = lookupNavigation(path);

  // Settings is a compound surface with inner tabs/sections
  if (path.startsWith('/settings')) {
    return resolveSettingsContextCard(path, nav);
  }

  // Canonical navigation-backed context
  if (nav) {
    const hero = ROUTE_HERO_CONFIG[nav.id];
    const title = surface.title ?? hero?.title ?? nav.label;
    const description = hero?.subtitle ?? nav.description ?? `Explore ${nav.label} in your workspace.`;
    return {
      eyebrow: `${groupLabel(nav.group)} · ${nav.label}`,
      title,
      description,
      path: surface.path,
    };
  }

  // Fallback for unmatched routes — use SurfaceLocation title if present
  if (surface.title) {
    return {
      eyebrow: surface.section ? `${surface.section} · ${surface.title}` : surface.title,
      title: surface.title,
      description: `Explore ${surface.title} in your workspace.`,
      path: surface.path,
    };
  }

  return {
    eyebrow: 'Workspace',
    title: 'Workspace',
    description: 'Ask about this workspace, inspect the repository, or start an engineering task.',
    path: surface.path,
  };
}

// ─── Route-aware suggestion tables ─────────────────────────────
// Each entry: ~3-5 high-value prompts, no fabricated state assertions.

function settingsSuggestions(path: string): AssistantSuggestion[] {
  const tab = getTab(path);
  if (tab === 'appearance' || tab === 'typography' || tab === 'layout') {
    return [
      { id: 'ctx-explain-appearance', label: 'Explain these settings', prompt: 'Explain the appearance settings on this page and what each control does.', category: 'context' },
      { id: 'ctx-theme-rec', label: 'Recommend a workspace theme', prompt: 'Recommend a theme configuration that would suit this workspace.', category: 'context' },
      { id: 'ctx-review-appearance', label: 'Review appearance configuration', prompt: 'Review my current appearance configuration and describe what is set.', category: 'context' },
      { id: 'ctx-what-controls', label: 'Show what this page controls', prompt: 'Show what this settings page controls and which effects are visible.', category: 'context' },
    ];
  }
  const clean = stripTab(path);
  const sub = clean.replace(/^\/settings\/?/, '').split('/')[0] ?? '';
  if (sub === 'providers' || sub === 'agents' || sub === 'assistant-execution') {
    return [
      { id: 'ctx-explain-ai-settings', label: 'Explain these settings', prompt: 'Explain the AI and execution settings on this page.', category: 'context' },
      { id: 'ctx-review-providers', label: 'Review provider configuration', prompt: 'Review my current provider and model configuration.', category: 'context' },
      { id: 'ctx-suggest-provider', label: 'Suggest provider improvements', prompt: 'Suggest improvements for my provider and model setup.', category: 'context' },
    ];
  }
  if (sub === 'navigation') {
    return [
      { id: 'ctx-explain-nav', label: 'Explain navigation settings', prompt: 'Explain how navigation settings control the workspace sidebar and menus.', category: 'context' },
      { id: 'ctx-review-menus', label: 'Review my menus', prompt: 'Review my current navigation and custom menu entries.', category: 'context' },
      { id: 'ctx-suggest-nav', label: 'Suggest navigation improvements', prompt: 'Suggest improvements for my workspace navigation.', category: 'context' },
    ];
  }
  return [
    { id: 'ctx-explain-settings', label: 'Explain these settings', prompt: 'Explain what the settings on this page control.', category: 'context' },
    { id: 'ctx-review-config', label: 'Review configuration', prompt: 'Review my current workspace configuration and summarize it.', category: 'context' },
    { id: 'ctx-recommend-improvements', label: 'Recommend improvements', prompt: 'Recommend improvements for my workspace configuration.', category: 'context' },
    { id: 'ctx-check-related', label: 'Check related issues', prompt: 'Check whether there are any configuration issues I should be aware of.', category: 'context' },
  ];
}

const ROUTE_SUGGESTIONS: Record<string, AssistantSuggestion[]> = {
  activity: [
    { id: 'ctx-activity-recent', label: 'Summarize recent activity', prompt: 'Summarize recent activity in this workspace.', category: 'context' },
    { id: 'ctx-activity-attention', label: 'What needs my attention?', prompt: 'What needs my attention right now?', category: 'context' },
    { id: 'ctx-activity-now', label: "Explain what's happening now", prompt: "Explain what's happening in the workspace right now.", category: 'context' },
    { id: 'ctx-activity-active', label: 'Review active work', prompt: 'Review the active work and what is in progress.', category: 'context' },
  ],
  execution: [
    { id: 'ctx-exec-recent', label: 'Review recent executions', prompt: 'Review recent executions and their outcomes.', category: 'context' },
    { id: 'ctx-exec-failed', label: 'Explain failed work', prompt: 'Explain any failed work and what might have gone wrong.', category: 'context' },
    { id: 'ctx-exec-running', label: 'Show what is currently running', prompt: 'Show what is currently running.', category: 'context' },
    { id: 'ctx-exec-investigate', label: 'Suggest what to investigate', prompt: 'Suggest what I should investigate in recent executions.', category: 'context' },
  ],
  agents: [
    { id: 'ctx-agents-review', label: 'Review my agents', prompt: 'Review my agents and their current state.', category: 'context' },
    { id: 'ctx-agents-working', label: 'Which agents are working?', prompt: 'Which agents are currently working and what are they doing?', category: 'context' },
    { id: 'ctx-agents-responsibilities', label: 'Explain agent responsibilities', prompt: 'Explain the responsibilities of the agents in this workspace.', category: 'context' },
    { id: 'ctx-agents-suggest', label: 'Suggest an agent for this task', prompt: 'Suggest which agent would be best for a task I have in mind.', category: 'context' },
  ],
  orchestration: [
    { id: 'ctx-workflows-active', label: 'Review active workflows', prompt: 'Review the active workflows in this workspace.', category: 'context' },
    { id: 'ctx-workflows-explain', label: 'Explain this workflow', prompt: 'Explain how workflows operate in this workspace.', category: 'context' },
    { id: 'ctx-workflows-blocked', label: 'Find blocked work', prompt: 'Find any blocked work in the current workflows.', category: 'context' },
    { id: 'ctx-workflows-next', label: 'Suggest next steps', prompt: 'Suggest next steps for the current workflows.', category: 'context' },
  ],
  marketplace: [
    { id: 'ctx-market-find', label: 'Find useful capabilities', prompt: 'Find useful capabilities I could add to this workspace.', category: 'context' },
    { id: 'ctx-market-explain', label: 'Explain this capability', prompt: 'Explain how marketplace capabilities extend this workspace.', category: 'context' },
    { id: 'ctx-market-improve', label: 'What could improve this workspace?', prompt: 'What could improve this workspace? Suggest relevant capabilities.', category: 'context' },
    { id: 'ctx-market-installed', label: 'Review installed capabilities', prompt: 'Review the capabilities currently installed in this workspace.', category: 'context' },
  ],
  projects: [
    { id: 'ctx-projects-explain', label: 'Explain this project', prompt: 'Explain the projects in this workspace and their structure.', category: 'context' },
    { id: 'ctx-projects-inspect', label: 'Inspect repository structure', prompt: 'Inspect the repository structure and summarize it.', category: 'context' },
    { id: 'ctx-projects-files', label: 'Find relevant files', prompt: 'Find relevant files for understanding this workspace.', category: 'context' },
    { id: 'ctx-projects-changes', label: 'Review recent changes', prompt: 'Review recent changes to the projects.', category: 'context' },
  ],
  files: [
    { id: 'ctx-files-explain', label: 'Explain this project', prompt: 'Explain this project and its file organization.', category: 'context' },
    { id: 'ctx-files-inspect', label: 'Inspect repository structure', prompt: 'Inspect the repository structure and summarize what you find.', category: 'context' },
    { id: 'ctx-files-relevant', label: 'Find relevant files', prompt: 'Find relevant files I should be aware of.', category: 'context' },
    { id: 'ctx-files-changes', label: 'Review recent changes', prompt: 'Review recent changes in the repository.', category: 'context' },
  ],
  graph: [
    { id: 'ctx-graph-explain', label: 'Explain this graph', prompt: 'Explain the engineering graph and what it shows.', category: 'context' },
    { id: 'ctx-graph-entities', label: 'Show key entities', prompt: 'Show the key entities in the engineering graph.', category: 'context' },
    { id: 'ctx-graph-relationships', label: 'Explain relationships', prompt: 'Explain the relationships between entities in this workspace.', category: 'context' },
  ],
  diagnostics: [
    { id: 'ctx-diag-health', label: 'Summarize system health', prompt: 'Summarize the current system health and any concerns.', category: 'context' },
    { id: 'ctx-diag-explain', label: 'Explain system status', prompt: 'Explain the current system status and what the signals mean.', category: 'context' },
    { id: 'ctx-diag-processes', label: 'Review running processes', prompt: 'Review the currently running processes.', category: 'context' },
  ],
  overview: [
    { id: 'ctx-overview-explain', label: 'Explain this workspace', prompt: 'Explain this workspace and its purpose.', category: 'context' },
    { id: 'ctx-overview-status', label: 'Check workspace status', prompt: 'Check the workspace status and summarize it.', category: 'context' },
    { id: 'ctx-overview-next', label: 'Suggest next steps', prompt: 'Suggest what I should do next in this workspace.', category: 'context' },
  ],
  workforce: [
    { id: 'ctx-workforce-review', label: 'Review workforce', prompt: 'Review the engineering workforce and their assignments.', category: 'context' },
    { id: 'ctx-workforce-agents', label: 'Explain team structure', prompt: 'Explain the team structure and agent roles.', category: 'context' },
  ],
  terminal: [
    { id: 'ctx-terminal-explain', label: 'Explain terminal usage', prompt: 'Explain how the terminal works in this workspace.', category: 'context' },
    { id: 'ctx-terminal-inspect', label: 'Inspect recent commands', prompt: 'What can I do with the terminal here?', category: 'context' },
  ],
  dashboard: [
    { id: 'ctx-dashboard-summarize', label: 'Summarize dashboard', prompt: 'Summarize the dashboard and its key signals.', category: 'context' },
    { id: 'ctx-dashboard-attention', label: 'What needs attention?', prompt: 'What needs my attention on the dashboard?', category: 'context' },
  ],
};

export const QUICK_ACTIONS: readonly AssistantSuggestion[] = [
  { id: 'quick-inspect', label: 'Inspect repository', prompt: 'Inspect the repository and summarize its current state.', category: 'quick_action' },
  { id: 'quick-status', label: 'Check project status', prompt: 'Check the repository status.', category: 'quick_action' },
  { id: 'quick-architecture', label: 'Explain architecture', prompt: 'Explain the main architecture of this project.', category: 'quick_action' },
  { id: 'quick-changes', label: 'Find recent changes', prompt: 'Review the recent changes and summarize what was modified.', category: 'quick_action' },
] as const;

// ─── Selected-entity suggestions ────────────────────────────────

function selectedSuggestions(selected: NonNullable<SurfaceContext['selected']>): AssistantSuggestion[] {
  const label = selected.label ?? selected.id;
  const kind = selected.kind ?? 'item';
  const ref = `${kind} "${label}"`;
  return [
    { id: 'sel-summarize', label: `Summarize ${truncateLabel(label, 24)}`, prompt: `Summarize the selected ${ref}.`, category: 'context' },
    { id: 'sel-explain', label: `Explain ${truncateLabel(label, 24)}`, prompt: `Explain the selected ${ref}.`, category: 'context' },
    { id: 'sel-next', label: 'Suggest next steps', prompt: `Suggest concrete next steps for the selected ${ref}.`, category: 'context' },
  ];
}

// ─── Route key normalization ───────────────────────────────────

function normalizeRouteKey(surface: SurfaceLocation): string | null {
  // Prefer navigation id-derived key from path, fall back to routeId
  const path = stripTab(surface.path ?? '');
  const nav = lookupNavigation(path);
  if (nav) return nav.id;
  const raw = surface.routeId ?? '';
  if (!raw) return null;
  // routeId may be a path like "/activity" — normalize
  return raw.replace(/^\//, '').split('/')[0].split('?')[0].replace('/*', '') || null;
}

// ─── UI/UX recommendations ─────────────────────────────────────
// Static fixture-backed vocabulary (never inline arrays in JSX).
// Selected entities get a bounded design set; routes get their own table;
// everything else falls back to the generic fixtures.

function selectedUxRecommendations(selected: NonNullable<SurfaceContext['selected']>): AssistantSuggestion[] {
  const label = selected.label ?? selected.id;
  const kind = selected.kind ?? 'item';
  const ref = `${kind} "${label}"`;
  return [
    {
      id: 'ux-sel-improve',
      label: `Improve ${truncateLabel(label, 22)} display`,
      prompt: `Review how the selected ${ref} is displayed and suggest UI/UX improvements for clarity and consistency.`,
      category: 'design',
    },
    {
      id: 'ux-sel-accessibility',
      label: 'Check selection accessibility',
      prompt: `Check the selected ${ref} presentation for accessibility (contrast, focus, labels) and recommend fixes.`,
      category: 'design',
    },
  ];
}

export function resolveUxRecommendations(
  surface: SurfaceLocation,
  selected?: SurfaceContext['selected'],
): readonly AssistantSuggestion[] {
  if (selected?.id) return selectedUxRecommendations(selected);
  if (surface.path?.startsWith('/settings')) return UX_ROUTE_RECOMMENDATION_FIXTURES.settings;
  const key = normalizeRouteKey(surface);
  if (key && UX_ROUTE_RECOMMENDATION_FIXTURES[key]) return UX_ROUTE_RECOMMENDATION_FIXTURES[key];
  return UX_RECOMMENDATION_FALLBACK_FIXTURES;
}

// ─── Main resolver ────────────────────────────────────────────

export function resolveAssistantSuggestions(surface: SurfaceLocation, selected?: SurfaceContext['selected']): ResolvedLaunchSurface {
  const contextCard = resolveContextCard(surface);
  const uxRecommendations = resolveUxRecommendations(surface, selected);

  // Priority 1: selected entity
  if (selected?.id) {
    return {
      contextCard,
      contextual: selectedSuggestions(selected),
      quickActions: QUICK_ACTIONS,
      uxRecommendations,
    };
  }

  // Priority 2: current section / route
  // Settings has compound inner routing
  if (surface.path?.startsWith('/settings')) {
    return {
      contextCard,
      contextual: settingsSuggestions(surface.path),
      quickActions: QUICK_ACTIONS,
      uxRecommendations,
    };
  }

  const key = normalizeRouteKey(surface);
  if (key && ROUTE_SUGGESTIONS[key]) {
    return {
      contextCard,
      contextual: ROUTE_SUGGESTIONS[key],
      quickActions: QUICK_ACTIONS,
      uxRecommendations,
    };
  }

  // Priority 3/4: workspace context → generic fallback
  // For known-but-unmapped routes, use generic contextual that still feels workspace-aware
  const fallbackContextual: AssistantSuggestion[] = [
    { id: 'ctx-inspect', label: 'Inspect repository', prompt: 'Inspect the repository and summarize its current state.', category: 'context' },
    { id: 'ctx-status', label: 'Check project status', prompt: 'Check the project status and report any issues.', category: 'context' },
    { id: 'ctx-architecture', label: 'Explain architecture', prompt: 'Explain the main architecture of this project.', category: 'context' },
  ];

  return {
    contextCard,
    contextual: fallbackContextual,
    quickActions: QUICK_ACTIONS,
    uxRecommendations,
  };
}
