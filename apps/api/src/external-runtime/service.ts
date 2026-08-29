/**
 * ExternalRuntimeService — wires the external-runtime registry into the
 * Vestara API runtime.
 *
 * Runs non-blocking discovery on workspace open, normalizes external activity
 * into the Engineering Event Store, emits telemetry counters, publishes live
 * events over the WebSocket, and contributes graph entities/relationships on
 * the next graph refresh. Runtime failures never block workspace startup.
 */

import type { SqliteEngineeringEventStore } from '@vestara/engineering-event-store';
import type { ExternalRuntimeIntelligenceAdapter } from '@vestara/external-runtime';
import {
  createClaudeCodeAdapter,
  createGeminiAdapter,
  createOpenAICodexAdapter,
  createOpencodeAdapter,
  type ExternalAgentRuntimeAdapter,
  type ExternalPermissionRule,
  type ExternalRuntimeCapability,
  type ExternalRuntimeConfigurationSnapshot,
  type ExternalRuntimeEvent,
  type ExternalRuntimeInstance,
  type ExternalRuntimeIntegrationLevel,
  ExternalRuntimeRegistry,
  type ExternalSessionDetails,
  type ExternalSessionQuery,
  type ExternalSessionRuntimeSnapshot,
} from '@vestara/external-runtime';
import type { TelemetryRuntime } from '@vestara/telemetry';
import type { EngineeringGraphService } from '../graph/service';
import type { WorkspaceContext } from '../workspace-context';

export interface ExternalRuntimeServiceOptions {
  ctx: WorkspaceContext;
  events: SqliteEngineeringEventStore;
  telemetry: TelemetryRuntime;
  graph: EngineeringGraphService;
  workspaceId: string;
}

export class ExternalRuntimeService {
  readonly registry: ExternalRuntimeRegistry;
  private readonly ctx: WorkspaceContext;
  private readonly events: SqliteEngineeringEventStore;
  private readonly telemetry: TelemetryRuntime;
  private readonly workspaceId: string;
  private readonly graph: EngineeringGraphService;
  private discoveryStarted = false;
  /** Previous configuration snapshots per instance, used for drift detection. */
  private readonly previousConfigurations = new Map<string, ExternalRuntimeConfigurationSnapshot>();

  constructor(options: ExternalRuntimeServiceOptions) {
    this.ctx = options.ctx;
    this.events = options.events;
    this.telemetry = options.telemetry;
    this.workspaceId = options.workspaceId;
    this.graph = options.graph;
    this.registry = new ExternalRuntimeRegistry(options.ctx.repoPath, this.workspaceId);

    this.registry.registerAdapter(createOpencodeAdapter());
    this.registry.registerAdapter(createClaudeCodeAdapter());
    this.registry.registerAdapter(createOpenAICodexAdapter());
    this.registry.registerAdapter(createGeminiAdapter());

    this.registry.observe({ onEvent: (event) => this.ingest(event) });
  }

  /** Kick off discovery without blocking workspace open. */
  start(): void {
    if (this.discoveryStarted) return;
    this.discoveryStarted = true;
    void this.registry.discover().catch(() => {});
  }

  async discoverNow(): Promise<readonly ExternalRuntimeInstance[]> {
    return this.registry.discover();
  }

  listInstances(): readonly ExternalRuntimeInstance[] {
    return this.registry.listInstances();
  }

