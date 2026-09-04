/**
 * Boots kernel + workspace and opens SQLite stores used by product services.
 * Thin adapter — no product policy beyond wiring.
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AgentMessageActivity } from '@vestara/activity-room';
import { AgentHarnessRuntime, type HarnessContextAssembler, type HarnessVerifier } from '@vestara/agent-harness';
import { BootRuntime, FileBootStateStore } from '@vestara/boot-runtime';
import { WorkspaceConfigurationService } from '@vestara/configuration';
import { DefaultContextAssembler } from '@vestara/context';
import { type ConversationService, DefaultConversationService, type ProviderExecutor } from '@vestara/conversation';
import { SqliteConversationSessionStore, SqliteConversationStore } from '@vestara/conversation-runtime';
import { type DocumentationRepositoryConfig, DocumentationService } from '@vestara/documentation';
import {
  ContentAddressedEvidenceStore,
  DurableThreadRecoveryService,
  ImmutableEvidenceManifestStore,
  importThreadHistory,
  reconcileInterruptedThreads,
  SqliteEngineeringEventStore,
} from '@vestara/engineering-event-store';
import type { EventBus } from '@vestara/event-bus';
import type { WorkspaceEvent as UiEvent } from '@vestara/events';
import {
  BaselineStore,
  BundleStore,
  EvidencePipeline,
  FilesystemChangeCollector,
  SourceDiffCollector,
  ThumbnailService,
  VisualEvidenceCollector,
} from '@vestara/evidence';
import { type ExtensionPermissionApprover, LocalExtensionManager } from '@vestara/extension-runtime';
import { FilesystemRuntime } from '@vestara/filesystem-runtime';
import { HostRuntime } from '@vestara/host-runtime';
import { InteractionService } from '@vestara/interaction-app';
import { InteractionEventBusAdapter, SqliteInteractionStore } from '@vestara/interaction-persistence';
import { DefaultKernel } from '@vestara/kernel';
import { LocalMarketplaceRegistry, type MarketplaceEventSink, MarketplaceService } from '@vestara/marketplace';
import { InMemoryRuntimeSessionRegistry, OpenCodeHttpClient, resolveOpenCodeConfig } from '@vestara/opencode-runtime';
import {
  OpenAIProvider,
  OpenCodeGoProvider,
  OpenCodeProvider,
  OpenCodeRuntimeProvider,
} from '@vestara/provider-opencode';
import { DefaultProviderManager, FileRoutingAssignmentStore, FileRoutingStore } from '@vestara/provider-runtime';
import type { Runtime } from '@vestara/runtime';
import type { ServiceStatus, VestaraService } from '@vestara/shared';
import { migrate } from '@vestara/sqlite-migrations';
import { type OperationType, TelemetryRuntime } from '@vestara/telemetry';
import { FileThreadStore } from '@vestara/thread-runtime';
import { FilesystemReadTool, FilesystemSearchTool, FilesystemWriteTool, ToolRuntime } from '@vestara/tool-runtime';
import {
  BrowserClickTool,
  BrowserCloseTool,
  BrowserNavigateTool,
  BrowserScreenshotTool,
  BrowserSession,
  BrowserSnapshotTool,
  BrowserTypeTool,
  isInformationClassification,
  isRedactionMode,
  type OriginPolicy,
  PlaywrightBrowserDriver,
} from '@vestara/tools-browser';
import { GitAddTool, GitCommitTool, GitDiffTool, GitLogTool, GitStatusTool } from '@vestara/tools-git';
import { GovernedShellExecuteTool } from '@vestara/tools-shell';
import type { AgentEnvironment, AgentEnvironmentId, HarnessVerificationResult } from '@vestara/types';
import { EngineeringVerificationProfiles } from '@vestara/verification';
import {
  ArtifactStore,
  FallbackTaskDispatcher,
  FileLockRegistry,
  PlanStore as OrchestrationPlanStore,
  ProjectStore as OrchestrationProjectStore,
  TaskStore as OrchestrationTaskStore,
  WorkerCluster,
  WorkerRegistry,
  WorkerScheduler,
  WorkerStore,
  WorkflowOrchestrator,
} from '@vestara/workflow-orchestrator';
import {
  AgentCapabilityManager,
  AgentRuntime,
  AgentService,
  AgentStorage,
  AuditStore,
  ChangeSetStorage,
  CollaborationService,
  CollaborationStorage,
  ExecutionPlanner,
  ExplainService,
  HarnessSession,
  HarnessTaskDispatcher,
  ImplementationService,
  KnowledgeGraphStorage,
  MemoryService,
  MilestoneService,
  MultiAgentWorkflowOrchestrator,
  OrderService,
  OrderStorage,
  PLANS_MANIFEST,
  PlanningService,
  PlanStorage,
  ProjectService,
  ProjectStorage,
  SessionOrchestrator,
  SessionService,
  SessionStorage,
  SuggestionService,
  UserStore,
  VerificationService,
  VerificationStorage,
  WorkspaceAnalyst,
  WorkspaceRuntime,
  WorkspaceUiWatcher,
} from '@vestara/workspace';
import { WorktreeLeaseRuntime } from '@vestara/worktree-runtime';
import { getActivityRoom } from './activity-room';
import { createAssistantOpenCodeExecutor } from './assistant-opencode-adapter';
import { startActivityRoomOrganizationalBridge } from './bridges/activity-room-organizational-bridge';
import { ChangeEventProjector } from './bridges/change-event-bridge';
import { createHarnessApprovalInteractionBridge } from './bridges/harness-approval-interaction-bridge';
import { createHarnessEngineeringEventBridge } from './bridges/harness-engineering-event-bridge';
import { OrchestrationEventBridge } from './bridges/orchestration-event-bridge';
import { resolveVisualScenarios } from './evidence/visual-scenarios.js';
import { ExternalRuntimeService } from './external-runtime/service';
import { EngineeringGraphService } from './graph/service';
import * as messageReceipts from './message-receipts';
import { type OpenCodeRuntimeService, openCodeRuntimeService } from './opencode-runtime-service';
import { runToolLoop } from './routes/chat';
import { restoreProviderConfigurations } from './routes/providers';
import { ApiRuntime } from './runtime/api-runtime';
import { SessionStreamAccumulator } from './session-stream';
import { VerifierResultsStore } from './verifier/verifier-results-store';
import { WorkerSocketServer } from './worker/worker-socket-server';

export interface WorkspaceContext {
  kernel: DefaultKernel;
  hostRuntime: HostRuntime;
  bootRuntime: BootRuntime;
  providerManager: DefaultProviderManager;
  routingStore: FileRoutingStore;
  routingAssignments: FileRoutingAssignmentStore;
  conversationSessions: SqliteConversationSessionStore;
  conversationService: ConversationService;
  agentThreadStore: FileThreadStore;
  agentTools: ToolRuntime;
  createAgentTools(workspaceRoot: string): ToolRuntime;
  agentEnvironment: AgentEnvironment;
  agentHarness: AgentHarnessRuntime;
  harnessSession: HarnessSession;
  runtimeSessionRegistry: InstanceType<typeof InMemoryRuntimeSessionRegistry>;
  multiAgentWorkflow: MultiAgentWorkflowOrchestrator;
  workflowOrchestrator: WorkflowOrchestrator;
  changeProjector: ChangeEventProjector;
  /** Live session-stream accumulator (coalesced per-participant narrative). */
  activityRoomStreams: SessionStreamAccumulator;
  workerSocketServer?: WorkerSocketServer;
  workerRegistry?: WorkerRegistry;
  workerStore?: WorkerStore;
  workerCluster?: WorkerCluster;
  engineeringVerification: EngineeringVerificationProfiles;
  engineeringEvents: SqliteEngineeringEventStore;
  graphService?: EngineeringGraphService;
  externalRuntimeService?: ExternalRuntimeService;
  evidenceManifests: ImmutableEvidenceManifestStore;
  evidenceArtifacts: ContentAddressedEvidenceStore;
  evidenceBundles: BundleStore;
  evidenceBaselines: BaselineStore;
  /** Bounded PNG presentation derivatives of content-addressed visual evidence (EVIDENCE-UX-002 M2). */
  evidenceThumbnails: ThumbnailService;
  evidencePipeline: EvidencePipeline;
  verifierResults: import('./verifier/verifier-results-store').VerifierResultsStore;
  threadRecovery: DurableThreadRecoveryService;
  worktreeRuntime: WorktreeLeaseRuntime;
  runtime: WorkspaceRuntime;
  apiRuntime: ApiRuntime;
  eventBus: EventBus;
  repoPath: string;
  workspaceDir: string;
  db: unknown;
  sessions: SessionService;
  sessionStorage: SessionStorage;
  agents: AgentStorage;
  plans: PlanStorage;
  changeSets: ChangeSetStorage;
  verifications: VerificationStorage;
  collaboration: CollaborationStorage;
  knowledgeGraph: KnowledgeGraphStorage;
  memory: MemoryService;
  explainService: ExplainService;
  planningService: PlanningService;
  implementationService: ImplementationService;
  verificationService: VerificationService;
  collaborationService: CollaborationService;
  agentRuntime: AgentRuntime;
  agentService: AgentService;
  capabilityManager: AgentCapabilityManager;
  orchestrator: SessionOrchestrator;
  executionPlanner: ExecutionPlanner;
  workspaceAnalyst: WorkspaceAnalyst;
  suggestionService: SuggestionService;
  milestones?: MilestoneService;
  projects?: ProjectService;
  orders?: OrderService;
  telemetry: TelemetryRuntime;
  documentation: DocumentationService;
  settings: WorkspaceConfigurationService;
  filesystemRuntime: FilesystemRuntime;
  marketplace: MarketplaceService;
  /** Root into which new products are registered by `POST /api/marketplace/publish`. */
  marketplacePublishRoot: string;
  /** Injectable live-trial runner for `POST /api/qualification/run` (tests override). */
  qualificationLiveRunner?: (profileId: string) => Promise<void>;
  /** Shared OpenCode runtime client used by /api/opencode, /api/agents, /api/providers. */
  opencodeRuntime: OpenCodeRuntimeService;
  users: UserStore;
  audit: AuditStore;
  publish: (event: UiEvent) => void;
  onMilestoneUpdate?: (version: string) => void;
  workspaceUiWatcher?: WorkspaceUiWatcher;
  close: () => Promise<void>;
}

