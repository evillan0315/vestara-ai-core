/**
 * Boots kernel + workspace and opens SQLite stores used by product services.
 * Thin adapter — no product policy beyond wiring.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ActivityLogStore, ActivityService } from '@vestara/activity-log';
import type { EventBus } from '@vestara/event-bus';
import type { WorkspaceEvent as UiEvent } from '@vestara/events';
import { DefaultKernel } from '@vestara/kernel';
import { OpenCodeProvider } from '@vestara/provider-opencode';
import { DefaultProviderManager } from '@vestara/provider-runtime';
import {
  AgentRuntime,
  AgentService,
  AgentStorage,
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
  VerificationService,
  VerificationStorage,
  WorkspaceAnalyst,
  WorkspaceRuntime,
  WorkspaceUiWatcher,
} from '@vestara/workspace';
import { ApiRuntime } from './runtime/api-runtime';

export interface WorkspaceContext {
  kernel: DefaultKernel;
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
  orchestrator: SessionOrchestrator;
  executionPlanner: ExecutionPlanner;
  workspaceAnalyst: WorkspaceAnalyst;
  suggestionService: SuggestionService;
  activityService?: ActivityService;
  milestones?: MilestoneService;
  projects?: ProjectService;
  activityStore?: ActivityLogStore;
  publish: (event: UiEvent) => void;
  onMilestoneUpdate?: (version: string) => void;
  workspaceUiWatcher?: WorkspaceUiWatcher;
  close: () => Promise<void>;
}

type PublishFn = (event: UiEvent) => void;

async function openSqlDb(dbPath: string): Promise<unknown> {
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
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
    origExec(sql);
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
  const providerManager = new DefaultProviderManager();
  const opencode = new OpenCodeProvider();
  await providerManager.register(opencode);
  await kernel.boot({
    providers: [{ manager: providerManager, providerId: 'opencode' }],
  });

  const runtime = new WorkspaceRuntime({
    logger: kernel.logger,
    eventBus: kernel.eventBus,
    provider: opencode,
  });

  await runtime.open(abs);
  const session = runtime.getSession();
  const workspaceDir = session.workspaceDir;
  const dbPath = path.join(workspaceDir, 'plans', 'plans.db');
  const db = await openSqlDb(dbPath);

  const sessionStorage = new SessionStorage(db);
  const agents = new AgentStorage(db);
  const plans = new PlanStorage(db);
  const changeSets = new ChangeSetStorage(db);
  const verifications = new VerificationStorage(db);
  const collaboration = new CollaborationStorage(db);
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
  const implementationService = new ImplementationService({
    planStorage: plans,
    csStorage: changeSets,
    provider: opencode,
  });
  const verificationService = new VerificationService({
    csStorage: changeSets,
    vrStorage: verifications,
    planStorage: plans,
  });
  const collaborationService = new CollaborationService({ storage: collaboration });
  const agentRuntime = new AgentRuntime({ storage: agents, provider: opencode });
  const agentService = new AgentService({ storage: agents, runtime: agentRuntime, eventBus: kernel.eventBus });
  const orchestrator = new SessionOrchestrator({ storage: agents, runtime: agentRuntime });
  const executionPlanner = new ExecutionPlanner(agents);
  const workspaceAnalyst = new WorkspaceAnalyst(agents, opencode);
  const suggestionService = new SuggestionService({ planStorage: plans, provider: opencode, executionPlanner });

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

  const unsub = kernel.eventBus.subscribe(
    '*',
    async (evt: { id: string; type: string; timestamp: string; payload: Record<string, unknown> }) => {
      const payload = evt.payload ?? {};
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

  return {
    kernel,
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
    knowledgeGraph,
    memory,
    explainService,
    planningService,
    implementationService,
    verificationService,
    collaborationService,
    agentRuntime,
    agentService,
    orchestrator,
    executionPlanner,
    workspaceAnalyst,
    suggestionService,
    activityService,
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
      persistDb(db, dbPath);
      await runtime.close();
      await kernel.shutdown();
    },
  };
}