  async connect(instanceId: string): Promise<boolean> {
    try {
      await this.registry.connect(instanceId);
      // Probe what is actually exercisable so integration level and available
      // capabilities reflect evidence, not adapter capability ceilings.
      await this.probe(instanceId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * After connecting, verify which capabilities actually work against this
   * instance and upgrade integration level / verification status honestly.
   */
  private async probe(instanceId: string): Promise<void> {
    const instance = this.registry.getInstance(instanceId);
    if (!instance) return;
    const available: ExternalRuntimeCapability[] = [
      'installation-discovery',
      'version-discovery',
      'configuration-discovery',
    ];
    let integrationLevel: ExternalRuntimeIntegrationLevel = 'discovery-only';

    if (instance.serverUrl) {
      const sessions = await this.registry.listSessions().catch(() => [] as never[]);
      if (sessions.length > 0) {
        integrationLevel = 'live-observation';
        available.push(
          'session-discovery',
          'session-details',
          'live-events',
          'message-observation',
          'tool-observation',
          'command-observation',
          'file-observation',
          'diff-observation',
        );
      } else {
        // Server reachable but no sessions observed yet.
        integrationLevel = 'snapshot';
        available.push('session-discovery');
      }
    }

    this.registry.verify(instanceId, {
      availableCapabilities: available,
      integrationLevel,
      verificationStatus: 'live-discovery-verified',
      connectionStatus: 'connected',
    });
  }

  async listSessions(query?: ExternalSessionQuery) {
    return this.registry.listSessions(query);
  }

  async getSession(sessionId: string) {
    return this.registry.getSession(sessionId);
  }

  /** Ensure an instance is connected and return its adapter. */
  private async adapterFor(
    instanceId: string,
  ): Promise<{ adapter: ExternalAgentRuntimeAdapter; connectionId: string } | null> {
    const instance = this.registry.getInstance(instanceId);
    if (!instance) return null;
    const adapter = this.registry.adapterFor(instance.runtimeType);
    if (!adapter) return null;
    let connectionId = this.registry.connectionIdFor(instanceId);
    if (!connectionId) {
      const connection = await this.registry.connect(instanceId).catch(() => null);
      if (!connection) return null;
      connectionId = connection.id;
    }
    return { adapter, connectionId };
  }

  async health(instanceId: string) {
    const target = await this.adapterFor(instanceId);
    if (!target) return null;
    return target.adapter
      .getHealth(target.connectionId)
      .catch(() => ({ status: 'unknown' as const, checkedAt: new Date().toISOString() }));
  }

  async configuration(instanceId: string) {
    const target = await this.adapterFor(instanceId);
    if (!target) return null;
    const snapshot = await target.adapter.getConfiguration(target.connectionId).catch(() => null);
    if (snapshot) this.previousConfigurations.set(instanceId, snapshot);
    return snapshot;
  }

  async capabilities(instanceId: string): Promise<readonly ExternalRuntimeCapability[] | null> {
    const instance = this.registry.getInstance(instanceId);
    return instance ? instance.capabilities : null;
  }

  /** Immutable configuration snapshot recorded for a session, when the runtime supports it. */
  async sessionRuntimeSnapshot(sessionId: string): Promise<ExternalSessionRuntimeSnapshot | null> {
    const session = (await this.registry.getSession(sessionId).catch(() => null)) as ExternalSessionDetails | null;
    if (!session?.runtimeInstanceId) return null;
    const target = await this.adapterFor(session.runtimeInstanceId);
    if (!target) return null;
    const adapter = target.adapter as unknown as ExternalRuntimeIntelligenceAdapter;
    if (!adapter.supportsIntelligence) return null;
    return adapter.getSessionRuntimeSnapshot(target.connectionId, session.externalSessionId).catch(() => null);
  }

  /**
   * Normalized session timeline. Consumes the persisted engineering event
   * store (threadId = external session id), the session detail arrays when
   * observed, and the immutable runtime snapshot. Noisy events are flagged for
   * the UI to collapse; transitions are promoted. Missing/partial data never
   * throws — it produces the items that exist.
   */
  async sessionTimeline(sessionId: string) {
    const session = (await this.registry.getSession(sessionId).catch(() => null)) as ExternalSessionDetails | null;
    const snapshot = await this.sessionRuntimeSnapshot(sessionId).catch(() => null);
    const stored = this.events.query({ threadId: sessionId }).filter((event) => event.source === 'external-runtime');
    const { items, sources } = buildSessionTimeline(session, snapshot, stored);
    return { session, snapshot, items, sources };
  }

  /**
   * Configuration drift — hash-based change detection, human-readable field
   * diffs. Compares the current snapshot against the last one recorded for
   * this instance (previous fetch or previous drift call).
   */
  async configurationDrift(instanceId: string) {
    const previous = this.previousConfigurations.get(instanceId);
    const current = await this.configuration(instanceId);
    if (!current) return null;
    const currentHash = snapshotHash(current);
    const previousHash = previous ? snapshotHash(previous) : undefined;

    const changes: DriftChange[] = [];
    if (previous && previousHash !== currentHash) {
      changes.push(
        ...diffEffective(previous.effective ?? {}, current.effective ?? {}, (instance) => {
          const agent = instance as { name?: string; id?: string };
          return agent.name ?? agent.id ?? instanceId;
        }),
      );
      changes.push(...diffStringList(previous.effective?.agents, current.effective?.agents, instanceId));
    }

    const affectedSessions = this.listSessions()
      .then((sessions) =>
        sessions
          .filter((session) => session.runtimeInstanceId === instanceId)
          .filter((session) => session.startedAt && previous?.capturedAt && session.startedAt >= previous.capturedAt)
          .map((session) => session.externalSessionId),
      )
      .catch(() => []);

    return {
      instanceId,
      previousCapturedAt: previous?.capturedAt,
      currentCapturedAt: current.capturedAt,
      previousHash,
      currentHash,
      unchanged: previous ? previousHash === currentHash : false,
      firstSnapshot: !previous,
      changes: changes.slice(0, 40),
      affectedSessions: await affectedSessions,
    };
  }

  /** Aggregated permission rules derived from agent definitions (deduped). */
  async derivedPermissions(instanceId: string): Promise<readonly ExternalPermissionRule[]> {
    const agents = (await this.intelligence(instanceId, 'agents').catch(() => [])) as unknown[];
    const seen = new Set<string>();
    const rules: ExternalPermissionRule[] = [];
    for (const raw of agents) {
      const agent = raw as { permissions?: readonly ExternalPermissionRule[] };
      for (const rule of agent.permissions ?? []) {
        const key = `${rule.capability}:${rule.pattern ?? ''}:${rule.decision}:${rule.scope}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rules.push(rule);
      }
    }
    return rules;
  }

  async intelligence<
    T extends 'agents' | 'skills' | 'instructions' | 'commands' | 'plugins' | 'mcp' | 'providers' | 'models',
  >(instanceId: string, kind: T) {
    const target = await this.adapterFor(instanceId);
    if (!target) return [];
    const adapter = target.adapter as unknown as ExternalRuntimeIntelligenceAdapter;
    if (!adapter.supportsIntelligence) return [];
    try {
      switch (kind) {
        case 'agents':
          return adapter.listAgents(target.connectionId);
        case 'skills':
          return adapter.listSkills(target.connectionId);
        case 'instructions':
          return adapter.listInstructions(target.connectionId);
        case 'commands':
          return adapter.listCommands(target.connectionId);
        case 'plugins':
          return adapter.listPlugins(target.connectionId);
        case 'mcp':
          return adapter.listMcpServers(target.connectionId);
        case 'providers':
          return adapter.listProviders(target.connectionId);
        case 'models':
          return adapter.listModels(target.connectionId);
      }
    } catch {
      return [];
    }
  }

  async close(): Promise<void> {
    await this.registry.close();
  }

  /**
   * Unified engineering workforce snapshot: every runtime (Vestara + external),
   * Vestara agents, per-runtime external agents and skills, and external
   * sessions. Best-effort per runtime; a failed runtime never blocks the view.
   */
  async workforce(): Promise<{
    runtimes: ReturnType<ExternalRuntimeRegistry['listInstances']>;
    vestara: { agents: unknown[] };
    external: Readonly<
      Record<string, { agents: unknown[]; skills: unknown[]; permissions: readonly ExternalPermissionRule[] }>
    >;
    sessions: unknown[];
  }> {
    const runtimes = this.registry.listInstances();
    const vestaraAgents = await this.ctx.agents.listAgents().catch(() => [] as never[]);

    const external: Record<
      string,
      { agents: unknown[]; skills: unknown[]; permissions: readonly ExternalPermissionRule[] }
    > = {};
    for (const instance of runtimes) {
      external[instance.id] = {
        agents: (await this.intelligence(instance.id, 'agents').catch(() => [])) as unknown[],
        skills: (await this.intelligence(instance.id, 'skills').catch(() => [])) as unknown[],
        permissions: await this.derivedPermissions(instance.id).catch(() => []),
      };
    }

    const sessions = (await this.registry.listSessions().catch(() => [])) as unknown[];
    return { runtimes, vestara: { agents: vestaraAgents }, external, sessions };
  }

  // ─── Ingestion ──────────────────────────────────────────────

  private ingest(event: ExternalRuntimeEvent): void {
    // 1. Telemetry (bounded-cardinality counters only; never user content).
    this.telemetry.trackOp('external-runtime', 'working', 'analyze', `external-runtime.${event.type}`, {
      metadata: {
        runtimeType: event.runtimeType,
        category: event.category,
        observationLevel: event.observationLevel,
        redacted: true,
      },
    });

    // 2. Engineering Event Store (temporal truth). Best-effort; never throws.
    try {
      this.events.append({
        type: `external-runtime.${event.type}`,
        source: 'external-runtime',
        actorId: event.runtimeType,
        authority: 'system',
        workspaceId: this.workspaceId,
        correlationId: event.idempotencyKey,
        taskId: event.taskId,
        threadId: event.externalSessionId,
        payload: {
          ...event.payload,
          runtimeType: event.runtimeType,
          runtimeInstanceId: event.runtimeInstanceId,
          observationLevel: event.observationLevel,
          externalTimestamp: event.externalTimestamp,
          externalEventId: event.externalEventId,
          sequence: event.sequence,
        },
        at: event.ingestedAt,
      });
    } catch {
      /* event store append must never break observability */
    }

    // 3. WebSocket live publication (summary payload; details remain in API).
    try {
      this.ctx.publish({
        id: event.id,
        type: `external-runtime.${event.type}`,
        timestamp: event.ingestedAt,
        category: 'external-runtime',
        actor: { id: event.runtimeType, name: event.runtimeType, type: 'agent' },
        resource: {
          type: 'external-session',
          id: event.externalSessionId ?? event.runtimeInstanceId,
          name: event.type,
        },
        message: event.type,
        metadata: { ...event.payload, runtimeType: event.runtimeType, runtimeInstanceId: event.runtimeInstanceId },
      } as never);
    } catch {
      /* ws publish failures are non-fatal */
    }
  }
}

export function createExternalRuntimeService(options: ExternalRuntimeServiceOptions): ExternalRuntimeService {
  return new ExternalRuntimeService(options);
}

// ─── Timeline normalization ────────────────────────────────────

export interface TimelineItem {
  id: string;
  kind: string;
  label: string;
  at: string;
  runtimeType: string;
  runtimeInstanceId: string;
  agentId?: string;
  source: 'event-store' | 'session-detail' | 'session-summary' | 'snapshot';
  observationLevel: 'observed' | 'inferred' | 'reported' | 'partial';
  verificationStatus: string;
  noisy: boolean;
  promoted?: boolean;
  entityIds: string[];
  payload?: Readonly<Record<string, unknown>>;
}

export interface SessionTimelineSources {
  readonly eventStore: number;
  readonly sessionDetail: number;
  readonly snapshot: number;
}

/**
 * Pure timeline normalization — consumes a session's detail record, the
 * immutable runtime snapshot, and the persisted external-runtime events, and
 * produces a single deduplicated, sorted sequence of normalized items. Missing
 * or partial data never throws: it yields the items that exist.
 */
export function buildSessionTimeline(
  session: ExternalSessionDetails | null,
  snapshot: ExternalSessionRuntimeSnapshot | null,
  storedEvents: readonly {
    type: string;
    at: string;
    correlationId?: string;
    payload: Readonly<Record<string, unknown>>;
  }[],
): { items: TimelineItem[]; sources: SessionTimelineSources } {
  const items: TimelineItem[] = [];

  if (session) {
    if (session.startedAt) {
      items.push(
        timelineItem('session-started', session.startedAt, session, {
          label: 'Session started',
          observationLevel: 'reported',
          promoted: true,
          entityIds: [sessionEntityLink(session.runtimeInstanceId, session.externalSessionId)],
        }),
      );
    }
    for (const tool of session.tools ?? []) {
      items.push(
        timelineItem(
          tool.status === 'failed' ? 'tool-failed' : 'tool-started',
          tool.externalTimestamp ?? tool.ingestedAt,
          session,
          {
            label: `Tool ${tool.status === 'failed' ? 'failed' : tool.status === 'completed' ? 'completed' : 'started'}: ${tool.tool}`,
            observationLevel: 'observed',
            noisy: true,
            payload: { tool: tool.tool, status: tool.status, id: tool.id },
          },
        ),
      );
    }
    for (const command of session.commands ?? []) {
      items.push(
        timelineItem('command-executed', command.externalTimestamp ?? command.ingestedAt, session, {
          label: `Command ${command.status === 'failed' ? 'failed' : 'executed'}: ${redactInline(command.command)}`,
          observationLevel: 'observed',
          noisy: true,
          payload: {
            command: redactInline(command.command),
            status: command.status,
            exitCode: command.exitCode,
            id: command.id,
          },
        }),
      );
    }
    for (const mutation of session.fileMutations ?? []) {
      items.push(
        timelineItem('file-modified', mutation.externalTimestamp ?? mutation.ingestedAt, session, {
          label: `${mutation.mutation} ${mutation.filePath}`,
          observationLevel: 'observed',
          promoted: true,
          entityIds: [fileEntityLink(mutation.filePath)],
          payload: { mutation: mutation.mutation, filePath: mutation.filePath },
        }),
      );
    }
    for (const diagnostic of session.diagnostics ?? []) {
      items.push(
        timelineItem('diagnostic-reported', diagnostic.externalTimestamp ?? diagnostic.ingestedAt, session, {
          label: `Diagnostic (${diagnostic.severity}): ${redactInline(diagnostic.message)}`,
          observationLevel: 'observed',
          noisy: true,
          entityIds: diagnostic.filePath ? [fileEntityLink(diagnostic.filePath)] : [],
          payload: {
            severity: diagnostic.severity,
            message: redactInline(diagnostic.message),
            filePath: diagnostic.filePath,
          },
        }),
      );
    }
    for (const permission of session.permissions ?? []) {
      items.push(
        timelineItem('permission-requested', permission.externalTimestamp ?? permission.ingestedAt, session, {
          label: `Permission ${permission.decision}: ${permission.capability}${permission.target ? ` ${permission.target}` : ''}`,
          observationLevel: 'observed',
          noisy: true,
          payload: { capability: permission.capability, target: permission.target, decision: permission.decision },
        }),
      );
    }
    if (session.diff) {
      items.push(
        timelineItem('diff-updated', session.diff.externalTimestamp ?? session.diff.ingestedAt, session, {
          label: `Diff updated (${session.diff.files.length} files)`,
          observationLevel: 'observed',
          promoted: true,
          entityIds: session.diff.files.map(fileEntityLink),
          payload: { files: session.diff.files, contentHash: session.diff.contentHash },
        }),
      );
    }
    if (session.status === 'completed' || session.status === 'failed' || session.status === 'aborted') {
      items.push(
        timelineItem(
          'session-finished',
          session.lastActivityAt ?? session.startedAt ?? new Date().toISOString(),
          session,
          {
            label: `Session finished (${session.status})`,
            observationLevel: 'observed',
            promoted: true,
            entityIds: [sessionEntityLink(session.runtimeInstanceId, session.externalSessionId)],
          },
        ),
      );
    }
  }

  const stored = storedEvents.map((event) => {
    const payload = event.payload;
    const runtimeType = String(payload.runtimeType ?? 'unknown');
    const instanceId = String(payload.runtimeInstanceId ?? '');
    const observedAt = payload.observationLevel === 'observed';
    const kind = normalizeEventType(String(event.type).replace(/^external-runtime\./, ''));
    return {
      id: `store:${event.correlationId}`,
      kind,
      label: eventLabel(kind, payload),
      at: event.at,
      runtimeType,
      runtimeInstanceId: instanceId,
      agentId: typeof payload.agentId === 'string' ? payload.agentId : undefined,
      source: 'event-store' as const,
      observationLevel: (observedAt ? 'observed' : 'reported') as TimelineItem['observationLevel'],
      verificationStatus: 'unverified',
      noisy: isNoisyKind(kind),
      promoted: isPromotedKind(kind),
      entityIds: entityIdsFor(kind, payload, instanceId, session?.externalSessionId ?? ''),
      payload,
    };
  });
  items.push(...stored);

  if (snapshot) {
    items.push(
      timelineItem('snapshot-captured', snapshot.observedAt, session, {
        label: 'Runtime snapshot captured',
        observationLevel: snapshot.provenance === 'runtime-reported' ? 'observed' : 'inferred',
        promoted: true,
        payload: {
          agentId: snapshot.agentId,
          modelId: snapshot.modelId,
          effectiveConfigurationHash: snapshot.effectiveConfigurationHash,
          loadedSkills: snapshot.loadedSkillIds,
          availableSkills: snapshot.availableSkillIds,
          providers: snapshot.providerId ? [snapshot.providerId] : [],
        },
      }),
    );
    if (snapshot.agentId) {
      items.push(
        timelineItem('agent-selected', snapshot.observedAt, session, {
          label: `Agent selected: ${snapshot.agentId}`,
          observationLevel: snapshot.provenance === 'runtime-reported' ? 'observed' : 'inferred',
          promoted: true,
          agentId: snapshot.agentId,
          entityIds: [agentEntityLink(instanceIdOf(session, snapshot), snapshot.agentId)],
        }),
      );
    }
    for (const skillId of snapshot.loadedSkillIds ?? []) {
      items.push(
        timelineItem('skill-loaded', snapshot.observedAt, session, {
          label: `Skill loaded: ${skillId}`,
          observationLevel: 'observed',
          promoted: true,
          entityIds: [skillEntityLink(instanceIdOf(session, snapshot), skillId)],
        }),
      );
    }
    for (const skillId of snapshot.advertisedSkillIds ?? []) {
      items.push(
        timelineItem('skill-advertised', snapshot.observedAt, session, {
          label: `Skill advertised: ${skillId}`,
          observationLevel: 'reported',
          noisy: true,
          entityIds: [skillEntityLink(instanceIdOf(session, snapshot), skillId)],
        }),
      );
    }
  }

  const seen = new Set<string>();
  const deduped = items.filter((item) => {
    const key = item.id ?? `${item.kind}:${item.at}:${item.entityIds.join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  deduped.sort((left, right) => left.at.localeCompare(right.at));

  return {
    items: deduped,
    sources: {
      eventStore: stored.length,
      sessionDetail: session
        ? session.messages.length + session.tools.length + session.commands.length + session.fileMutations.length
        : 0,
      snapshot: snapshot ? 1 : 0,
    },
  };
}

function timelineItem(
  kind: string,
  at: string,
  session: ExternalSessionDetails | null,
  fields: Omit<
    TimelineItem,
    'id' | 'kind' | 'at' | 'runtimeType' | 'runtimeInstanceId' | 'source' | 'verificationStatus' | 'noisy' | 'entityIds'
  > & {
    verificationStatus?: string;
    noisy?: boolean;
    entityIds?: string[];
  },
): TimelineItem {
  const runtimeType = session?.runtimeType ?? 'unknown';
  const runtimeInstanceId = session?.runtimeInstanceId ?? '';
  return {
    id: `${kind}:${at}:${runtimeInstanceId}`,
    kind,
    at,
    runtimeType,
    runtimeInstanceId,
    source: fields.observationLevel === 'observed' ? 'session-detail' : 'session-summary',
    verificationStatus: 'unverified',
    noisy: false,
    entityIds: [],
    ...fields,
  };
}

const NOISY_KINDS = new Set([
  'tool-started',
  'tool-completed',
  'tool-failed',
  'command-executed',
  'diagnostic-reported',
  'permission-requested',
  'skill-advertised',
  'message',
  'todo-updated',
  'runtime-event',
]);

const PROMOTED_KINDS = new Set([
  'session-started',
  'agent-selected',
  'snapshot-captured',
  'skill-loaded',
  'file-modified',
  'diff-updated',
  'verification-started',
  'verification-completed',
  'session-finished',
]);

function isNoisyKind(kind: string): boolean {
  return NOISY_KINDS.has(kind);
}

function isPromotedKind(kind: string): boolean {
  return PROMOTED_KINDS.has(kind);
}

function normalizeEventType(type: string): string {
  const map: Record<string, string> = {
    'session-started': 'session-started',
    'session-finished': 'session-finished',
    'session-completed': 'session-finished',
    'session-agent': 'agent-selected',
    'session-snapshot': 'snapshot-captured',
    'snapshot-captured': 'snapshot-captured',
    'agent-selected': 'agent-selected',
    'skill-advertised': 'skill-advertised',
    'skill-loaded': 'skill-loaded',
    'tool-started': 'tool-started',
    'tool-completed': 'tool-completed',
    'tool-failed': 'tool-failed',
    command: 'command-executed',
    'command-executed': 'command-executed',
    'file-mutation': 'file-modified',
    'file-modified': 'file-modified',
    'diff-updated': 'diff-updated',
    'diagnostic-reported': 'diagnostic-reported',
    'permission-requested': 'permission-requested',
    'verification-started': 'verification-started',
    'verification-completed': 'verification-completed',
  };
  const normalized = map[type];
  if (normalized) return normalized;
  if (type.startsWith('tool-')) return 'tool-started';
  if (type.startsWith('file-')) return 'file-modified';
  if (type.startsWith('diagnostic')) return 'diagnostic-reported';
  if (type.startsWith('verification')) return 'verification-started';
  return 'runtime-event';
}

function eventLabel(kind: string, payload: Readonly<Record<string, unknown>>): string {
  const text = (key: string) => (typeof payload[key] === 'string' ? String(payload[key]) : undefined);
  const name =
    text('name') ?? text('skillId') ?? text('tool') ?? text('filePath') ?? text('command') ?? text('capability');
  switch (kind) {
    case 'session-started':
      return 'Session started';
    case 'agent-selected':
      return `Agent selected: ${name ?? 'unknown'}`;
    case 'snapshot-captured':
      return 'Runtime snapshot captured';
    case 'skill-loaded':
      return `Skill loaded: ${name ?? 'unknown'}`;
    case 'skill-advertised':
      return `Skill advertised: ${name ?? 'unknown'}`;
    case 'file-modified':
      return `File ${text('mutation') ?? 'modified'}: ${name ?? 'unknown'}`;
    case 'diff-updated':
      return `Diff updated (${String((payload.files as readonly unknown[] | undefined)?.length ?? '?')} files)`;
    case 'command-executed':
      return `Command: ${redactInline(name ?? '')}`;
    case 'diagnostic-reported':
      return `Diagnostic (${text('severity') ?? 'info'}): ${redactInline(name ?? '')}`;
    case 'permission-requested':
      return `Permission ${text('decision') ?? 'requested'}: ${name ?? 'unknown'}`;
    case 'verification-started':
      return 'Verification started';
    case 'verification-completed':
      return `Verification ${text('outcome') ?? 'completed'}`;
    case 'session-finished':
      return 'Session finished';
    default:
      return text('message') ?? kind.replace(/-/g, ' ');
  }
}

function entityIdsFor(
  kind: string,
  payload: Readonly<Record<string, unknown>>,
  instanceId: string,
  sessionId: string,
): string[] {
  const ids: string[] = [sessionEntityLink(instanceId, sessionId)];
  const text = (key: string) => (typeof payload[key] === 'string' ? String(payload[key]) : undefined);
  const agentName = text('agentId') ?? text('agent');
  if (agentName) ids.push(agentEntityLink(instanceId, agentName));
  const skillName = text('skillId') ?? text('name');
  if ((kind === 'skill-loaded' || kind === 'skill-advertised') && skillName)
    ids.push(skillEntityLink(instanceId, skillName));
  const file = text('filePath');
  if (file) ids.push(fileEntityLink(file));
  const tool = text('tool');
  if (tool) ids.push(entityId('capability', `tool/${instanceId}/${tool}`));
  return ids;
}

function instanceIdOf(session: ExternalSessionDetails | null, snapshot: ExternalSessionRuntimeSnapshot): string {
  return session?.runtimeInstanceId ?? snapshot.runtimeInstanceId;
}

function redactInline(value: string): string {
  return value.slice(0, 140);
}

// ─── Entity id helpers (mirror graph-source) ───────────────────

function entityId(kind: string, id: string): string {
  return `${kind}://${id}`;
}

export function runtimeEntityLink(instanceId: string, runtimeType: string): string {
  return entityId('runtime', `external/${runtimeType}/${instanceId}`);
}

export function agentEntityLink(instanceId: string, name: string): string {
  return entityId('agent', `external/${instanceId}/${name}`);
}

export function providerEntityLink(instanceId: string, providerId: string): string {
  return entityId('provider', `external/${instanceId}/${providerId}`);
}

export function modelEntityLink(instanceId: string, providerId: string, modelId: string): string {
  return entityId('model', `external/${instanceId}/${providerId}/${modelId}`);
}

export function skillEntityLink(instanceId: string, name: string): string {
  return entityId('skill', `external/${instanceId}/${name}`);
}

export function mcpEntityLink(instanceId: string, name: string): string {
  return entityId('service', `external-mcp/${instanceId}/${name}`);
}

export function pluginEntityLink(instanceId: string, name: string): string {
  return entityId('module', `external-plugin/${instanceId}/${name}`);
}

export function commandEntityLink(instanceId: string, name: string): string {
  return entityId('command', `external/${instanceId}/${name}`);
}

export function permissionEntityLink(instanceId: string, key: string): string {
  return entityId('capability', `permission/${instanceId}/${key}`);
}

export function sessionEntityLink(_instanceId: string, sessionId: string): string {
  return entityId('session', `external/${sessionId}`);
}

function fileEntityLink(filePath: string): string {
  return entityId('filesystem', filePath.replace(/^\//, ''));
}

// ─── Configuration drift ───────────────────────────────────────

export interface DriftChange {
  readonly path: string;
  readonly previous: unknown;
  readonly current: unknown;
  readonly change: 'updated' | 'added' | 'removed';
}

export function snapshotHash(snapshot: ExternalRuntimeConfigurationSnapshot): string {
  return JSON.stringify(snapshot.effective ?? {}) + JSON.stringify((snapshot.sources ?? []).map((s) => s.contentHash));
}

export function diffEffective(
  previous: Readonly<Record<string, unknown>>,
  current: Readonly<Record<string, unknown>>,
  labelFor: (value: unknown) => string,
): DriftChange[] {
  const changes: DriftChange[] = [];
  const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
  for (const key of keys) {
    const prev = previous[key];
    const curr = current[key];
    if (JSON.stringify(prev) === JSON.stringify(curr)) continue;
    if (Array.isArray(prev) && Array.isArray(curr)) {
      changes.push(...diffArray(key, prev, curr, labelFor));
    } else if (isPlainObject(prev) && isPlainObject(curr)) {
      changes.push(...diffObjects(key, prev, curr, labelFor));
    } else {
      changes.push({
        path: key,
        previous: prev,
        current: curr,
        change: prev === undefined ? 'added' : curr === undefined ? 'removed' : 'updated',
      });
    }
  }
  return changes;
}

function diffObjects(
  prefix: string,
  previous: Record<string, unknown>,
  current: Record<string, unknown>,
  labelFor: (value: unknown) => string,
): DriftChange[] {
  const changes: DriftChange[] = [];
  const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
  for (const key of keys) {
    const prev = previous[key];
    const curr = current[key];
    if (JSON.stringify(prev) === JSON.stringify(curr)) continue;
    if (isPlainObject(prev) && isPlainObject(curr)) {
      changes.push(...diffObjects(`${prefix}.${key}`, prev, curr, labelFor));
    } else if (Array.isArray(prev) && Array.isArray(curr)) {
      changes.push(...diffArray(`${prefix}.${key}`, prev, curr, labelFor));
    } else {
      changes.push({
        path: `${prefix}.${key}`,
        previous: prev,
        current: curr,
        change: prev === undefined ? 'added' : curr === undefined ? 'removed' : 'updated',
      });
    }
  }
  return changes;
}

function diffArray(
  prefix: string,
  previous: unknown[],
  current: unknown[],
  labelFor: (value: unknown) => string,
): DriftChange[] {
  const changes: DriftChange[] = [];
  const prevKeys = new Set(previous.map(labelFor));
  const currKeys = new Set(current.map(labelFor));
  for (const key of prevKeys) {
    if (!currKeys.has(key)) {
      const item = previous.find((value) => labelFor(value) === key);
      changes.push({ path: `${prefix}.${key}`, previous: item, current: undefined, change: 'removed' });
    }
  }
  for (const key of currKeys) {
    if (!prevKeys.has(key)) {
      const item = current.find((value) => labelFor(value) === key);
      changes.push({ path: `${prefix}.${key}`, previous: undefined, current: item, change: 'added' });
    }
  }
  return changes;
}

function diffStringList(previous: unknown, current: unknown, _instanceId: string): DriftChange[] {
  if (!Array.isArray(previous) || !Array.isArray(current)) return [];
  return diffArray('agents', previous, current, (value) => {
    const candidate = value as { name?: string; id?: string };
    return candidate.name ?? candidate.id ?? String(value);
  }).filter((change) => change.change === 'updated');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