type PublishFn = (event: UiEvent) => void;

async function openSqlDb(dbPath: string, migrateRaw?: (raw: import('sql.js').Database) => void): Promise<unknown> {
  const path = await import('node:path');
  const initSqlJs = (await import('sql.js')).default;
  const sqlJsDir = path.dirname(require.resolve('sql.js'));
  const SQL = await initSqlJs({ locateFile: (file: string) => path.join(sqlJsDir, file) });
  let db: any;
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  // Migrate FIRST on the raw Database, before the auto-persist wrappers are
  // applied. The wrappers call db.export() on CREATE/DML, which sql.js commits
  // an open transaction — incompatible with the migration runner's
  // per-step transactions.
  if (migrateRaw) migrateRaw(db);
  // Auto-persist: wrap exec to trigger disk write after every DML
  const origExec = db.exec.bind(db);
  db.exec = (sql: string) => {
    const result = origExec(sql);
    // Only persist on write operations
    const trimmed = sql.trim().toUpperCase();
    if (
      trimmed.startsWith('INSERT') ||
      trimmed.startsWith('UPDATE') ||
      trimmed.startsWith('DELETE') ||
      trimmed.startsWith('CREATE') ||
      trimmed.startsWith('DROP')
    ) {
      persistDb(db, dbPath);
    }
    return result;
  };
  // Also wrap prepare-based writes via a patched prepare
  const origPrepare = db.prepare.bind(db);
  db.prepare = (sql: string) => {
    const stmt = origPrepare(sql);
    const origStep = stmt.step.bind(stmt);
    let stepped = false;
    stmt.step = () => {
      const result = origStep();
      if (!stepped) {
        stepped = true;
      }
      return result;
    };
    const origFree = stmt.free.bind(stmt);
    stmt.free = () => {
      origFree();
      const trimmed = sql.trim().toUpperCase();
      if (trimmed.startsWith('INSERT') || trimmed.startsWith('UPDATE') || trimmed.startsWith('DELETE')) {
        persistDb(db, dbPath);
      }
    };
    return stmt;
  };
  return db;
}

function persistDb(db: any, dbPath: string): void {
  try {
    const data = db.export();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(dbPath, Buffer.from(data));
  } catch {
    /* best-effort */
  }
}

function parseOriginPolicies(raw: string | undefined): OriginPolicy[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const policies: OriginPolicy[] = [];
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { origin, classification, retentionPolicy, redaction } = entry as OriginPolicy;
    if (typeof origin !== 'string' || origin.length === 0) continue;
    policies.push({
      origin,
      ...(isInformationClassification(classification) ? { classification } : {}),
      ...(typeof retentionPolicy === 'string' ? { retentionPolicy } : {}),
      ...(isRedactionMode(redaction) ? { redaction } : {}),
    });
  }
  return policies;
}

