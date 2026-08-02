/**
 * Boots kernel + workspace and opens SQLite stores used by product services.
 * Thin adapter — no product policy beyond wiring.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ActivityLogStore, ActivityService, NotificationService, NotificationStore } from '@vestara/activity-log';
import { BootRuntime, FileBootStateStore } from '@vestara/boot-runtime';
import { WorkspaceConfigurationService } from '@vestara/configuration';
import { SqliteConversationSessionStore } from '@vestara/conversation-runtime';
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
import { type ExtensionPermissionApprover, LocalExtensionManager } from '@vestara/extension-runtime';
import { FilesystemRuntime } from '@vestara/filesystem-runtime';
import { HostRuntime } from '@vestara/host-runtime';
import { DefaultKernel } from '@vestara/kernel';
import { LocalMarketplaceRegistry, type MarketplaceEventSink, MarketplaceService } from '@vestara/marketplace';
import { OpenAIProvider, OpenCodeGoProvider, OpenCodeProvider } from '@vestara/provider-opencode';
import { DefaultProviderManager, FileRoutingAssignmentStore, FileRoutingStore } from '@vestara/provider-runtime';
import type { Runtime } from '@vestara/runtime';
import type { ServiceStatus, VestaraService } from '@vestara/shared';
import { TelemetryRuntime } from '@vestara/telemetry';
import { FileThreadStore } from '@vestara/thread-runtime';
import { FilesystemReadTool, FilesystemSearchTool, FilesystemWriteTool, ToolRuntime } from '@vestara/tool-runtime';
import { GitAddTool, GitCommitTool, GitDiffTool, GitLogTool, GitStatusTool } from '@vestara/tools-git';
import { GovernedShellExecuteTool } from '@vestara/tools-shell';
import type { AgentEnvironment, AgentEnvironmentId } from '@vestara/types';
import { EngineeringVerificationProfiles } from '@vestara/verification';
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
  ImplementationService,
  KnowledgeGraphStorage,
  MemoryService,
  MilestoneService,
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
import { ExternalRuntimeService } from './external-runtime/service';
import { EngineeringGraphService } from './graph/service';
import { restoreProviderConfigurations } from './routes/providers';
import { ApiRuntime } from './runtime/api-runtime';

export interface WorkspaceContext {
  kernel: DefaultKernel;
  hostRuntime: HostRuntime;
  bootRuntime: BootRuntime;
  providerManager: DefaultProviderManager;
  routingStore: FileRoutingStore;
  routingAssignments: FileRoutingAssignmentStore;
  conversationSessions: SqliteConversationSessionStore;
  agentThreadStore: FileThreadStore;
  agentTools: ToolRuntime;
  createAgentTools(workspaceRoot: string): ToolRuntime;
  agentEnvironment: AgentEnvironment;
  engineeringVerification: EngineeringVerificationProfiles;
  engineeringEvents: SqliteEngineeringEventStore;
  graphService?: EngineeringGraphService;
  externalRuntimeService?: ExternalRuntimeService;
  evidenceManifests: ImmutableEvidenceManifestStore;
  evidenceArtifacts: ContentAddressedEvidenceStore;
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
  activityService?: ActivityService;
  notificationService?: NotificationService;
  milestones?: MilestoneService;
  projects?: ProjectService;
  activityStore?: ActivityLogStore;
  telemetry: TelemetryRuntime;
  documentation: DocumentationService;
  settings: WorkspaceConfigurationService;
  filesystemRuntime: FilesystemRuntime;
  marketplace: MarketplaceService;
  users: UserStore;
  audit: AuditStore;
  publish: (event: UiEvent) => void;
  onMilestoneUpdate?: (version: string) => void;
  workspaceUiWatcher?: WorkspaceUiWatcher;
  close: () => Promise<void>;
}

type PublishFn = (event: UiEvent) => void;

async function openSqlDb(dbPath: string): Promise<unknown> {
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

export async function createWorkspaceContext(repoPath: string, publish: PublishFn): Promise<WorkspaceContext> {
  const abs = path.resolve(repoPath);
  const kernel = new DefaultKernel();
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
  const routingStore = new FileRoutingStore(
    path.join(workspaceDir, 'routing.json'),
    { profileId: 'balanced', roles: {} },
    'system',
  );
  const routingAssignments = new FileRoutingAssignmentStore(path.join(workspaceDir, 'routing-assignments.json'));
  const dbPath = path.join(workspaceDir, 'plans', 'plans.db');
  const db = await openSqlDb(dbPath);

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
  // Auto-index knowledge graph on workspace open so the Memory page has data
  memory.index(session).catch((err) => kernel.logger?.warn?.('Knowledge graph index failed', { error: String(err) }));
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
    return tools;
  };
  const agentTools = createAgentTools(abs);

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

  // Initialize activity log for domain event streaming
  const activityStore = new ActivityLogStore({ logger: kernel.logger });
  await activityStore.initialize();
  const activityService = new ActivityService({
    store: activityStore,
    eventBus: kernel.eventBus,
    logger: kernel.logger,
  });
  activityService.start();

  // Initialize notification center — bridges activity events to persistent notifications
  const notificationStore = new NotificationStore({ logger: kernel.logger });
  await notificationStore.initialize();
  const notificationService = new NotificationService({ store: notificationStore, logger: kernel.logger });
  notificationService.start((fn) => activityService.onEvent(fn));

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
      activity: activityService,
    },
  );

  // Create AgentRuntime after telemetry is available.
  // Agents reach the filesystem ONLY through the AgentCapabilityManager.
  const agentRuntime = new AgentRuntime({ storage: agents, provider: opencode, capabilities: capabilityManager });
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
  await documentation.start();

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
        const agentId: string = (payload['agentId'] as string) || (payload['agent'] as string) || 'system';
        const detail: string = (payload['detail'] as string) || (payload['message'] as string) || '';
        const status = type.includes('failed') ? 'failed' : type.includes('completed') ? 'completed' : 'working';
        telemetry.trackOp(
          agentId,
          status as any,
          (payload['operation'] as any) || 'unknown',
          (payload['task'] as string) || detail || type,
          {
            filePath: payload['filePath'] as string,
            progress: (payload['progress'] as number) ?? 0,
            phase: payload['phase'] as string,
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

  // Workspace UI Watcher — monitors workspace-ui file changes + milestone updates
  const workspaceUiWatcher = new WorkspaceUiWatcher(abs, kernel.eventBus);
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

  const onMilestoneUpdate = (version: string) => {
    try {
      const session = runtime.getSession();
      agentRuntime
        .run('agent-workspace-ui-tester', `Auto-triggered by milestone update: ${version}`, session)
        .catch(() => {});
    } catch {
      // fail silently
    }
  };

  const diagnosis = await kernel.diagnose();
  if (diagnosis.health.overall === 'unhealthy') {
    await bootRuntime.enterRecovery('Kernel service health verification failed');
    throw new Error('Vestara OS-0 entered recovery: kernel service health verification failed');
  }
  await bootRuntime.advance('health-verified', diagnosis.health.overall);
  await bootRuntime.advance('workspace-ready', session.fingerprint.id);

  const context: WorkspaceContext = {
    kernel,
    hostRuntime,
    bootRuntime,
    providerManager,
    routingStore,
    routingAssignments,
    conversationSessions,
    agentThreadStore,
    agentTools,
    createAgentTools,
    agentEnvironment,
    engineeringVerification,
    engineeringEvents,
    evidenceManifests,
    evidenceArtifacts,
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
    executionPlanner,
    workspaceAnalyst,
    suggestionService,
    activityService,
    telemetry,
    documentation,
    settings,
    filesystemRuntime,
    marketplace,
    notificationService,
    milestones,
    projects,
    activityStore,
    publish,
    onMilestoneUpdate,
    workspaceUiWatcher,
    close: async () => {
      clearInterval(heartbeat);
      unsub();
      workspaceUiWatcher.stop();
      notificationService?.stop();
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

  return context;
}

function sessionSafeId(runtime: WorkspaceRuntime): string {
  try {
    return runtime.getSession().fingerprint.id;
  } catch {
    return 'workspace-runtime';
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
