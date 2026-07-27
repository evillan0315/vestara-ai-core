/**
 * MilestoneService — Provides milestone status for the Dashboard.
 *
 * Each milestone maps to a version and tracks its completion status.
 * When a milestone is completed, a domain event is emitted so the
 * Dashboard updates in real time.
 */

import type { EventBus } from '@vestara/event-bus';

export type MilestoneStatus = 'pending' | 'in_progress' | 'completed';

export interface Milestone {
  version: string;
  name: string;
  era: string;
  status: MilestoneStatus;
  description: string;
  completedAt?: string;
}

const MILESTONES: Milestone[] = [
  // Architecture Era
  {
    version: 'v0.1.0',
    name: 'Bootable Runtime',
    era: 'Architecture',
    status: 'completed',
    description: 'Kernel boots, loads config, initializes services, shuts down gracefully',
  },
  {
    version: 'v0.2.0',
    name: 'Executive Brain',
    era: 'Architecture',
    status: 'completed',
    description: 'Conversations, streaming, tools, persistence',
  },
  // Product Era
  {
    version: 'v0.3.0',
    name: 'Repository Comprehension',
    era: 'Product',
    status: 'completed',
    description: 'Open any repository, understand it in minutes',
  },
  {
    version: 'v0.3.1',
    name: 'Repository Intelligence Expansion',
    era: 'Product',
    status: 'completed',
    description: 'Dependency graphs, layers, confidence scoring',
  },
  {
    version: 'v0.3.2',
    name: 'Incremental Workspace',
    era: 'Product',
    status: 'completed',
    description: 'Split fast/deferred pipeline, file watching',
  },
  {
    version: 'v0.3.3',
    name: 'Explain',
    era: 'Product',
    status: 'completed',
    description: 'Explain architecture, modules, data flows',
  },
  {
    version: 'v0.4',
    name: 'Planning',
    era: 'Product',
    status: 'completed',
    description: 'Plan lifecycle, SQLite storage, REPL',
  },
  {
    version: 'v0.5',
    name: 'Implementation',
    era: 'Product',
    status: 'completed',
    description: 'Change Set generation, filesystem apply',
  },
  {
    version: 'v0.6',
    name: 'Verification',
    era: 'Product',
    status: 'completed',
    description: '5 deterministic checks per change',
  },
  {
    version: 'v0.7',
    name: 'Collaboration',
    era: 'Product',
    status: 'completed',
    description: 'Review lifecycle, immutable approvals',
  },
  {
    version: 'v0.8',
    name: 'Agent Runtime',
    era: 'Product',
    status: 'completed',
    description: '4 built-in specialized agents',
  },
  {
    version: 'v0.9',
    name: 'Memory & Knowledge Graph',
    era: 'Product',
    status: 'completed',
    description: 'Persistent organizational memory',
  },
  {
    version: 'v1.0',
    name: 'Engineering Workspace',
    era: 'Product',
    status: 'completed',
    description: 'Session-driven multi-agent operating model',
  },
  { version: 'v1.1', name: 'Workspace UI', era: 'Product', status: 'completed', description: 'First graphical client' },
  {
    version: 'v1.2',
    name: 'Remote Agent Execution',
    era: 'Product',
    status: 'completed',
    description: 'In-process, subprocess, remote workers',
  },
  {
    version: 'v1.3',
    name: 'Multi-Repository Intelligence',
    era: 'Product',
    status: 'completed',
    description: 'Cross-repo search, knowledge graph',
  },
  {
    version: 'v1.4',
    name: 'Enterprise Organizations',
    era: 'Product',
    status: 'completed',
    description: 'RBAC, policies, audit',
  },
  {
    version: 'v1.5',
    name: 'Plugin Ecosystem',
    era: 'Product',
    status: 'completed',
    description: 'Controlled extensibility, hooks',
  },
  {
    version: 'v1.6',
    name: 'Cloud Execution',
    era: 'Product',
    status: 'completed',
    description: 'Job queues, remote workers',
  },
  {
    version: 'v2.0',
    name: 'AI OS Integration',
    era: 'Product',
    status: 'completed',
    description: 'Native OS capability, systemd',
  },
  {
    version: 'v2.1',
    name: 'Async Execution Engine',
    era: 'Product',
    status: 'completed',
    description: 'Job queue with cancellation',
  },
  {
    version: 'v2.2',
    name: 'Auto-Indexing',
    era: 'Product',
    status: 'completed',
    description: 'Automatic knowledge propagation',
  },
  {
    version: 'v2.3',
    name: 'Health Scoring',
    era: 'Product',
    status: 'completed',
    description: 'Composite repository health',
  },
  {
    version: 'v2.4',
    name: 'Predictive Engineering',
    era: 'Product',
    status: 'completed',
    description: 'Impact analysis before implementation',
  },
  {
    version: 'v2.7',
    name: 'Outcome Verification',
    era: 'Product',
    status: 'completed',
    description: 'Verify outcomes, not just outputs',
  },
  // Quality Era
  {
    version: 'v3.0',
    name: 'Quality Infrastructure',
    era: 'Quality',
    status: 'completed',
    description: '.gitignore, CI, linter, test coverage',
  },
  {
    version: 'v3.1',
    name: 'Codebase Cleanup',
    era: 'Quality',
    status: 'completed',
    description: 'Biome lint + format, pre-commit hooks',
  },
  {
    version: 'v3.2',
    name: 'Documentation Generation',
    era: 'Quality',
    status: 'completed',
    description: 'TypeDoc API reference, package catalog',
  },
  {
    version: 'v3.3',
    name: 'Pipeline Integration Tests',
    era: 'Quality',
    status: 'completed',
    description: 'Integration tests + benchmark baselines',
  },
  {
    version: 'v3.4',
    name: 'Repository Hygiene',
    era: 'Quality',
    status: 'completed',
    description: 'Issue templates, PR template, contributing guide',
  },
  {
    version: 'v3.5',
    name: 'AI-Powered Suggestions',
    era: 'Quality',
    status: 'completed',
    description: 'AI suggest command with fallback',
  },
  {
    version: 'v3.6',
    name: 'E2E Workflow Tests',
    era: 'Quality',
    status: 'completed',
    description: 'Full deterministic chain tested',
  },
  {
    version: 'v3.7',
    name: 'Knowledge Engine Performance',
    era: 'Quality',
    status: 'completed',
    description: 'Batch SQLite, indexing benchmarks',
  },
  // Conversational Era
  {
    version: 'v4.0',
    name: 'Conversational Onboarding',
    era: 'Conversational',
    status: 'in_progress',
    description: 'Person-first boot, voice interaction, UserProfile',
  },
  {
    version: 'v4.1',
    name: 'Conversation Platform Validation',
    era: 'Conversational',
    status: 'pending',
    description: 'Provider-independence verification',
  },
  // Operational Era
  {
    version: 'v5.0',
    name: 'Operational Baselines',
    era: 'Operational',
    status: 'completed',
    description: 'Performance baselines, regression gates',
  },
  {
    version: 'v5.1',
    name: 'Observability',
    era: 'Operational',
    status: 'completed',
    description: 'Health latency, vestara metrics',
  },
  {
    version: 'v5.2',
    name: 'Provider & Model Selection',
    era: 'Operational',
    status: 'completed',
    description: 'Config-driven provider switching',
  },
  {
    version: 'v5.3',
    name: 'Agent Workflow Orchestration',
    era: 'Operational',
    status: 'completed',
    description: 'Multi-agent sequential workflows',
  },
  // Dashboard Era
  {
    version: 'v6.0',
    name: 'Interactive Dashboard',
    era: 'Dashboard',
    status: 'completed',
    description: 'Agents & Suggestions UI',
  },
  {
    version: 'v6.1',
    name: 'In-Browser CLI Terminal',
    era: 'Dashboard',
    status: 'in_progress',
    description: 'xterm.js terminal in dashboard',
  },
  {
    version: 'v6.2',
    name: 'Chatbot Assistant Panel',
    era: 'Dashboard',
    status: 'completed',
    description: 'Conversational chat in dashboard',
  },
];

