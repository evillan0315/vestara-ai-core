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
    status: 'completed',
    description: 'Person-first boot, voice interaction, UserProfile',
  },
  {
    version: 'v4.1',
    name: 'Conversation Platform Validation',
    era: 'Conversational',
    status: 'completed',
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
    status: 'completed',
    description: 'xterm.js terminal in dashboard',
  },
  {
    version: 'v6.2',
    name: 'Chatbot Assistant Panel',
    era: 'Dashboard',
    status: 'completed',
    description: 'Conversational chat in dashboard',
  },
  {
    version: 'v6.3',
    name: 'Streaming Chat, Ops Detail & Data Export',
    era: 'Dashboard',
    status: 'completed',
    description: 'Streaming responses, agent details, section export',
  },
  {
    version: 'v6.4',
    name: 'Agent Filesystem & Multi-Agent Workflow',
    era: 'Dashboard',
    status: 'completed',
    description: 'Filesystem capabilities, workflow design, open repo distribution',
  },
  // v7.x — Dashboard Era (continued)
  {
    version: 'v7.0',
    name: 'Artifact Pipeline & Operational Dashboard',
    era: 'Dashboard',
    status: 'completed',
    description: 'Visual artifact chain, operational widgets, engineering state',
  },
  {
    version: 'v7.1',
    name: 'Theme System & Dashboard Customization',
    era: 'Dashboard',
    status: 'completed',
    description: 'Light/dark/system themes, section reordering, presets',
  },
  {
    version: 'v7.2',
    name: 'AI-Powered Implementation Recommendations',
    era: 'Dashboard',
    status: 'completed',
    description: 'Plan recommendations, feature analysis, agent assignment',
  },
  {
    version: 'v7.3',
    name: 'Workspace Analyst Agent',
    era: 'Dashboard',
    status: 'completed',
    description: 'Dedicated analysis agent with OpenCode integration',
  },
  {
    version: 'v7.4',
    name: 'Build Tools & Dev Server Access',
    era: 'Dashboard',
    status: 'completed',
    description: 'Build buttons, dev server launch from dashboard',
  },
  {
    version: 'v7.5',
    name: 'API Builder & Testing Console',
    era: 'Dashboard',
    status: 'completed',
    description: 'Interactive API explorer and testing console',
  },
  {
    version: 'v7.6',
    name: 'Notification Center & Alerting',
    era: 'Dashboard',
    status: 'completed',
    description: 'Persistent notifications, toast alerts, notification center UI',
  },
  {
    version: 'v7.7',
    name: 'Workspace UI Tester Automation',
    era: 'Dashboard',
    status: 'completed',
    description: 'Auto test+build on file changes, milestone triggers',
  },
  {
    version: 'v7.8',
    name: 'API Builder UI/UX Enhancement',
    era: 'Dashboard',
    status: 'completed',
    description: 'Live endpoints, history, env vars, code snippets, tabs',
  },
  {
    version: 'v7.9',
    name: 'Dashboard & Settings UI Consistency',
    era: 'Dashboard',
    status: 'completed',
    description: 'MUI to Tailwind migration, CSS variable fixes',
  },
  {
    version: 'v7.10',
    name: 'CLI/API Runtime Alignment',
    era: 'Dashboard',
    status: 'completed',
    description: 'Boot sequence, context pattern, lifecycle management',
  },
  {
    version: 'v7.11',
    name: 'Provider Registry & Local Provider Support',
    era: 'Dashboard',
    status: 'completed',
    description: 'Persistent provider registry, local provider support',
  },
  {
    version: 'GA-PROVIDER-001',
    name: 'Provider/Model Configuration Convergence',
    era: 'Dashboard',
    status: 'completed',
    description:
      'OpenCode /config/providers → Vestara config endpoints, API keys stripped, backward-compatible /api/providers',
  },
  {
    version: 'GA-DETACH-001',
    name: 'Execution Lifecycle Semantics',
    era: 'Dashboard',
    status: 'completed',
    description: 'SSE disconnect no longer cancels execution; TurnTermination tracking; deadline-aware event wait',
  },
  {
    version: 'GA-UX-001',
    name: 'Conversation Message Loading State',
    era: 'Dashboard',
    status: 'pending',
    description:
      'Explicit empty/loading/loaded/error distinction, contextual suggestion contract, presentation must not own recommendation intelligence',
  },
  {
    version: 'PERF-001B',
    name: 'Bounded Message Loading & Windowing',
    era: 'Dashboard',
    status: 'pending',
    description: 'Bounded message loading/windowing separate from UX state management',
  },
  {
    version: 'v7.12',
    name: 'Context-Aware Global Assistant Suggestions',
    era: 'Dashboard',
    status: 'pending',
    description: 'Route-sensitive assistant suggestions adapting to current page, section, and workspace health',
  },
  {
    version: 'v7.13',
    name: 'Premium Diagnostic Center',
    era: 'Dashboard',
    status: 'pending',
    description:
      'Luxury dark-chamber design with instrument-precision gauges, contextual intelligence, and @vestara/ui components',
  },
  {
    version: 'v7.14',
    name: 'Premium Marketplace Gallery',
    era: 'Dashboard',
    status: 'pending',
    description:
      'Curated luxury gallery for engineering capabilities with holographic cards, glass-morphism panels, and progressive revelation UX',
  },
  {
    version: 'GA-TERM-001',
    name: 'Assistant Terminal Mode',
    era: 'Dashboard',
    status: 'pending',
    description:
      'Floating assistant doubles as a governed terminal: explicit $ shell mode in the composer over the existing bash tool path, terminal-grade output surface, Activity Room audit; true interactive pty deferred',
  },
  // Quality Era (late)
  {
    version: 'v3.8',
    name: 'Development Lifecycle & Governance',
    era: 'Quality',
    status: 'completed',
    description: 'Specialized agents, daily lifecycle, knowledge system',
  },
  // Conversational Era (late)
  {
    version: 'v4.2',
    name: 'Project Management & Dashboard Intelligence',
    era: 'Conversational',
    status: 'completed',
    description: 'Projects, sprints, dashboard intelligence, global search',
  },
  {
    version: 'v4.3',
    name: 'Agent Orchestration & Teams',
    era: 'Conversational',
    status: 'completed',
    description: 'Multi-agent OS, teams, provider-per-agent config',
  },
  {
    version: 'v4.4',
    name: 'Agent Scheduling & Automation',
    era: 'Conversational',
    status: 'completed',
    description: 'Configurable agent schedules, automatic execution',
  },
  {
    version: 'v4.5',
    name: 'Conversation Audit & System Status',
    era: 'Conversational',
    status: 'completed',
    description: 'Feature auditing, comprehensive system status',
  },
  {
    version: 'v4.6',
    name: 'AI Operations Center & Settings',
    era: 'Conversational',
    status: 'completed',
    description: 'Live agent monitoring, provider/model config UI',
  },
  {
    version: 'v4.7',
    name: 'Agent Service, Capabilities & Teams',
    era: 'Conversational',
    status: 'completed',
    description: 'Capability management, permission validation, team sync',
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
  {
    version: 'v5.4',
    name: 'Multi-Agent Workflow Orchestration Core',
    era: 'Operational',
    status: 'in_progress',
    description: 'WorkflowOrchestrator, state machines, durable harness',
  },
  // Collaboration Era
  {
    version: 'v8.0',
    name: 'Multi-User Collaboration',
    era: 'Collaboration',
    status: 'in_progress',
    description: 'Auth, RBAC, role enforcement, shared workspace',
  },
  {
    version: 'v8.1',
    name: 'Advanced Project Management',
    era: 'Collaboration',
    status: 'pending',
    description: 'Kanban, Gantt, time tracking, resource allocation',
  },
  {
    version: 'v8.2',
    name: 'AI-Assisted Development Workflows',
    era: 'Collaboration',
    status: 'pending',
    description: 'Guided workflows, AI suggestions, smart defaults',
  },
  // Enterprise Era
  {
    version: 'v9.0',
    name: 'Enterprise Scale',
    era: 'Enterprise',
    status: 'pending',
    description: 'Multi-workspace, SSO, compliance reporting',
  },
  {
    version: 'v9.1',
    name: 'Plugin Ecosystem v2',
    era: 'Enterprise',
    status: 'pending',
    description: 'Registry, sandboxed execution, developer SDK',
  },
  {
    version: 'v9.2',
    name: 'Mobile & API-First Access',
    era: 'Enterprise',
    status: 'pending',
    description: 'Mobile UI, REST API, webhooks, offline support',
  },
  // AI-Native Era
  {
    version: 'v10.0',
    name: 'AI-Native Development Platform',
    era: 'AI-Native',
    status: 'pending',
    description: 'Autonomous agent teams, AI code review, self-documenting',
  },
  {
    version: 'v10.1',
    name: 'Universal Protocol & Interoperability',
    era: 'AI-Native',
    status: 'pending',
    description: 'Cross-platform agent communication, standard formats',
  },
  // Activity Room Milestones
  {
    version: 'AR-UI',
    name: 'Activity Room Production UX',
    era: 'Activity Room',
    status: 'completed',
    description: 'Production team experience, 21 phases, 5 batches',
  },
  {
    version: 'AR-REC',
    name: 'Recommendations & Governed Decisions',
    era: 'Activity Room',
    status: 'completed',
    description: 'Contextual recommendations, governed decisions, 14 phases',
  },
  {
    version: 'v7.15',
    name: 'Activity Room Premium UX',
    era: 'Activity Room',
    status: 'pending',
    description: 'Three-column premium operations layout, 8 phases',
  },
  // CI Observation & Verification
  {
    version: 'CI-OBS-001',
    name: 'GitHub CI Observation & Verification',
    era: 'CI',
    status: 'pending',
    description:
      'Observation, evidence and review of GitHub CI — associate commits with CI runs, observe checks, retrieve failure evidence, classify findings, expose verification state to Vestara',
  },
  // OS Boot Experience
  {
    version: 'VOS-BOOT-001',
    name: 'Unified Boot Experience',
    era: 'OS',
    status: 'pending',
    description: 'GRUB to Plymouth to systemd to desktop',
  },
  // Vestara Live OS Program — governed, reproducible Debian-based Vestara image
  {
    version: 'VOS-LIVE-001',
    name: 'Vestara Live OS Production Foundation',
    era: 'OS',
    status: 'pending',
    description:
      'Reproducible Vestara system image on Debian; Debian owns OS mechanics, Vestara owns product semantics; Live/Persistent/Installed/Recovery modes (20 milestones A–T, 7 phases)',
  },
  {
    version: 'VOS-LIVE-001A',
    name: 'Current-State & Ownership Audit',
    era: 'OS',
    status: 'pending',
    description:
      'Zero-mutation audit of OS image builder, system/firmware platform, boot, persistence, identity, diagnostics, networking, recovery, hardware discovery; KEEP/ADAPT/REBUILD/REMOVE/MISSING/EXTERNAL; establish authority; STOP at decision packet',
  },
  {
    version: 'VOS-LIVE-001B',
    name: 'Live OS Product Contract',
    era: 'OS',
    status: 'pending',
    description:
      'VestaraLiveImage contract, amd64 target, UEFI/GRUB/read-only base/persistence/recovery boot requirements',
  },
  {
    version: 'VOS-LIVE-001C',
    name: 'Image Definition',
    era: 'OS',
    status: 'pending',
    description: 'Declarative image profile (vestara-desktop-amd64) as a governed contract, not a giant Bash script',
  },
  {
    version: 'VOS-LIVE-001D',
    name: 'Reproducible Image Builder',
    era: 'OS',
    status: 'pending',
    description:
      'Profile → packages → filesystem → config → runtime → branding → boot → image; emits manifest, packages.lock, checksums, build-evidence',
  },
  {
    version: 'VOS-LIVE-001E',
    name: 'Boot Architecture',
    era: 'OS',
    status: 'pending',
    description:
      'Explicit firmware→GRUB→boot profile→kernel→systemd ownership; Vestara configures GRUB, does not become a bootloader',
  },
  {
    version: 'VOS-LIVE-001F',
    name: 'Persistent Storage',
    era: 'OS',
    status: 'pending',
    description:
      'Immutable system image + writable Vestara state + user workspace separation; enables factory reset and rollback',
  },
  {
    version: 'VOS-LIVE-001G',
    name: 'Vestara System Runtime',
    era: 'OS',
    status: 'pending',
    description:
      'vestara-system.target with discrete config/identity/runtime/api/workspace services; no single giant vestara.service',
  },
  {
    version: 'VOS-LIVE-001H',
    name: 'Identity & Session',
    era: 'OS',
    status: 'pending',
    description:
      'Linux user → OS identity adapter → Vestara Principal; Identity ≠ Authority; privileged broker boundary',
  },
  {
    version: 'VOS-LIVE-001I',
    name: 'Startup Experience',
    era: 'OS',
    status: 'pending',
    description:
      'Health-based, dependency-aware startup with structured diagnostics codes; offline/local operation possible',
  },
  {
    version: 'VOS-LIVE-001J',
    name: 'Desktop Integration',
    era: 'OS',
    status: 'pending',
    description:
      'Debian + XFCE + Vestara Workspace shell; Vestara modules surface as applications, not hardwired OS components',
  },
  {
    version: 'VOS-LIVE-001K',
    name: 'Networking',
    era: 'OS',
    status: 'pending',
    description: 'NetworkManager mechanics with Vestara configuration/presentation adapter; no custom network stack',
  },
  {
    version: 'VOS-LIVE-001L',
    name: 'Security',
    era: 'OS',
    status: 'pending',
    description:
      'Non-root desktop, least-privilege services, firewall defaults, secret isolation, signed artifacts; Secure Boot/TPM later',
  },
  {
    version: 'VOS-LIVE-001M',
    name: 'Recovery',
    era: 'OS',
    status: 'pending',
    description:
      'Recovery must not depend on a healthy normal runtime; repair boot, inspect logs, reset config, restore image, factory reset',
  },
  {
    version: 'VOS-LIVE-001N',
    name: 'Update System',
    era: 'OS',
    status: 'pending',
    description:
      'Separate Debian package, Vestara platform, application, and image update authorities; no autonomous critical OS upgrades',
  },
  {
    version: 'VOS-LIVE-001O',
    name: 'Hardware Discovery',
    era: 'OS',
    status: 'pending',
    description:
      'Normalize CPU/memory/storage/GPU/network/firmware/TPM/display into system inventory feeding capability graph and resource policy',
  },
  {
    version: 'VOS-LIVE-001P',
    name: 'Diagnostics',
    era: 'OS',
    status: 'pending',
    description:
      'Boot/runtime diagnostics converge into normalized findings + evidence + recommendation; observation ≠ mutation authority',
  },
  {
    version: 'VOS-LIVE-001Q',
    name: 'Image Verification',
    era: 'OS',
    status: 'pending',
    description: 'V0–V8 verification levels; VM-first (QEMU/KVM) before physical writes; build ≠ test ≠ verification',
  },
  {
    version: 'VOS-LIVE-001R',
    name: 'Hardware Compatibility',
    era: 'OS',
    status: 'pending',
    description:
      'Compatibility matrix (boot, keyboard, Wi-Fi, GPU, audio, persistence, suspend, recovery) turning hardware issues into evidence',
  },
  {
    version: 'VOS-LIVE-001S',
    name: 'Dogfood',
    era: 'OS',
    status: 'pending',
    description:
      'VM → USB → portable SSD → daily boot → daily development; can Vestara be developed from Vestara Live OS?',
  },
  {
    version: 'VOS-LIVE-001T',
    name: 'Release Pipeline',
    era: 'OS',
    status: 'pending',
    description:
      'Commit → build → static verification → VM boot → runtime health → desktop smoke → signing → release candidate → hardware qualification',
  },
  // Shared UI Platform
  {
    version: 'VES-UI-001',
    name: 'Shared UI Platform',
    era: 'UI Platform',
    status: 'pending',
    description: 'Reusable UI SDK, 23 milestones, 6 batches',
  },
  // Overview Screen
  {
    version: 'VES-OVERVIEW-001',
    name: 'Overview Screen',
    era: 'UI Platform',
    status: 'completed',
    description: 'Premium responsive workspace overview',
  },
  // Marketplace Era — Vestara Interactive Results
  {
    version: 'SRX-001',
    name: 'Architecture & Ownership Audit',
    era: 'Marketplace',
    status: 'pending',
    description:
      'Audit current Assistant response/result/rendering, Marketplace extension contracts/runtime, permissions, Activity Room projection, UI extension points — zero mutation',
  },
  {
    version: 'SRX-002',
    name: 'Structured Result Contracts',
    era: 'Marketplace',
    status: 'pending',
    description:
      'Provider/UI-independent StructuredAssistantResult, sections, findings, recommendations, evidence, provenance, SuggestedAction in @vestara/assistant-result-contracts (Layer-0)',
  },
  {
    version: 'SRX-003',
    name: 'Global Assistant Extension Port',
    era: 'Marketplace',
    status: 'pending',
    description:
      'Generic result extension interface and lifecycle; Assistant behaves identically when no extension exists',
  },
  {
    version: 'SRX-004',
    name: 'Marketplace Package',
    era: 'Marketplace',
    status: 'pending',
    description:
      '@vestara/ext-structured-results with manifest, dependencies, capabilities, install/uninstall/enable/disable lifecycle',
  },
  {
    version: 'SRX-005',
    name: 'Native Structured Results',
    era: 'Marketplace',
    status: 'pending',
    description: 'Compatible Assistant execution produces structured results without Markdown interpretation',
  },
  {
    version: 'SRX-006',
    name: 'Result Interpreter',
    era: 'Marketplace',
    status: 'pending',
    description:
      'Transform ordinary Markdown responses into structured projections with confidence scoring, provenance, and UNKNOWN fallback',
  },
  {
    version: 'SRX-007',
    name: 'Interactive Renderer',
    era: 'Marketplace',
    status: 'pending',
    description:
      'Result header, summary, findings, recommendations, evidence, collapsed tool activity, technical details, raw-response fallback — all using canonical Vestara tokens',
  },
  {
    version: 'SRX-008',
    name: 'Governed Suggested Actions',
    era: 'Marketplace',
    status: 'pending',
    description: 'Action buttons generate user intent/new turns; cannot directly invoke tools or bypass permissions',
  },
  {
    version: 'SRX-009',
    name: 'Entitlements & Premium Packaging',
    era: 'Marketplace',
    status: 'pending',
    description: 'Marketplace entitlement capability without hardcoding subscription logic into Global Assistant',
  },
  {
    version: 'SRX-010',
    name: 'Dogfood & Freeze',
    era: 'Marketplace',
    status: 'pending',
    description:
      'Primary acceptance: "Review token usage" scenario; test all result types, extension disabled/uninstalled, malformed output, interpretation failure, permission denial',
  },
  // Identity Era — Vestara User & Identity Management (Proposed/Parked; no implementation authorized)
  {
    version: 'UIM-001',
    name: 'Cross-Platform Identity & User Ownership Audit',
    era: 'Identity',
    status: 'pending',
    description:
      'Zero-mutation audit of User/Human/Principal/Identity/ExternalIdentity/Session/Surface/WorkspaceMember/Role/Permission/Participant/Actor + OAuth seams; ownership matrix + KEEP/ADAPT/REBUILD/RETIRE; legacy AccountSettings Users CRUD classified, not canonical, not remediated',
  },
  {
    version: 'UIM-002',
    name: 'Canonical Human Principal & User Contracts',
    era: 'Identity',
    status: 'pending',
    description:
      'HumanPrincipal, UserProfile, UserStatus, IdentityReference + invited/active/suspended/disabled/deleted lifecycle encoding Human → Principal → ExternalIdentity[]; provider-neutral, no GoogleUser/GitHubUser core types; no duplication of Principal ownership',
  },
  {
    version: 'UIM-003',
    name: 'External Identity & Account Linking',
    era: 'Identity',
    status: 'pending',
    description:
      'Provider-neutral ExternalIdentity runtime (provider → adapter → ExternalIdentity → Principal; 003a) + Google OIDC/GitHub OAuth adapters at boundary only (003b; Telegram is surface, not OAuth adapter) + governed link/unlink/collision/revocation/recovery (003c; email/username ≠ proof; unlink ≠ delete; revocation ≠ auto-delete; UNKNOWN on ambiguity)',
  },
  {
    version: 'UIM-004',
    name: 'Surface / Client Identity Separation',
    era: 'Identity',
    status: 'pending',
    description:
      'Canonical surface representation; HumanPrincipal via Surface, never Surface = principal; Surface Identity ≠ Authentication Identity; Telegram as participation surface; surface informs context, grants no authority',
  },
  {
    version: 'UIM-005',
    name: 'Workspace Membership',
    era: 'Identity',
    status: 'pending',
    description:
      'Canonical WorkspaceMembership with invitation/acceptance/suspension/removal + historical representation; membership is not permission authority and is never inferred from OAuth provider identity',
  },
  {
    version: 'UIM-006',
    name: 'Roles & Permission Assignment',
    era: 'Identity',
    status: 'pending',
    description:
      'Role assignment integrated with existing authorization contracts and never derived from OAuth provider claims; policy evaluation authoritative; no role-equals-admin hard-coding',
  },
  {
    version: 'UIM-007',
    name: 'Session & Device Management',
    era: 'Identity',
    status: 'pending',
    description:
      'Session visibility, metadata, revoke-one/revoke-others, expiry, suspicious-session representation; provider-revocation vs session-revocation distinguished with explicit consequences; never expose credentials',
  },
  {
    version: 'UIM-008',
    name: 'User Administration Service/API',
    era: 'Identity',
    status: 'pending',
    description:
      'Governed user-management operations reusing Auth/Principal/Session/Permission authorities; link/unlink/collision/revocation as authorized auditable mutations; every mutation authorized and auditable',
  },
  {
    version: 'UIM-009',
    name: 'User Management UI',
    era: 'Identity',
    status: 'pending',
    description:
      'Directory/Invitations/Access-Security + User Detail surfacing linked ExternalIdentities and collision/revocation/recovery states via design system tokens; zero hardcode',
  },
  {
    version: 'UIM-010',
    name: 'Activity Room Identity Convergence',
    era: 'Identity',
    status: 'pending',
    description:
      'One principal across surfaces in projection with OAuth-linked identities shown truthfully; provenance inspectable; legacy records classified, never rewritten; coordinates with existing convergence work',
  },
  {
    version: 'UIM-011',
    name: 'Global Assistant User Context',
    era: 'Identity',
    status: 'pending',
    description:
      'Assistant consumes principal/workspace/surface context; identity/surface/conversation/execution/authority stay distinct; context never grants permissions',
  },
  {
    version: 'UIM-012',
    name: 'Audit & Security History',
    era: 'Identity',
    status: 'pending',
    description:
      'Inspectable sign-in/linking/unlinking/collision/revocation/membership/role/admin/suspension history with recovery events first-class; observed vs claimed vs verified distinguished',
  },
  {
    version: 'UIM-013',
    name: 'Invitations & Onboarding Integration',
    era: 'Identity',
    status: 'pending',
    description: 'Invitation to ready flow integrated with Vestara onboarding; no second onboarding authority',
  },
  {
    version: 'UIM-014',
    name: 'Multi-Surface Dogfood',
    era: 'Identity',
    status: 'pending',
    description:
      'One human via Workspace UI + Telegram (+ governed Google/GitHub-linked sign-in), one canonical identity; full attribution/provenance/permission/history verification',
  },
  {
    version: 'UIM-015',
    name: 'Multi-User Dogfood',
    era: 'Identity',
    status: 'pending',
    description:
      'Second controlled human; isolation, roles, permission differences, attribution, admin boundaries; proves beyond Customer #1',
  },
  {
    version: 'UIM-016',
    name: 'Verification, Evidence & Freeze',
    era: 'Identity',
    status: 'pending',
    description:
      'Full architecture/contract/security/authorization/API/persistence/UI/integration verification with adapters adapter-contained and core provider-neutral; freeze only on dogfood evidence',
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
      // ARX-015 M2: milestone-version is not an execution identity — correlation absent (fail-closed)
      metadata: {},
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
