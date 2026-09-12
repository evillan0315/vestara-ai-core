/**
 * VES-OVERVIEW-001: Overview Fixture Dataset
 *
 * Realistic v2 mock data mirroring assets/vestara-overview-02-screen.png.
 * Used as fallback when domain APIs return empty so the premium layout
 * never renders hollow in dev / visual regression.
 *
 * Architecture Traceability:
 *   VES-OVERVIEW-001: Vestara Overview (phases 0-2)
 *   @see docs/blueprint/VESTARA-OVERVIEW-SCREEN.md
 */

import type { OverviewViewModel } from './overview.types';

const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

export const overviewFixture: OverviewViewModel = {
  workspace: {
    name: 'vestara-platform',
    description: 'The core platform for agentic engineering.',
    lastActivity: iso(12),
    health: 'healthy',
  },
  continueWorking: [
    {
      id: 'vestara-platform',
      title: 'vestara-platform',
      type: 'repository',
      status: 'running',
      updatedAt: iso(120),
      branch: 'main',
      path: '~/projects/vestara/vestara-platform',
    },
    {
      id: 'vestara-api',
      title: 'vestara-api',
      type: 'repository',
      status: 'running',
      updatedAt: iso(240),
      branch: 'main',
      path: '~/projects/vestara/vestara-api',
    },
    {
      id: 'ui-component-system',
      title: 'UI Component System',
      type: 'repository',
      status: 'paused',
      updatedAt: iso(360),
      branch: 'feature/ui',
      path: '~/projects/vestara/modules/ui',
    },
    {
      id: 'theme-builder',
      title: 'Theme Builder',
      type: 'project',
      status: 'completed',
      updatedAt: iso(1440),
      branch: 'main',
      path: '~/projects/vestara/apps/theme-builder',
    },
  ],
  recentActivity: [
    {
      id: 'wf-run-001',
      actor: 'Orchestrator',
      action: 'Workflow run completed',
      target: '#WF-2026-09-07-001 · Theme Builder',
      timestamp: iso(12),
      kind: 'workflow',
      title: 'Workflow run completed',
      detail: '#WF-2026-09-07-001 · Theme Builder',
    },
    {
      id: 'files-002',
      actor: 'vestara-developer',
      action: 'Files updated',
      target: '3 files changed in vestara-platform',
      timestamp: iso(34),
      kind: 'file-change',
      title: 'Files updated',
      detail: '3 files changed in vestara-platform',
    },
    {
      id: 'agent-003',
      actor: 'vestara-developer',
      action: 'Agent session finished',
      target: 'Code and quality review',
      timestamp: iso(60),
      kind: 'agent-action',
      title: 'Agent session finished',
      detail: 'Code and quality review',
    },
    {
      id: 'issue-476',
      actor: 'vestara-planner',
      action: 'New issue created',
      target: '#476 · Improve Activity Room filtering',
      timestamp: iso(120),
      kind: 'issue',
      title: 'New issue created',
      detail: '#476 · Improve Activity Room filtering',
    },
    {
      id: 'module-005',
      actor: 'Marketplace',
      action: 'Module installed',
      target: 'Theme Builder v1.2.0',
      timestamp: iso(240),
      kind: 'module',
      title: 'Module installed',
      detail: 'Theme Builder v1.2.0',
    },
  ],
  agents: [
    { id: 'planner', name: 'vestara-planner', role: 'Planning and analysis', status: 'online', model: 'vestara-1' },
    { id: 'developer', name: 'vestara-developer', role: 'Development and implementation', status: 'busy', model: 'vestara-1' },
    { id: 'reviewer', name: 'vestara-reviewer', role: 'Code and quality review', status: 'idle', model: 'vestara-1' },
    { id: 'verifier', name: 'vestara-verifier', role: 'Testing and verification', status: 'online', model: 'vestara-1' },
    { id: 'ops', name: 'vestara-ops', role: 'Operations and monitoring', status: 'offline', model: 'vestara-1' },
  ],
  projects: [
    { id: 'platform', name: 'Vestara Platform', description: 'The core platform for agentic engineering.', health: 'healthy', lastActivity: iso(120), starred: true },
    { id: 'api', name: 'Vestara API', description: 'Backend services and integrations.', health: 'healthy', lastActivity: iso(240) },
    { id: 'ui', name: 'Workspace UI', description: 'Frontend workspace application.', health: 'healthy', lastActivity: iso(360) },
    { id: 'runtime', name: 'Agents & Runtime', description: 'Agent framework and runtime services.', health: 'degraded', lastActivity: iso(480) },
    { id: 'tools', name: 'Tools & Extensions', description: 'Productivity tools and integrations.', health: 'healthy', lastActivity: iso(600) },
  ],
  resources: {
    cpu: 18,
    memory: 62,
    disk: 35,
    network: 12,
    uptime: '6d 4h',
    activeSessions: 3,
    cpuDetail: '1.4 / 8 cores',
    memoryDetail: '4.9 / 8 GB',
    diskDetail: '82 / 238 GB',
    networkDetail: '12.4 MB/s up · 3.1 MB/s down',
  },
  marketplace: [
    { id: 'theme-builder', name: 'Theme Builder', category: 'Customization', description: 'Customize your workspace themes', installed: false, rating: 4.8, ratingCount: 120 },
    { id: 'git-helper', name: 'Git Helper', category: 'VCS', description: 'AI-powered Git workflow assistant', installed: false, rating: 4.6, ratingCount: 98 },
    { id: 'test-gen', name: 'Test Suite Generator', category: 'Testing', description: 'Generate comprehensive tests', installed: false, rating: 4.7, ratingCount: 86 },
  ],
  focus: [
    { id: 'f1', title: 'Complete workflow orchestration audit', reason: 'Due today', priority: 'high', completed: true },
    { id: 'f2', title: 'Implement Activity Room improvements', reason: 'Sprint goal', priority: 'medium', completed: false },
    { id: 'f3', title: 'Review PR #482', reason: 'Blocked teammate', priority: 'high', completed: false },
    { id: 'f4', title: 'Plan next milestone (ARX-015)', reason: 'Planning', priority: 'low', completed: false },
  ],
};
