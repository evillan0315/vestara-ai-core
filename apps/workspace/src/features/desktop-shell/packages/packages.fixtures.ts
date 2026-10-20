/**
 * VES-UI-001 T5: Package Fixture Datasets
 *
 * Deterministic fallback data for the four desktop-shell package pages
 * (Overview / Activity / Agents / Marketplace), promoted from the v2
 * prototype (`assets/templates/html/v2/start/workspace-ui-v2/src/packages/`).
 * Never inline this data in JSX — import the fixture.
 *
 * Data layer contract (plan §6): API first → this fixture. No mock server
 * (finding A1 — `apps/workspace/src/mocks/server.ts` does not exist).
 * Each package hook fetches its live source and falls back to the fixture
 * below when the API is unreachable or returns empty.
 *
 * Sanitized on promotion (plan G5/G7/G11):
 * - No ambient-random values (fixed counts, fixed timestamps offsets).
 * - No version strings (`112 FINAL` dropped).
 * - No hardcoded operator identity beyond shape placeholders.
 *
 * Architecture Traceability:
 *   VES-UI-001: Workspace UI v2 Desktop Shell (T5 Package pages + data)
 *   @see docs/plans/VES-UI-001-workspace-ui-v2-desktop-shell-plan.md §6
 */

export interface OverviewPackageStat {
  readonly id: string;
  readonly label: string;
  readonly value: string;
}

export interface ActivityPackageParticipant {
  readonly id: string;
  readonly displayName: string;
  readonly status: string;
}

export interface ActivityPackageRecord {
  readonly id: string;
  readonly actor: string;
  readonly message: string;
  readonly timestamp: string;
}

export interface AgentsPackageAgent {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly status: string;
  readonly model: string;
}

export interface MarketplacePackageItem {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly description: string;
  readonly installed: boolean;
}

/** VES-UI-001 T6: terminal transcript line (fixture fallback for the live surface). */
export interface TerminalPackageLine {
  readonly id: string;
  readonly kind: 'input' | 'output' | 'status';
  readonly text: string;
}

export interface TerminalPackageSession {
  readonly id: string;
  readonly name: string;
  readonly shell: string;
  readonly cwd: string;
}

/** VES-UI-001 T6: settings category rail (prototype `Settings.tsx` order). */
export interface SettingsPackageCategory {
  readonly id: string;
  readonly label: string;
}

/** VES-UI-001 T6: deterministic diagnostic summary fallback. */
export interface DiagnosticPackageSummary {
  readonly cpuUsage: number;
  readonly memoryUsedGB: number;
  readonly memoryTotalGB: number;
  readonly readiness: number;
  readonly checks: readonly { readonly id: string; readonly name: string; readonly status: string }[];
}

/** Overview hero + stat cards (prototype `Overview.tsx` order). */
export const overviewPackageFixture: {
  readonly heading: string;
  readonly subheading: string;
  readonly healthLabel: string;
  readonly stats: readonly OverviewPackageStat[];
} = {
  heading: 'Workspace Overview',
  subheading: 'Vestara Platform · live workspace state with fixture fallback',
  healthLabel: 'HEALTHY',
  stats: [
    { id: 'workspace', label: 'WORKSPACE', value: 'vestara-platform' },
    { id: 'health', label: 'HEALTH', value: 'Healthy' },
    { id: 'focus', label: 'FOCUS', value: '25%' },
    { id: 'agents', label: 'AGENTS', value: '5 online' },
  ],
};

/** Activity Room participant rail + live stream (prototype `ActivityRoom.tsx` order). */
export const activityPackageFixture: {
  readonly participants: readonly ActivityPackageParticipant[];
  readonly records: readonly ActivityPackageRecord[];
} = {
  participants: [
    { id: 'assistant', displayName: 'Assistant', status: 'Idle' },
    { id: 'browser', displayName: 'Browser', status: 'Active' },
    { id: 'orchestrator', displayName: 'Orchestrator', status: 'Working' },
    { id: 'indexer', displayName: 'Indexer', status: 'Idle' },
    { id: 'runtime', displayName: 'Runtime', status: 'Active' },
    { id: 'context', displayName: 'Context', status: 'Idle' },
  ],
  records: [
    { id: 'rec-001', actor: 'Orchestrator', message: 'TaskNode Shell 7 completed', timestamp: 'now' },
    { id: 'rec-002', actor: 'Assistant', message: 'VestaraWindow drag shell extracted', timestamp: '2m' },
    { id: 'rec-003', actor: 'Indexer', message: 'Teal logo bound to wallpaper', timestamp: '5m' },
  ],
};

/** Agent workforce grid (prototype `AgentWorkforce.tsx` order). */
export const agentsPackageFixture: readonly AgentsPackageAgent[] = [
  { id: 'assistant', name: 'Assistant', role: 'Conversation and execution', status: 'online', model: 'vestara-1' },
  { id: 'browser', name: 'Browser', role: 'Web operations', status: 'online', model: 'vestara-1' },
  { id: 'context', name: 'Context', role: 'Workspace intelligence', status: 'idle', model: 'vestara-1' },
  { id: 'orchestrator', name: 'Orchestrator', role: 'Workflow coordination', status: 'busy', model: 'vestara-1' },
  { id: 'terminal', name: 'Terminal', role: 'Shell sessions', status: 'online', model: 'vestara-1' },
  { id: 'indexer', name: 'Indexer', role: 'Knowledge indexing', status: 'idle', model: 'vestara-1' },
];