export async function createWorkspaceContext(repoPath: string, publish: PublishFn): Promise<WorkspaceContext> {
  const T0 = process.hrtime.bigint();
  const log = (phase: string) => {
    const ms = Math.round(Number(process.hrtime.bigint() - T0) / 1_000_000);
    console.log(`[boot:ctx] ${phase} — ${ms}ms`);
  };
  const abs = path.resolve(repoPath);
  const kernel = new DefaultKernel();
  log('kernel-created');
  const hostRuntime = new HostRuntime();
  const bootRuntime = new BootRuntime({
    store: new FileBootStateStore(path.join(abs, '.vestara', 'os', 'boot-state.json')),
  });
  // The provider manager must exist before kernel boot so the kernel can load it.
  // Kernel-owned infrastructure is attached immediately after boot, once its
  // guarded event bus and logger accessors are available.
  const providerManager = new DefaultProviderManager();
  const opencode = new OpenCodeProvider();
  const opencodeGo = new OpenCodeGoProvider();
  const openai = new OpenAIProvider();
  await providerManager.register(opencode);
  await providerManager.register(opencodeGo);
  await providerManager.register(openai);
  providerManager.registerEngineeringMetadata('opencode', {
    locality: 'cloud',
    capabilities: [
      'conversation',
      'planning',
      'implementation',
      'code-review',
      'verification',
      'filesystem-read',
      'filesystem-write',
      'command-execution',
      'structured-output',
      'streaming',
    ],
    dataPolicies: ['metadata-only', 'source-allowed'],
  });
  providerManager.registerEngineeringMetadata('opencode-go', {
    locality: 'cloud',
    capabilities: [
      'conversation',
      'planning',
      'implementation',
      'code-review',
      'verification',
      'filesystem-read',
      'filesystem-write',
      'command-execution',
      'structured-output',
      'streaming',
    ],
    dataPolicies: ['metadata-only', 'source-allowed'],
  });
  providerManager.registerEngineeringMetadata('openai', {
    locality: 'cloud',
    capabilities: [
      'conversation',
      'planning',
      'implementation',
      'code-review',
      'verification',
      'filesystem-read',
      'filesystem-write',
      'command-execution',
      'structured-output',
      'streaming',
      'image-understanding',
    ],
    dataPolicies: ['metadata-only', 'source-allowed'],
  });
  log('providers-registered');
  await kernel.boot({
    providers: [
      { manager: providerManager, providerId: 'opencode' },
      { manager: providerManager, providerId: 'opencode-go' },
      { manager: providerManager, providerId: 'openai' },
    ],
    services: [
      {
        service: runtimeService(hostRuntime, '0.1.0'),
        capabilities: [...hostRuntime.capabilities],
        dependencies: ['kernel'],
      },
      {
        service: runtimeService(bootRuntime, '0.1.0'),
        capabilities: [...bootRuntime.capabilities],
        dependencies: ['host-runtime'],
      },
    ],
  });
  log('kernel-booted');
  hostRuntime.setEventBus(kernel.eventBus);
  hostRuntime.setPermissionManager(kernel.permissions);
  bootRuntime.setEventBus(kernel.eventBus);
  await bootRuntime.advance('host-started');
  await bootRuntime.advance('storage-mounted', abs);
  await bootRuntime.advance('identity-loaded', `uid:${process.getuid?.() ?? 'unknown'}`);
  await bootRuntime.advance('services-started');
  providerManager.attachRuntimeServices({ eventBus: kernel.eventBus, logger: kernel.logger });

  const runtime = new WorkspaceRuntime({
    logger: kernel.logger,
    eventBus: kernel.eventBus,
    provider: opencode,
  });

  await runtime.open(abs);
  log('runtime-opened');
  await bootRuntime.advance('runtime-composed', sessionSafeId(runtime));
  const session = runtime.getSession();
  const workspaceDir = session.workspaceDir;
  await restoreProviderConfigurations({ workspaceDir, providerManager });
  const conversationSessions = new SqliteConversationSessionStore({
    dbPath: path.join(workspaceDir, 'conversations', 'saved-chats.db'),
    logger: kernel.logger,
  });
  await conversationSessions.initialize();
  const agentThreadStore = await FileThreadStore.open(path.join(workspaceDir, 'threads', 'agent-harness.db'));
  const engineeringEvents = await SqliteEngineeringEventStore.open(
    path.join(workspaceDir, 'events', 'engineering-events.db'),
  );
  const evidenceManifests = new ImmutableEvidenceManifestStore(path.join(workspaceDir, 'evidence'));
  const evidenceArtifacts = new ContentAddressedEvidenceStore(path.join(workspaceDir, 'evidence', 'artifacts'));
  // PCS-026 evidence pipeline — collects changed files + source diff into
  // content-addressed artifacts, writes an immutable manifest, and assembles a
  // verification bundle after every harness verification.
  const evidenceBundles = new BundleStore(path.join(workspaceDir, 'evidence', 'bundles'));
  const evidenceBaselines = new BaselineStore(path.join(workspaceDir, 'evidence', 'baselines'));
  // EVIDENCE-UX-002 M2 — thumbnail derivatives live beside (never inside) the
  // content-addressed store, keyed by digest + spec. Lazy, deterministic, immutable.
  const evidenceThumbnails = new ThumbnailService(path.join(workspaceDir, 'evidence', 'derivatives'));
  const verifierResults = new VerifierResultsStore();
  const evidenceCollectors: import('@vestara/evidence').EvidenceCollector[] = [
    new FilesystemChangeCollector(),
    new SourceDiffCollector(),
  ];
  log('evidence-stores');
  const screenshotBase = process.env.VESTARA_SCREENSHOT_URL;
  const visualScenarios = resolveVisualScenarios(process.env);
  if (screenshotBase && visualScenarios.scenarios.length > 0) {
    // PCS-026 visual leg — enabled only when a target app URL is configured and
    // Chromium is provisioned (`npx playwright install chromium`). A scenario
    // matrix (routes × viewports × themes) provisions one collector per scenario;
    // baseline governance stays keyed per scenario.
    const { PlaywrightScreenshotSource } = await import('./evidence/playwright-screenshot-source.js');
    const source = new PlaywrightScreenshotSource({ baseUrl: screenshotBase });
    for (const scenario of visualScenarios.scenarios) {
      evidenceCollectors.push(
        new VisualEvidenceCollector({
          source,
          baselines: evidenceBaselines,
          artifacts: evidenceArtifacts,
          scenario,
        }),
      );
    }
    if (visualScenarios.note)
      kernel.logger?.info?.('visual evidence scenario matrix', {
        note: visualScenarios.note,
        scenarios: visualScenarios.scenarios.length,
      });
  }
  const evidencePipeline = new EvidencePipeline({
    artifacts: evidenceArtifacts,
    manifests: evidenceManifests,
    bundles: evidenceBundles,
    collectors: evidenceCollectors,
    producer: 'harness-verifier',
    environment: `local:${session.fingerprint.id}`,
  });
  const worktreeRuntime = await WorktreeLeaseRuntime.open({
    dbPath: path.join(workspaceDir, 'worktrees', 'leases.db'),
    leaseRoot: path.join(
      path.dirname(abs),
      '.vestara-worktrees',
      session.fingerprint.id.replace(/[^a-zA-Z0-9._-]/g, '-'),
    ),
    emit: (event) => {
      engineeringEvents.append({
        type: event.type,
        source: 'worktree-runtime',
        actorId: event.lease.agentId,
        authority: 'system',
        workspaceId: session.fingerprint.id,
        environmentId: event.lease.id,
        taskId: event.lease.taskId,
        correlationId: `worktree:${event.lease.id}`,
        payload: { lease: event.lease, detail: event.detail },
      });
    },
  });
  worktreeRuntime.recover();
  log('worktree-opened');
  const routingStore = new FileRoutingStore(
    path.join(workspaceDir, 'routing.json'),
    { profileId: 'balanced', roles: {} },
    'system',
  );
  const routingAssignments = new FileRoutingAssignmentStore(path.join(workspaceDir, 'routing-assignments.json'));
  const dbPath = path.join(workspaceDir, 'plans', 'plans.db');
  // Phase 1.1a (incident #0001): the plans.db migration chain runs on the raw
  // Database with explicit persistence before the auto-persist wrappers apply,
  // and before any storage constructs. Idempotent; no-op when current.
  const db = await openSqlDb(dbPath, (raw) => {
    migrate(raw, PLANS_MANIFEST, {
      persist: (migrated) => persistDb(migrated, dbPath),
    });
  });
  log('plans-db-opened');
  const sessionStorage = new SessionStorage(db);
  const agents = new AgentStorage(db);
  const plans = new PlanStorage(db);
  const changeSets = new ChangeSetStorage(db);
  const verifications = new VerificationStorage(db);
  const collaboration = new CollaborationStorage(db);
  const users = new UserStore(db);
  const audit = new AuditStore(db);
  const knowledgeGraph = new KnowledgeGraphStorage(db);
  const memory = new MemoryService({
    graph: knowledgeGraph,
    planStorage: plans,
    csStorage: changeSets,
    collabStorage: collaboration,
    agentStorage: agents,
  });
  // Auto-index knowledge graph on workspace open so the Memory page has data.
  // Skip with VESTARA_SKIP_MEMORY_INDEX=1 to reduce startup memory pressure.
  if (process.env.VESTARA_SKIP_MEMORY_INDEX !== '1') {
    memory.index(session).catch((err) => kernel.logger?.warn?.('Knowledge graph index failed', { error: String(err) }));
  }
  const sessions = new SessionService({
    storage: sessionStorage,
    planStorage: plans,
    csStorage: changeSets,
    collabStorage: collaboration,
    vrStorage: verifications,
  });

  const explainService = new ExplainService({ provider: opencode });
  const planningService = new PlanningService({ storage: plans, provider: opencode });

  // Filesystem capability boundary — the single path agents use to reach the filesystem.
  const telemetry = new TelemetryRuntime();
  const filesystemRuntime = new FilesystemRuntime({ rootDir: abs, telemetry });
  const createAgentTools = (workspaceRoot: string): ToolRuntime => {
    const scopedFilesystem =
      path.resolve(workspaceRoot) === path.resolve(abs)
        ? filesystemRuntime
        : new FilesystemRuntime({ rootDir: workspaceRoot, telemetry });
    const tools = new ToolRuntime();
    tools.register(new FilesystemReadTool(scopedFilesystem));
    tools.register(new FilesystemSearchTool(scopedFilesystem));
    tools.register(new FilesystemWriteTool(scopedFilesystem));
    tools.register(new GovernedShellExecuteTool());
    tools.register(new GitStatusTool());
    tools.register(new GitDiffTool());
    tools.register(new GitLogTool());
    tools.register(new GitAddTool());
    tools.register(new GitCommitTool());
    // Browser / computer-use tools — enabled when a base URL is configured
    // (VESTARA_BROWSER_URL, falling back to VESTARA_SCREENSHOT_URL). The session
    // is lazy; Chromium must be provisioned (`npx playwright install chromium`).
    const browserBaseUrl = process.env.VESTARA_BROWSER_URL ?? process.env.VESTARA_SCREENSHOT_URL;
    if (browserBaseUrl) {
      const allowedOrigins = (process.env.VESTARA_BROWSER_ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      const classification = process.env.VESTARA_BROWSER_CLASSIFICATION;
      const retentionPolicy = process.env.VESTARA_BROWSER_RETENTION;
      const redaction = process.env.VESTARA_BROWSER_REDACTION;
      const options = {
        baseUrl: browserBaseUrl,
        allowedOrigins,
        originPolicies: parseOriginPolicies(process.env.VESTARA_BROWSER_ORIGIN_POLICIES),
        ...(isInformationClassification(classification) ? { classification } : {}),
        ...(retentionPolicy ? { retentionPolicy } : {}),
        ...(isRedactionMode(redaction) ? { redaction } : {}),
      };
      const browserSession = new BrowserSession(new PlaywrightBrowserDriver(options), options);
      tools.register(new BrowserNavigateTool(browserSession));
      tools.register(new BrowserSnapshotTool(browserSession));
      tools.register(new BrowserScreenshotTool(browserSession));
      tools.register(new BrowserClickTool(browserSession));
      tools.register(new BrowserTypeTool(browserSession));
      tools.register(new BrowserCloseTool(browserSession));
    }
    return tools;
  };
  const agentTools = createAgentTools(abs);

  // Conversation service (constructed below after agentEnvironment) — persisted,
  // tool-aware chat engine backed by the SQLite conversation store.

  // Marketplace — catalog and discovery over approved local roots. Installation
  // mechanics stay with extension-runtime (single authority for integrity,
  // permissions, activation, rollback, durable state, and graph projection).
  const alwaysGrantApprover: ExtensionPermissionApprover = {
    async decide() {
      return { granted: true, grantedBy: 'api' };
    },
  };
  const marketplaceEventSink: MarketplaceEventSink = {
    publish(event) {
      publish({
        id: `marketplace-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        type: event.type,
        actor: { id: 'marketplace', name: 'Marketplace', type: 'system' },
        category: 'marketplace' as unknown as UiEvent['category'],
        resource: {
          type: 'marketplace-package',
          id: event.packageName ?? 'registry',
          name: event.packageName ?? event.type,
        },
        message: event.type,
        timestamp: event.timestamp,
        metadata: { ...event.metadata, correlationId: event.correlationId },
      });
    },
  };
  const marketplaceRoots = [
    path.join(abs, '.vestara', 'marketplace'),
    path.join(abs, '.vestara', 'packages'),
    path.join(os.homedir(), '.config', 'vestara', 'marketplace'),
  ];
  if (process.env.VESTARA_MARKETPLACE_ROOTS)
    marketplaceRoots.push(...process.env.VESTARA_MARKETPLACE_ROOTS.split(path.delimiter).filter(Boolean));
  const marketplaceManager = new LocalExtensionManager(
    path.join(abs, '.vestara', 'extensions'),
    alwaysGrantApprover,
    undefined,
    undefined,
    marketplaceEventSink,
    undefined,
    '1.0.0',
  );
  const marketplaceRegistry = new LocalMarketplaceRegistry({
    id: 'local',
    displayName: 'Local',
    roots: marketplaceRoots,
    eventSink: marketplaceEventSink,
  });
  const marketplace = new MarketplaceService({
    registries: [marketplaceRegistry],
    manager: marketplaceManager,
    eventSink: marketplaceEventSink,
    vestaraVersion: '1.0.0',
    workspaceId: session.fingerprint.id,
  });
  const engineeringVerification = new EngineeringVerificationProfiles();
  const agentEnvironment: AgentEnvironment = {
    id: `local-workspace-${session.fingerprint.id}` as AgentEnvironmentId,
    kind: 'local',
    workspaceRoot: abs,
    networkPolicy: 'restricted',
    filesystemPolicy: 'workspace-write',
    processPolicy: 'restricted',
  };

  // ── Conversation service — persisted, tool-aware chat engine. The provider
  // executor resolves the provider + model from the current routing selection
  // (the same source `/api/routing` and `/api/providers` expose), defaulting to
  // the `developer` role, so chat follows whatever agent/provider/model the
  // routing picker chose. Falls back to the first provider that has models.
  const resolveConversationRoute = (requestedModel?: string): { providerId: string; modelId: string } => {
    const roles = routingStore.get().selection.roles;
    const ref = roles.developer ?? Object.values(roles)[0];
    const candidate = ref ? providerManager.getProvider(ref.providerId) : null;
    if (candidate?.models.length) {
      const modelExists = (id: string) => candidate.models.some((model) => model.id === id);
      const modelId =
        ref?.modelId && modelExists(ref.modelId)
          ? ref.modelId
          : requestedModel && modelExists(requestedModel)
            ? requestedModel
            : candidate.models[0]!.id;
      return { providerId: candidate.id, modelId };
    }
    for (const info of providerManager.listProviders()) {
      const provider = providerManager.getProvider(info.id);
      if (provider?.models.length) {
        const modelId =
          requestedModel && provider.models.some((model) => model.id === requestedModel)
            ? requestedModel
            : provider.models[0]!.id;
        return { providerId: provider.id, modelId };
      }
    }
    throw new Error('No AI provider with available models is configured');
  };
  const conversationProviderExecutor: ProviderExecutor = {
    async complete(request) {
      const { providerId, modelId } = resolveConversationRoute(request.model);
      const provider = providerManager.getProvider(providerId);
      if (!provider) throw new Error(`AI provider not available: ${providerId}`);
      const { content } = await runToolLoop({
        provider: provider as never,
        model: modelId,
        messages: request.messages,
        tools: agentTools.definitions(),
        toolsRuntime: agentTools,
        environment: agentEnvironment,
        taskId: `conversation-${Date.now()}`,
      });
      return {
        id: `conv-${Date.now()}`,
        model: modelId,
        provider: providerId,
        content,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latency: 0,
      };
    },
    async *stream(request) {
      const { providerId, modelId } = resolveConversationRoute(request.model);
      const provider = providerManager.getProvider(providerId);
      if (!provider) throw new Error(`AI provider not available: ${providerId}`);
      const { content, toolResults } = await runToolLoop({
        provider: provider as never,
        model: modelId,
        messages: request.messages,
        tools: agentTools.definitions(),
        toolsRuntime: agentTools,
        environment: agentEnvironment,
        taskId: `conversation-${Date.now()}`,
      });
      for (const toolResult of toolResults) {
        yield {
          id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'tool_result',
          content: toolResult,
          metadata: { sequence: 0, timestamp: new Date().toISOString(), provider: providerId, model: modelId },
        };
      }
      if (content) {
        yield {
          id: `text-${Date.now()}`,
          type: 'text',
          content,
          metadata: { sequence: 1, timestamp: new Date().toISOString(), provider: providerId, model: modelId },
        };
      }
    },
  };
  // GA-UX-PREMIUM M3: optional OpenCode-backed executor carrying
  // `assistant.execution.v1` detail. OFF by default (`VESTARA_ASSISTANT_OPENCODE=1`
  // to enable); any setup failure falls back to the direct-provider executor —
  // additive, never mandatory (AR-009 remains paused).
  let activeConversationExecutor: ProviderExecutor = conversationProviderExecutor;
  if (process.env.VESTARA_ASSISTANT_OPENCODE === '1') {
    try {
      const ocConfig = resolveOpenCodeConfig({});
      const ocClient = new OpenCodeHttpClient(ocConfig);
      activeConversationExecutor = createAssistantOpenCodeExecutor({
        client: ocClient,
        workspaceId: session.fingerprint.id,
        directory: abs,
        agent: 'vestara-assistant',
        title: 'Assistant conversation',
        // Real upstream provenance: resolve provider/model from the routing
        // selection per turn — never fabricate a provider label.
        resolveProviderModel: (requestedModel) => {
          try {
            const { providerId, modelId } = resolveConversationRoute(requestedModel);
            return { providerID: providerId, modelID: modelId };
          } catch {
            return undefined;
          }
        },
      });
      log('assistant-execution: opencode adapter active');
    } catch (error) {
      log(
        `assistant-execution: opencode adapter unavailable (${error instanceof Error ? error.message : 'unknown'}) — using direct provider`,
      );
    }
  }
  const conversationStore = new SqliteConversationStore({
    dbPath: path.join(workspaceDir, 'conversations', 'conversations.db'),
    logger: kernel.logger,
  });
  await conversationStore.initialize();
  const conversationService: ConversationService = new DefaultConversationService({
    contextAssembler: new DefaultContextAssembler(),
    providerExecutor: activeConversationExecutor,
    eventBus: kernel.eventBus,
    logger: kernel.logger,
    store: conversationStore,
  });
  log('conversation-service');

  // ── Agent Harness — the durable single-turn execution loop. The composition
  // root owns its dependencies; the harness itself never touches SQLite or the
  // event store (projections attach through the event bus below).
  const harnessContext: HarnessContextAssembler = {
    async assemble({ thread, turn, replay, environment }) {
      const lines = [
        `Task: ${thread.taskId}`,
        `Thread: ${thread.title}`,
        `Turn instruction: ${turn.input}`,
        `Workspace: ${environment.workspaceRoot}`,
        `Policies: network=${environment.networkPolicy} filesystem=${environment.filesystemPolicy} process=${environment.processPolicy}`,
      ];
      // Inject recent human messages so agents observe broadcast messages and
      // are addressed by @mentions. Messages without an @mention are observed
      // (shared workflow context); a mention names the intended responder.
      const agentId = String((thread.metadata as { agentId?: unknown })?.agentId ?? '');
      const role = String((thread.metadata as { role?: unknown })?.role ?? '');
      const humanMessages = await recentHumanMessages(thread);
      if (humanMessages.length > 0) {
        lines.push('Recent human messages (observe all; respond when ADDRESSED):');
        for (const message of humanMessages) {
          const addressed = messageReceipts.messageTargetsAgent(message.content, agentId, role);
          // Record delivery/observation so the Activity Room can show receipts.
          if (agentId) messageReceipts.markMessageObserved(message.id, agentId);
          lines.push(`- [${addressed ? 'ADDRESSED' : 'observed'}] ${message.actor.displayName}: ${message.content}`);
        }
      }
      const recentResults = replay.items.filter((item) => item.kind === 'tool-result').slice(-8);
      for (const item of recentResults) {
        const p = item.payload as { toolName?: unknown; status?: unknown };
        lines.push(`Tool ${String(p.toolName ?? '')}: ${String(p.status ?? '')}`);
      }
      return lines.join('\n');
    },
  };

  // Recent human activity messages for the thread's workflow. Broadcast messages
  // are observed by every participant; an @mention addresses a specific agent.
  function recentHumanMessages(thread: {
    metadata: Readonly<Record<string, unknown>>;
  }): Promise<AgentMessageActivity[]> {
    const workflowId = String(thread.metadata.workflowId ?? '');
    if (!workflowId) return Promise.resolve([]);
    return getActivityRoom()
      .store.list({ workflowId, kind: 'agent-message', limit: 50 })
      .then((page) =>
        page.records.filter(
          (record): record is AgentMessageActivity => record.kind === 'agent-message' && record.actor.type === 'human',
        ),
      )
      .catch(() => []);
  }

  const harnessVerifier: HarnessVerifier = {
    async verify({ thread, replay, environment }) {
      const changedFiles: string[] = [];
      for (const item of replay.items) {
        if (item.kind !== 'tool-call') continue;
        const p = item.payload as { toolName?: unknown; input?: { path?: unknown } };
        if (
          String(p.toolName ?? '').startsWith('filesystem.') &&
          p.input &&
          typeof p.input.path === 'string' &&
          p.input.path
        ) {
          changedFiles.push(p.input.path);
        }
      }
      const result = await engineeringVerification.verify({
        workspaceRoot: environment.workspaceRoot,
        changedFiles,
        signal: undefined,
      });
      // PCS-026: persist a verification evidence bundle; a failure here must not
      // break verification.
      try {
        const commit = gitHeadCommit(environment.workspaceRoot);
        const executionId = `verification-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const bundle = await evidencePipeline.buildBundle({
          executionId,
          taskId: thread.taskId,
          verifierId: 'engineering-verifier',
          profileId: 'standard',
          repository: environment.workspaceRoot,
          implementationCommit: commit,
          outcome: result.status,
          scope: result.checks.map((check) => check.id),
          limitations: result.uncoveredRisks,
          checks: result.checks.map((check) => ({
            id: check.id,
            name: check.name,
            status: check.status,
            summary: check.summary,
          })),
          uncoveredRisks: result.uncoveredRisks,
          workspaceRoot: environment.workspaceRoot,
          changedFiles,
        });
        void kernel.eventBus
          .emit({
            type: 'harness.verification-bundle',
            source: 'evidence-pipeline',
            payload: { threadId: thread.id, bundleId: bundle.id, executionId, confidence: bundle.confidence.score },
          })
          .catch(() => {});
        const extended: HarnessVerificationResult & { evidenceBundleId?: string } = {
          ...result,
          evidenceBundleId: bundle.id,
        };
        return extended;
      } catch {
        return result;
      }
    },
  };
  const agentHarness = new AgentHarnessRuntime({
    store: agentThreadStore,
    // Agents execute through the OpenCode runtime (same mechanism as the
    // governed live trials): a runtime session per turn, replies streamed over
    // the /event SSE endpoint until session.idle. Provider/model are discovered
    // from the runtime (`/api/opencode/providers`), never hardcoded. The
    // resolver aligns each agent turn with the provider/model/runtime agent the
    // agent was configured with in the Agent Control modal (agent registry
    // first, then the global routing selection for the role).
    provider: new OpenCodeRuntimeProvider({ directory: abs }),
    model: 'opencode-runtime',
    tools: agentTools,
    context: harnessContext,
    verifier: harnessVerifier,
    eventBus: kernel.eventBus,
    resolveAgentExecution: resolveAgentExecutionFor(agents, routingStore),
  });
  log('agent-harness');
  const workflowPublishTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const unsubscribeHarnessBridge = createHarnessEngineeringEventBridge({
    eventBus: kernel.eventBus,
    events: engineeringEvents,
    workspaceId: session.fingerprint.id,
    environmentId: agentEnvironment.id,
    telemetry,
    // Push when events are appended (not on GET), coalesced over a small
    // interval to avoid render storms from high-frequency tool/terminal events.
    onAppended: ({ threadId, sequence }) => {
      if (!threadId) return;
      const existing = workflowPublishTimers.get(threadId);
      if (existing) clearTimeout(existing);
      workflowPublishTimers.set(
        threadId,
        setTimeout(() => {
          workflowPublishTimers.delete(threadId);
          publish({
            id: `workflow-${Date.now()}`,
            type: 'workflow.updated',
            timestamp: new Date().toISOString(),
            category: 'system',
            actor: { id: 'agent-harness', name: 'Agent Harness', type: 'system' },
            resource: { type: 'agent-thread', id: threadId, name: threadId },
            message: 'Workflow updated',
            metadata: { threadId, sequence },
          });
        }, 75),
      );
    },
  });
  log('harness-bridge');
  const activityRoomStreams = new SessionStreamAccumulator();
  const unsubscribeActivityRoomBridge = startActivityRoomOrganizationalBridge({
    eventBus: kernel.eventBus,
    threadStore: agentThreadStore,
    streams: activityRoomStreams,
  });
  // Phase 4 (engineering-os-roadmap item 4) — durable engineering memory:
  // project harness.* events from completed threads into the memory runtime.
  const { DefaultMemoryRuntime, createEngineeringMemoryProjection } = await import('@vestara/memory');
  const engineeringMemory = new DefaultMemoryRuntime({
    logger: kernel.logger,
    eventBus: kernel.eventBus,
  });
  await engineeringMemory.initialize();
  log('memory-initialized');
  const unsubscribeEngineeringMemory = createEngineeringMemoryProjection({
    eventBus: kernel.eventBus,
    memory: engineeringMemory,
    logger: kernel.logger,
    userId: session.fingerprint.id,
  });
  // AR-REC-C2 I3-I2: Harness Approval ↔ Interaction Bridge
  // Wires Harness tool-call approvals to the generic Interaction system.
  const interactionDbPath = path.join(abs, '.vestara', 'interactions.db');
  const interactionStore = await SqliteInteractionStore.open(interactionDbPath);
  const interactionBusAdapter = new InteractionEventBusAdapter(kernel.eventBus);
  const bridgeInteractionService = new InteractionService({
    persistence: interactionStore,
    publication: interactionBusAdapter,
  });
  const harnessApprovalBridgeDisposal = createHarnessApprovalInteractionBridge({
    eventBus: kernel.eventBus,
    interactionService: bridgeInteractionService,
    harness: agentHarness,
    threadResolver: {
      getThread: (threadId: string) => {
        const thread = agentHarness.listThreads().find((t) => t.id === threadId);
        return thread ? { id: thread.id, title: thread.title } : undefined;
      },
    },
    listThreadIds: () => agentHarness.listThreads().map((t) => t.id),
  });
  log('harness-approval-bridge');
  const harnessSession = new HarnessSession({
    harness: agentHarness,
    storage: agents,
    environment: agentEnvironment,
  });
  // M7: Runtime session continuity registry — single authoritative binding
  // between workflow runs and physical OpenCode sessions.
  const runtimeSessionRegistry = new InMemoryRuntimeSessionRegistry();
  const multiAgentWorkflow = new MultiAgentWorkflowOrchestrator({
    session: harnessSession,
    changeProjector: undefined,
  });
  const changeProjector = new ChangeEventProjector({
    events: engineeringEvents,
    workspaceId: session.fingerprint.id,
    environmentId: agentEnvironment.id,
    root: abs,
  });

  // ── PCS-027 distributed worker cluster — nodes register over /ws/worker
  // and the cluster dispatches tasks to them via capability + load scheduling.
  const workerStore = new WorkerStore(db as import('sql.js').Database);
  const workerRegistry = new WorkerRegistry(workerStore);
  const workerSocketServer = new WorkerSocketServer(workerRegistry, {
    append: (event) => {
      try {
        engineeringEvents.append({
          type: `worker.${event.type}`,
          source: 'worker-socket-server',
          actorId: event.nodeId,
          authority: 'system',
          workspaceId: session.fingerprint.id,
          environmentId: agentEnvironment.id,
          correlationId: `worker:${event.nodeId}`,
          payload: { nodeId: event.nodeId, detail: event.detail },
        });
      } catch {
        // projection failures must not break worker connections
      }
    },
  });
  const workerCluster = new WorkerCluster({
    registry: workerRegistry,
    scheduler: new WorkerScheduler(workerRegistry),
    store: workerStore,
    transportFor: (nodeId) => workerSocketServer.transportFor(nodeId),
    // PCS-027 §8 — remote dispatch results flow through the evidence pipeline.
    onRemoteResult: async ({ task, result }) => {
      try {
        const commit = gitHeadCommit(abs);
        const executionId = `remote-${task.id}-${Date.now()}`;
        const bundle = await evidencePipeline.buildBundle({
          executionId,
          taskId: task.id,
          verifierId: result.agentId ?? 'remote-worker',
          profileId: 'standard',
          repository: abs,
          implementationCommit: commit,
          outcome: result.status === 'completed' ? 'passed' : 'failed',
          scope: task.requiredCapabilities,
          checks: [
            {
              id: 'remote-execution',
              name: 'Remote worker dispatch',
              status: result.status === 'completed' ? 'passed' : 'failed',
              summary: result.output ?? result.error ?? `remote ${task.summary}`,
            },
          ],
          workspaceRoot: abs,
          changedFiles: [],
        });
        void kernel.eventBus
          .emit({
            type: 'worker.remote-bundle',
            source: 'worker-cluster',
            payload: { taskId: task.id, bundleId: bundle.id, confidence: bundle.confidence.score },
          })
          .catch(() => {});
      } catch {
        // evidence failure must not break remote dispatch
      }
    },
  });
  multiAgentWorkflow.changeProjector = changeProjector;

  // ── Workflow orchestration (ADR-118) — the single writer of project/plan/
  // task state. Tasks execute through the harness (HarnessTaskDispatcher) and
  // every mutation is appended to the engineering event store as an
  // `orchestration.*` event.
  const orchestrationEvents = new OrchestrationEventBridge({
    events: engineeringEvents,
    workspaceId: session.fingerprint.id,
    environmentId: agentEnvironment.id,
    eventBus: kernel.eventBus,
  });
  const workflowOrchestrator = new WorkflowOrchestrator({
    projects: new OrchestrationProjectStore(db as import('sql.js').Database),
    plans: new OrchestrationPlanStore(db as import('sql.js').Database),
    tasks: new OrchestrationTaskStore(db as import('sql.js').Database),
    artifacts: new ArtifactStore(db as import('sql.js').Database),
    locks: new FileLockRegistry(db as import('sql.js').Database),
    events: orchestrationEvents,
    // Prefer the distributed worker cluster when nodes are online; otherwise
    // dispatch through the durable harness (PCS-027 orchestrator integration).
    dispatcher: new FallbackTaskDispatcher({
      primary: workerCluster,
      fallback: new HarnessTaskDispatcher({
        runner: agentHarness,
        session: harnessSession,
        storage: agents,
        environment: agentEnvironment,
        changeProjector,
      }),
      primaryReady: async () => (await workerRegistry.listOnline()).length > 0,
    }),
    onTelemetry: (op) => {
      telemetry.track({
        agent: op.agent,
        timestamp: new Date().toISOString(),
        type: `orchestration.${op.operation}`,
        status: op.status,
        operation: op.operation as OperationType,
        task: op.task,
        progress: op.status === 'completed' ? 100 : 0,
        phase: op.phase ?? 'unknown',
        detail: op.detail ?? '',
        metadata: { projectId: op.projectId, taskId: op.taskId, durationMs: op.durationMs },
      });
    },
  });
  harnessSession.restoreActiveSessions().catch((error: unknown) => {
    telemetry.track({
      agent: 'agent-harness',
      timestamp: new Date().toISOString(),
      type: 'harness-session.restore-failed',
      status: 'failed',
      operation: 'verify',
      task: 'harness-session',
      progress: 0,
      phase: 'restore',
      detail: error instanceof Error ? error.message : String(error),
    });
  });
  log('workflow-orchestrator');
  const historyImport = importThreadHistory({
    threads: agentThreadStore,
    events: engineeringEvents,
    workspaceId: session.fingerprint.id,
    environmentId: agentEnvironment.id,
  });
  if (historyImport.imported > 0) {
    await kernel.eventBus.emit({
      type: 'engineering-history.imported',
      source: 'engineering-event-store',
      payload: { ...historyImport },
    });
  }
  const recoveryDecisions = reconcileInterruptedThreads({
    threads: agentThreadStore,
    events: engineeringEvents,
    workspaceId: session.fingerprint.id,
    environmentId: agentEnvironment.id,
  });
  const threadRecovery = new DurableThreadRecoveryService(
    agentThreadStore,
    engineeringEvents,
    session.fingerprint.id,
    agentEnvironment.id,
  );
  for (const decision of recoveryDecisions) {
    await kernel.eventBus.emit({
      type: 'recovery.turn-reconciled',
      source: 'engineering-event-store',
      payload: { ...decision },
    });
  }
  log('thread-recovery');
  const settings = new WorkspaceConfigurationService(abs, session.fingerprint.id);
  const capabilityManager = new AgentCapabilityManager({ filesystem: filesystemRuntime });

  const implementationService = new ImplementationService({
    planStorage: plans,
    csStorage: changeSets,
    provider: opencode,
    capabilities: capabilityManager,
  });
  const verificationService = new VerificationService({
    csStorage: changeSets,
    vrStorage: verifications,
    planStorage: plans,
    onTelemetry: (evt) => {
      void kernel.eventBus.emit({
        type: `agent.verifier.${evt.phase}`,
        source: 'verification-service',
        payload: {
          agentId: 'verifier',
          agent: 'verifier',
          phase: evt.phase,
          checkId: evt.checkId,
          checkName: evt.checkName,
          status: evt.status,
          progress: evt.progress,
          detail: evt.detail,
          message: evt.detail,
          operation: evt.phase === 'started' ? 'verify' : evt.phase === 'completed' ? 'verify' : 'verify',
          task: evt.detail,
          checks: evt.checks,
        },
      });
    },
  });
  const collaborationService = new CollaborationService({ storage: collaboration });

  // Initialize milestone tracking
  const milestones = new MilestoneService({ eventBus: kernel.eventBus });

  // Initialize project management
  const projectStorage = new ProjectStorage(db);
  const projects = new ProjectService({ storage: projectStorage, eventBus: kernel.eventBus });

  // Initialize order management
  const orderStorage = new OrderStorage(db);
  const orders = new OrderService({ storage: orderStorage, eventBus: kernel.eventBus });

  // Create ApiRuntime — managed lifecycle for API services
  const runtimeId = 'api-runtime' as unknown as import('@vestara/types').RuntimeId;
  const apiRuntime = new ApiRuntime(
    {
      id: runtimeId,
      type: 'runtime' as import('@vestara/types').RuntimeType,
      name: 'API Runtime',
      eventBus: kernel.eventBus,
      permissionManager: kernel.permissions as unknown as import('@vestara/permissions').PermissionManager,
    },
    {
      kernel,
      workspaceRuntime: runtime,
      eventBus: kernel.eventBus,
      planning: planningService,
      sessions,
      memory,
    },
  );

  // Create AgentRuntime after telemetry is available.
  // Agents reach the filesystem ONLY through the AgentCapabilityManager.
  const agentRuntime = new AgentRuntime({
    storage: agents,
    provider: opencode,
    capabilities: capabilityManager,
    harnessSession,
    onEngineUsed: (engine) => {
      if (engine === 'harness') {
        telemetry.track({
          agent: 'agent-runtime',
          timestamp: new Date().toISOString(),
          type: 'agent-runtime.harness-engine-used',
          status: 'completed',
          operation: 'delegate',
          task: 'agent-runtime',
          progress: 0,
          phase: 'engine',
          detail: 'harness',
        });
      }
    },
  });
  const agentService = new AgentService({
    storage: agents,
    runtime: agentRuntime,
    eventBus: kernel.eventBus,
    capabilities: capabilityManager,
  });
  const orchestrator = new SessionOrchestrator({ storage: agents, runtime: agentRuntime });
  const executionPlanner = new ExecutionPlanner(agents);
  const workspaceAnalyst = new WorkspaceAnalyst(agents, opencode);
  const suggestionService = new SuggestionService({ planStorage: plans, provider: opencode, executionPlanner });

  const ecosystemRoot = path.dirname(abs);
  const documentationRepositories: DocumentationRepositoryConfig[] = [
    { id: 'vestara-ai-core', path: abs, authority: 'implementation', writable: true },
    { id: 'vestara-blueprint', path: path.join(ecosystemRoot, 'vestara-blueprint'), authority: 'architecture' },
    { id: 'vestara-standards', path: path.join(ecosystemRoot, 'vestara-standards'), authority: 'standard' },
    {
      id: 'vestara-specifications',
      path: path.join(ecosystemRoot, 'vestara-specifications'),
      authority: 'specification',
    },
  ];
  const documentation = new DocumentationService({
    repositories: documentationRepositories,
    workspaceId: session.fingerprint.id,
    stateDirectory: path.join(workspaceDir, 'documentation'),
    eventBus: kernel.eventBus,
  });
  await documentation.initialize();
  log('documentation-initialized');
  await documentation.start();
  log('documentation-started');

  const unsub = kernel.eventBus.subscribe(
    '*',
    async (evt: { id: string; type: string; timestamp: string; payload: Record<string, unknown> }) => {
      const payload = evt.payload ?? {};

      // Feed agent.* events into the telemetry runtime
      const type: string = evt.type || '';
      if (
        type.startsWith('agent.') ||
        type.startsWith('workspace.') ||
        type.startsWith('verification.') ||
        type.startsWith('plan.')
      ) {
        const agentId: string = (payload.agentId as string) || (payload.agent as string) || 'system';
        const detail: string = (payload.detail as string) || (payload.message as string) || '';
        const status = type.includes('failed') ? 'failed' : type.includes('completed') ? 'completed' : 'working';
        telemetry.trackOp(
          agentId,
          status as any,
          (payload.operation as any) || 'unknown',
          (payload.task as string) || detail || type,
          {
            filePath: payload.filePath as string,
            progress: (payload.progress as number) ?? 0,
            phase: payload.phase as string,
            detail,
            metadata: payload,
          },
        );
      }

      publish({
        id: evt.id,
        type: evt.type,
        actor: { id: 'system', name: 'System', type: 'system' },
        sessionId: typeof payload.sessionId === 'string' ? payload.sessionId : undefined,
        artifactId: typeof payload.artifactId === 'string' ? payload.artifactId : undefined,
        message: typeof payload.message === 'string' ? payload.message : undefined,
        timestamp: evt.timestamp,
        payload,
      } as any);
    },
  );

  const heartbeat = setInterval(() => {
    publish({
      id: `hb-${Date.now()}`,
      type: 'system.heartbeat',
      actor: { id: 'system', name: 'System', type: 'system' },
      timestamp: new Date().toISOString(),
      message: 'Heartbeat',
      resource: { type: 'system', id: 'events', name: 'Events Server' },
      category: 'system',
      metadata: { repoPath: abs },
    });
  }, 30_000);

  // Workspace UI Tester auto-trigger (continuous-tester) — gated by default so
  // the agent does not run unproductive autonomous work (its OpenCode-provider
  // runs were failing in a loop and consuming resources without producing
  // results). Durable participant; compute released until needed. Re-enable
  // with VESTARA_UI_TESTER_AUTOTRIGGER=1 once the provider is healthy.
  const uiTesterAutotriggerEnabled = process.env.VESTARA_UI_TESTER_AUTOTRIGGER === '1';
  let workspaceUiWatcher: WorkspaceUiWatcher | undefined;

  const onMilestoneUpdate = uiTesterAutotriggerEnabled
    ? (version: string) => {
        try {
          const session = runtime.getSession();
          agentRuntime
            .run('agent-workspace-ui-tester', `Auto-triggered by milestone update: ${version}`, session)
            .catch(() => {});
        } catch {
          // fail silently
        }
      }
    : undefined;

  if (uiTesterAutotriggerEnabled) {
    // Workspace UI Watcher — monitors workspace-ui file changes + milestone updates
    workspaceUiWatcher = new WorkspaceUiWatcher(abs, kernel.eventBus);
    workspaceUiWatcher.start(async (event) => {
      // Trigger the workspace-ui tester agent on file changes or milestone updates
      try {
        const session = runtime.getSession();
        await agentRuntime.run(
          'agent-workspace-ui-tester',
          `Auto-triggered by: ${event.type} — ${event.detail}`,
          session,
        );
      } catch {
        // Tester may fail silently if agent is not available
      }
    });
  } else {
    console.log('[api] UI tester auto-trigger DISABLED (set VESTARA_UI_TESTER_AUTOTRIGGER=1 to enable)');
  }
  log('pre-diagnose');

  const diagnosis = await kernel.diagnose();
  log('kernel-diagnosed');
  if (diagnosis.health.overall === 'unhealthy') {
    await bootRuntime.enterRecovery('Kernel service health verification failed');
    throw new Error('Vestara OS-0 entered recovery: kernel service health verification failed');
  }

  await bootRuntime.advance('health-verified', diagnosis.health.overall);
  await bootRuntime.advance('workspace-ready', session.fingerprint.id);
  log('boot-advanced');

  const context: WorkspaceContext = {
    kernel,
    hostRuntime,
    bootRuntime,
    providerManager,
    routingStore,
    routingAssignments,
    conversationSessions,
    conversationService,
    agentThreadStore,
    agentTools,
    createAgentTools,
    agentEnvironment,
    agentHarness,
    harnessSession,
    runtimeSessionRegistry,
    multiAgentWorkflow,
    activityRoomStreams,
    changeProjector,
    engineeringVerification,
    engineeringEvents,
    evidenceManifests,
    evidenceArtifacts,
    evidenceBundles,
    evidenceBaselines,
    evidenceThumbnails,
    evidencePipeline,
    verifierResults,
    workerSocketServer,
    workerRegistry,
    workerStore,
    workerCluster,
    threadRecovery,
    worktreeRuntime,
    runtime,
    apiRuntime,
    eventBus: kernel.eventBus,
    repoPath: abs,
    workspaceDir,
    db,
    sessions,
    sessionStorage,
    agents,
    plans,
    changeSets,
    verifications,
    collaboration,
    users,
    audit,
    knowledgeGraph,
    memory,
    explainService,
    planningService,
    implementationService,
    verificationService,
    collaborationService,
    agentRuntime,
    agentService,
    capabilityManager,
    orchestrator,
    workflowOrchestrator,
    executionPlanner,
    workspaceAnalyst,
    suggestionService,
    telemetry,
    documentation,
    settings,
    filesystemRuntime,
    marketplace,
    marketplacePublishRoot: marketplaceRoots[0] ?? path.join(abs, '.vestara', 'marketplace'),
    opencodeRuntime: openCodeRuntimeService,
    milestones,
    projects,
    orders,
    publish,
    onMilestoneUpdate,
    workspaceUiWatcher,
    close: async () => {
      clearInterval(heartbeat);
      unsub();
      unsubscribeHarnessBridge();
      unsubscribeActivityRoomBridge();
      unsubscribeEngineeringMemory();
      harnessApprovalBridgeDisposal.dispose();
      workspaceUiWatcher?.stop();
      persistDb(db, dbPath);
      await documentation.dispose();
      await marketplaceManager.shutdown();
      agentThreadStore.close();
      engineeringEvents.close();
      worktreeRuntime.close();
      await runtime.close();
      await kernel.shutdown();
    },
  };

  // Engineering Graph + External Runtime wiring.
  const graphService = new EngineeringGraphService(context);
  context.graphService = graphService;

  const externalRuntimeService = new ExternalRuntimeService({
    ctx: context,
    events: engineeringEvents,
    telemetry,
    graph: graphService,
    workspaceId: session.fingerprint.id,
  });
  externalRuntimeService.start();
  context.externalRuntimeService = externalRuntimeService;

  const { externalRuntimeGraphSource } = await import('./external-runtime/graph-source.js');
  const source = externalRuntimeGraphSource(async () => {
    const instances = externalRuntimeService.listInstances();
    const agents: Record<string, never[]> = {};
    const providers: Record<string, never[]> = {};
    const mcp: Record<string, never[]> = {};
    const plugins: Record<string, never[]> = {};
    const skills: Record<string, never[]> = {};
    const models: Record<string, never[]> = {};
    for (const inst of instances) {
      agents[inst.id] = (await externalRuntimeService.intelligence(inst.id, 'agents').catch(() => [])) as never[];
      providers[inst.id] = (await externalRuntimeService.intelligence(inst.id, 'providers').catch(() => [])) as never[];
      mcp[inst.id] = (await externalRuntimeService.intelligence(inst.id, 'mcp').catch(() => [])) as never[];
      plugins[inst.id] = (await externalRuntimeService.intelligence(inst.id, 'plugins').catch(() => [])) as never[];
      skills[inst.id] = (await externalRuntimeService.intelligence(inst.id, 'skills').catch(() => [])) as never[];
      models[inst.id] = (await externalRuntimeService.intelligence(inst.id, 'models').catch(() => [])) as never[];
    }
    return {
      instances,
      sessions: (await externalRuntimeService.listSessions()) as never[],
      agents,
      providers,
      mcp,
      plugins,
      skills,
      models,
    } as never;
  });
  graphService.addEntitySource(source.entitySource);
  graphService.addRelationshipSource(source.relationshipSource);

  log('context-return');
  return context;
}

function sessionSafeId(runtime: WorkspaceRuntime): string {
  try {
    return runtime.getSession().fingerprint.id;
  } catch {
    return 'workspace-runtime';
  }
}

function gitHeadCommit(repoPath: string): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoPath, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'a'.repeat(40);
  }
}