export class MilestoneService {
  readonly id = 'vestara-milestones';
  private eventBus?: EventBus;

  constructor(options?: { eventBus?: EventBus }) {
    this.eventBus = options?.eventBus;
  }

  list(): Milestone[] {
    return MILESTONES;
  }

  getByEra(): Record<string, Milestone[]> {
    const byEra: Record<string, Milestone[]> = {};
    for (const m of MILESTONES) {
      if (!byEra[m.era]) byEra[m.era] = [];
      byEra[m.era].push(m);
    }
    return byEra;
  }

  getCurrent(): Milestone | null {
    for (let i = MILESTONES.length - 1; i >= 0; i--) {
      if (MILESTONES[i].status !== 'completed') return MILESTONES[i];
    }
    return MILESTONES[MILESTONES.length - 1] ?? null;
  }

  getProgress(): { total: number; completed: number; inProgress: number; pending: number } {
    return {
      total: MILESTONES.length,
      completed: MILESTONES.filter((m) => m.status === 'completed').length,
      inProgress: MILESTONES.filter((m) => m.status === 'in_progress').length,
      pending: MILESTONES.filter((m) => m.status === 'pending').length,
    };
  }

  completeMilestone(version: string): Milestone | null {
    const m = MILESTONES.find((ms) => ms.version === version);
    if (!m || m.status === 'completed') return null;
    m.status = 'completed';
    m.completedAt = new Date().toISOString();

    this.eventBus?.emit({
      type: 'milestone:completed',
      source: 'milestone-service',
      payload: { version: m.version, name: m.name, era: m.era },
      metadata: { correlationId: `milestone-${version}` },
    });

    return m;
  }

  updateMilestone(
    version: string,
    data: { status?: MilestoneStatus; name?: string; description?: string },
  ): Milestone | null {
    const m = MILESTONES.find((ms) => ms.version === version);
    if (!m) return null;
    if (data.status) m.status = data.status;
    if (data.name) m.name = data.name;
    if (data.description !== undefined) m.description = data.description;
    if (data.status === 'completed' && !m.completedAt) m.completedAt = new Date().toISOString();
    return m;
  }

  addMilestone(data: {
    version: string;
    name: string;
    era?: string;
    description?: string;
    status?: MilestoneStatus;
  }): Milestone {
    const milestone: Milestone = {
      version: data.version,
      name: data.name,
      era: data.era || 'Feature Requests',
      status: data.status || 'pending',
      description: data.description || '',
    };
    MILESTONES.push(milestone);
    return milestone;
  }
}