/** Marketplace capability cards (prototype `Marketplace.tsx` order). */
export const marketplacePackageFixture: readonly MarketplacePackageItem[] = [
  {
    id: 'theme-builder',
    name: 'Theme Builder',
    category: 'Customization',
    description: 'Customize workspace themes from governed tokens',
    installed: false,
  },
  {
    id: 'git-helper',
    name: 'Git Helper',
    category: 'VCS',
    description: 'AI-powered Git workflow assistant',
    installed: false,
  },
  {
    id: 'test-gen',
    name: 'Test Suite Generator',
    category: 'Testing',
    description: 'Generate comprehensive tests from source',
    installed: false,
  },
  {
    id: 'capability-card',
    name: 'Capability Card',
    category: 'UI',
    description: 'Governed capability presentation primitive',
    installed: true,
  },
  {
    id: 'search-input',
    name: 'Search Input',
    category: 'UI',
    description: 'Token-bound search field for the marketplace',
    installed: true,
  },
  {
    id: 'auth-shell',
    name: 'Auth Shell',
    category: 'Platform',
    description: 'Session-gated installation and updates',
    installed: true,
  },
];

/**
 * VES-UI-001 T6: terminal fallback dataset.
 *
 * The live surface streams `POST /api/terminal/sessions` + `/ws/terminal`;
 * this transcript is the offline snapshot only (prototype `Terminal.tsx`
 * lines, sanitized: version-free per G11, deterministic per G7).
 */
export const terminalPackageFixture: {
  readonly sessions: readonly TerminalPackageSession[];
  readonly transcript: readonly TerminalPackageLine[];
} = {
  sessions: [{ id: 'snapshot-shell', name: 'bash', shell: 'bash', cwd: 'vestara-platform' }],
  transcript: [
    { id: 't-cmd', kind: 'input', text: '$ vestara shell --clean --teal-logo --small-header' },
    { id: 't-1', kind: 'output', text: '[1/6] Shell 7 ready' },
    { id: 't-2', kind: 'output', text: '[2/6] Teal surface bound to wallpaper' },
    { id: 't-3', kind: 'output', text: '[3/6] VestaraWindow draggable shell extracted' },
    { id: 't-4', kind: 'output', text: '[4/6] Boot and login flow ready' },
    { id: 't-5', kind: 'output', text: '[5/6] Dock clean and desktop icons ready' },
    { id: 't-6', kind: 'output', text: '[6/6] Packages wired: live workspace surfaces' },
    { id: 't-done', kind: 'status', text: 'Build succeeded — workspace shell ready' },
  ],
};

/**
 * VES-UI-001 T6: settings category rail + panel copy.
 * Prototype `Settings.tsx` order; panels bind to the live server
 * configuration (`/api/settings`) and the theme provider — never literals.
 */
export const settingsPackageFixture: {
  readonly categories: readonly SettingsPackageCategory[];
  readonly topbarChips: readonly string[];
  readonly systemMenuRows: readonly string[];
} = {
  categories: [
    { id: 'appearance', label: 'Appearance' },
    { id: 'shell', label: 'Shell & TopBar' },
    { id: 'sidebar', label: 'Sidebar' },
    { id: 'workspace', label: 'Workspace' },
    { id: 'network', label: 'Network' },
    { id: 'runtime', label: 'Runtime' },
    { id: 'about', label: 'About' },
  ],
  topbarChips: ['Height 32px', 'Icons 12px', 'Clean hover surface'],
  systemMenuRows: [
    'Lockscreen goes to locked login',
    'Switch user goes to switch login',
    'Logout returns to default login',
    'Shutdown returns to boot',
  ],
};

/**
 * VES-UI-001 T6: deterministic diagnostic fallback.
 *
 * Telemetry bars are derived from `seededTelemetryBars` (seeded, plan G7); the summary mirrors `/api/diagnostics/summary` shape at a
 * reduced fidelity for the package window.
 */
export const DIAGNOSTIC_PACKAGE_SEED = 0xc0ffee;
export const DIAGNOSTIC_PACKAGE_BAR_COUNT = 32;

export const diagnosticPackageFixture: {
  readonly seed: number;
  readonly barCount: number;
  readonly summary: DiagnosticPackageSummary;
} = {
  seed: DIAGNOSTIC_PACKAGE_SEED,
  barCount: DIAGNOSTIC_PACKAGE_BAR_COUNT,
  summary: {
    cpuUsage: 24,
    memoryUsedGB: 6.1,
    memoryTotalGB: 16,
    readiness: 92,
    checks: [
      { id: 'api', name: 'API gateway', status: 'pass' },
      { id: 'workspace', name: 'Workspace store', status: 'pass' },
      { id: 'terminal', name: 'Terminal runtime', status: 'warn' },
    ],
  },
};