/**
 * Agent execution resolver for the harness: aligns each agent turn with the
 * provider/model/runtime agent the agent was configured with in the Agent
 * Control modal. Resolution order:
 *   1. the agent's own provider/model/runtimeAgent (Agent Registry);
 *   2. the global routing selection for the agent's role;
 *   3. no override → the harness/runtime default provider/model.
 * The agent is matched by id, runtime agent name, or role so governed
 * workflow stages (which address agents by their OpenCode twin name, e.g.
 * `vestara-planner`) resolve to their stored configuration.
 */
function resolveAgentExecutionFor(agents: AgentStorage, routingStore: FileRoutingStore) {
  return async (input: {
    readonly agentId: string;
  }): Promise<{ providerId?: string; modelId?: string; runtimeAgent?: string } | undefined> => {
    try {
      const stored = await agents.listAgents();
      const agent = stored.find(
        (candidate) =>
          candidate.id === input.agentId ||
          candidate.runtimeAgent === input.agentId ||
          candidate.role === input.agentId,
      );
      if (agent?.model) {
        return {
          providerId: agent.provider || undefined,
          modelId: agent.model,
          runtimeAgent: agent.runtimeAgent || undefined,
        };
      }
      const roles = routingStore.get().selection?.roles as
        | Partial<Record<string, { providerId?: string; modelId?: string }>>
        | undefined;
      const role = agent?.role;
      if (role) {
        const ref = roles?.[normalizeRoutingRole(role)];
        if (ref?.modelId) {
          return { providerId: ref.providerId || undefined, modelId: ref.modelId };
        }
      }
      return undefined;
    } catch {
      return undefined;
    }
  };
}

/** Map agent role names onto the routing-selection role keys. */
function normalizeRoutingRole(role: string): string {
  switch (role) {
    case 'planning':
      return 'planner';
    case 'documenter':
    case 'documentation-agent':
      return 'documentation';
    case 'security-agent':
      return 'reviewer';
    default:
      return role;
  }
}

function runtimeService(runtime: Runtime, version: string): VestaraService {
  return {
    id: runtime.id,
    version,
    get status(): ServiceStatus {
      if (runtime.state === 'created') return 'uninitialized';
      if (runtime.state === 'initializing') return 'initializing';
      if (runtime.state === 'running') return 'running';
      if (runtime.state === 'degraded') return 'degraded';
      if (runtime.state === 'stopping') return 'stopping';
      if (runtime.state === 'stopped') return 'stopped';
      return 'disposed';
    },
    initialize: () => runtime.initialize(),
    start: async () => {},
    stop: () => runtime.stop(),
    health: async () => ({ ...runtime.health, version }),
    dispose: () => runtime.destroy(),
  };
}
