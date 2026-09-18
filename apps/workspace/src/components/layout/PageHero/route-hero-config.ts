/**
 * Centralized PageHero defaults per shell route.
 *
 * Each entry provides the static hero configuration for a route.
 * Pages merge dynamic data (stats, actions, meta, etc.) at render time
 * via `RouteHero` overrides — only the dynamic props need to appear in
 * consumer code.
 *
 * Ownership: apps/workspace (shared layout presentation)
 * Authority: None — pure presentation, no domain behavior.
 */

import type { PageHeroProps } from '@vestara/ui';

export interface RouteHeroConfig extends PageHeroProps {}

/**
 * Route ID → default PageHero props.
 *
 * Keys match APP_ROUTES ids (routes.ts). Pages that render a hero
 * against a specific route should look up this registry; overrides
 * are applied on top at render time.
 */
export const ROUTE_HERO_CONFIG: Record<string, RouteHeroConfig> = {
  // ── Minimal pattern ──────────────────────────────────────────
  files: {
    eyebrow: 'Workspace',
    title: 'Files',
    subtitle: 'Filesystem capability operations — every read, write, and search agents perform.',
    label: 'Files highlights',
  },

  graph: {
    eyebrow: 'Navigation layer',
    title: 'Engineering Graph',
    subtitle: 'Entities, relationships, and health — the canonical map of the workspace.',
    label: 'Engineering graph highlights',
  },

  // ── Stats + checklist pattern ────────────────────────────────
  routing: {
    eyebrow: 'AI OS',
    title: 'Engineering Routing',
    subtitle: 'Select routing intent; the runtime validates and records the effective assignment.',
    checklistTitle: 'Active selection',
    checklistLabel: 'Active routing selection',
    label: 'Engineering routing highlights',
  },

  // ── Full overview grammar pattern ────────────────────────────
  overview: {
    eyebrow: 'Welcome to Vestara',
    title: 'Build Without Limits',
    subtitle: 'Agents. Workflows. Tools. A more capable you.',
    quote: '"Ideas organize. Work happens. Progress compounds." — Vestara',
    checklistTitle: 'A more capable tomorrow',
    checklist: ['◇ Turn ideas into production', '◇ Orchestrate with AI agents', '◇ Build a more capable you'],
    checklistLabel: 'Why extend',
    label: 'Workspace highlights',
  },

  orchestration: {
    eyebrow: 'Automation',
    title: 'Workflows',
    subtitle: 'Multi-agent projects · task waves · approval gateway.',
    quote: '"Plans become waves. Waves become done." — Vestara',
    checklistTitle: 'Pipeline',
    checklist: ['◇ Create → analyze → plan', '◇ Architecture → approve', '◇ Execute waves to done'],
    checklistLabel: 'How it flows',
    label: 'Workflows highlights',
  },

  settings: {
    eyebrow: 'Workspace Configuration',
    title: 'Settings',
    subtitle: 'Configure how Vestara looks, operates, executes and interacts with your workspace.',
    quote: '"A workspace shaped for the way you work." — Vestara',
    checklistTitle: 'Your workspace, your rules',
    checklist: ['✦ Fine-tune behavior', '✦ Connect your tools', '✦ Control safety & execution', '✦ Make it yours'],
    checklistLabel: 'Workspace guidance',
    label: 'Settings highlights',
  },

  diagnostics: {
    eyebrow: 'Live telemetry',
    title: 'Diagnostic Center',
    subtitle: 'System health, processes, and signals — instrument-grade, at a glance.',
    checklistTitle: 'Signal snapshot',
    checklistLabel: 'Signal snapshot',
    label: 'Diagnostics highlights',
  },

  dashboard: {
    eyebrow: 'Workspace',
    title: 'Dashboard',
    label: 'Dashboard highlights',
  },

  agents: {
    eyebrow: 'Workforce',
    title: 'Agent Control Center',
    label: 'Agent control highlights',
  },

  // ── Compact side-meta pattern ────────────────────────────────
  projects: {
    eyebrow: 'Workspace',
    title: 'Projects',
    subtitle: 'Track projects, sprints, and tasks across your workspace.',
    metaPosition: 'side',
    density: 'compact',
    label: 'Projects highlights',
  },

  execution: {
    eyebrow: 'Live operations',
    title: 'Execution Center',
    subtitle: 'Plans, agents, and runs — live operational command.',
    metaPosition: 'side',
    density: 'compact',
    label: 'Execution highlights',
  },

  activity: {
    eyebrow: 'Live operations',
    title: 'Activity Room',
    subtitle: 'Observe agents, workflows and execution across your workspace.',
    metaPosition: 'side',
    density: 'compact',
    label: 'Activity Room highlights',
  },

  'opencode-sessions': {
    eyebrow: 'OpenCode runtime',
    title: 'OpenCode Sessions',
    subtitle: 'Governed engineering sessions managed through Vestara.',
    metaPosition: 'side',
    density: 'compact',
    label: 'OpenCode session highlights',
  },

  // ── Unique pattern (titleAs h2) ─────────────────────────────
  marketplace: {
    title: 'Build More with Vestara',
    titleAs: 'h2',
    subtitle: 'Discover agents, skills, themes, and tools to extend your workspace.',
    checklistTitle: 'Why extend',
    checklistLabel: 'Why extend',
    label: 'Marketplace highlights',
  },
};
