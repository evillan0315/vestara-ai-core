/**
 * EngineeringGraphService — wires the @vestara/engineering-graph platform
 * package to the live workspace services.
 *
 * Each workspace module contributes an entity source (nodes) and a
 * relationship source (edges). The registry owns hydration; modules do not
 * own relationships. The built graph is cached with a short TTL.
 */

import { projectDocumentationGraph } from '@vestara/documentation';
import type {
  GraphDiff,
  GraphEntity,
  GraphEvent,
  GraphHealth,
  GraphInsight,
  GraphQuery,
  GraphRelationship,
  GraphSnapshot,
  GraphState,
  GraphStats,
} from '@vestara/engineering-graph';
import {
  diffStates,
  EngineeringEventStore,
  type EngineeringGraph,
  EntityRegistry,
  entityId,
  executeGraphQuery,
  idOf,
} from '@vestara/engineering-graph';
import { buildDocTree } from '../routes/docs';
import type { WorkspaceContext } from '../workspace-context';

const TTL_MS = 15_000;

export interface GraphTimelineEntry {
  id: string;
  timestamp: string;
  type: string;
  actor: string;
  message: string;
  reason: 'connected' | 'actor' | 'mentions';
}

export class EngineeringGraphService {
  private registry = new EntityRegistry();
  private store = new EngineeringEventStore();
  private lastRefresh = 0;
  private readonly repoPath: string;

  constructor(private readonly ctx: WorkspaceContext) {
    this.repoPath = ctx.repoPath;
    this.registerSources();
  }

  /** Optional hook for modules (e.g. external runtime) to contribute sources. */
  registerExternalRuntimeSource?: () => void;

  /** External modules register entity/relationship sources here. */
  addEntitySource(source: Parameters<EntityRegistry['registerEntitySource']>[0]): void {
    this.registry.registerEntitySource(source);
  }

  addRelationshipSource(source: Parameters<EntityRegistry['registerRelationshipSource']>[0]): void {
    this.registry.registerRelationshipSource(source);
  }

  private registerSources(): void {
    this.registerExternalRuntimeSource?.();
    this.registry.registerEntitySource({
      kind: 'repository',
      priority: 0,
      collect: () => [
        {
          id: entityId('repository', this.repoName()),
          kind: 'repository',
          label: this.repoName(),
          description: this.repoPath,
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    this.registry.registerEntitySource({
      kind: 'project',
      priority: 10,
      collect: async () => {
        const projects = (await this.ctx.projects?.listProjects().catch(() => [])) ?? [];
        return projects.map((p: any) => ({
          id: entityId('project', p.id),
          kind: 'project' as const,
          label: p.name ?? p.id,
          status: p.status,
          description: p.description,
          updatedAt: p.updatedAt,
          meta: { created: p.createdAt },
        }));
      },
    });

    this.registry.registerEntitySource({
      kind: 'plan',
      priority: 10,
      collect: async () => {
        const plans = await this.ctx.plans.list(this.ctx.runtime.getSession().fingerprint.id).catch(() => [] as any[]);
        const out: GraphEntity[] = [];
        for (const p of plans) {
          out.push({
            id: entityId('plan', p.id),
            kind: 'plan',
            label: p.title || p.goal || p.id,
            status: p.status,
            description: p.goal,
            updatedAt: p.updatedAt,
            tags: ['plan'],
            meta: { tasks: (p.tasks ?? []).length },
          });
          for (const t of p.tasks ?? []) {
            out.push({
              id: entityId('task', `${p.id}:${t.id}`),
              kind: 'task',
              label: t.summary || t.id,
              status: t.status,
              tags: ['task'],
              meta: { planId: p.id, effort: t.effort },
            });
          }
        }
        return out;
      },
    });

    this.registry.registerEntitySource({
      kind: 'agent',
      priority: 10,
      collect: async () => {
        const agents = await this.ctx.agents.listAgents().catch(() => [] as any[]);
        const states = this.ctx.telemetry.getAllAgents();
        const byId = new Map(states.map((s) => [s.id, s]));
        const out: GraphEntity[] = [];
        for (const a of agents) {
          const live = byId.get(a.id);
          out.push({
            id: entityId('agent', a.id),
            kind: 'agent',
            label: a.name ?? a.id,
            status: live?.status ?? a.status,
            owner: 'agent',
            description: a.description,
            tags: ['agent'],
            meta: { role: a.role, currentTask: live?.currentTask },
          });
        }
        return out;
      },
    });

    this.registry.registerEntitySource({
      kind: 'execution',
      priority: 20,
      collect: async () => {
        const executions = await this.ctx.agents.listExecutions().catch(() => [] as any[]);
        return executions.map((e: any) => ({
          id: entityId('execution', e.id),
          kind: 'execution' as const,
          label: e.task || e.id,
          status: e.status,
          owner: e.agentId,
          updatedAt: e.completedAt ?? e.startedAt,
          meta: {
            agentId: e.agentId,
            inputArtifacts: e.inputArtifacts?.length ?? 0,
            outputArtifacts: e.outputArtifacts?.length ?? 0,
          },
        }));
      },
    });

    this.registry.registerEntitySource({
      kind: 'session',
      priority: 20,
      collect: async () => {
        const sessions = await this.ctx.agents.listExecutionSessions().catch(() => [] as any[]);
        return sessions.map((s: any) => ({
          id: entityId('session', s.id),
          kind: 'session' as const,
          label: s.goal || s.id,
          status: s.status,
          updatedAt: s.completedAt ?? s.createdAt,
          meta: { steps: s.timeline?.length ?? 0, approvals: s.approvals?.length ?? 0, planIds: s.planIds },
        }));
      },
    });

    this.registry.registerEntitySource({
      kind: 'artifact',
      priority: 20,
      collect: async () => {
        const fingerprintId = this.ctx.runtime.getSession().fingerprint.id;
        const [changeSets, verifications, collab] = await Promise.all([
          this.ctx.changeSets.listByWorkspace(fingerprintId).catch(() => [] as any[]),
          this.ctx.verifications.listByWorkspace(fingerprintId).catch(() => [] as any[]),
          this.ctx.collaboration.listByWorkspace(fingerprintId).catch(() => [] as any[]),
        ]);
        const out: GraphEntity[] = changeSets.map((cs: any) => ({
          id: entityId('artifact', `changeset/${cs.id}`),
          kind: 'artifact' as const,
          label: `ChangeSet ${cs.id}`,
          status: cs.status,
          updatedAt: cs.updatedAt,
          meta: { planId: cs.planId, files: cs.files?.length ?? 0 },
        }));
        for (const v of verifications) {
          out.push({
            id: entityId('verification', v.id),
            kind: 'verification',
            label: `Verification ${v.id}`,
            status: v.status,
            updatedAt: v.createdAt,
            meta: { changeSetId: (v as any).changeSetId, checks: (v as any).checks?.length ?? 0 },
          });
        }
        for (const r of collab) {
          out.push({
            id: entityId('review', r.id),
            kind: 'review',
            label: `Review ${(r as any).changeSetId ?? r.id}`,
            status: r.status,
            updatedAt: r.updatedAt,
            meta: { planId: (r as any).planId, changeSetId: (r as any).changeSetId },
          });
        }
        return out;
      },
    });

    this.registry.registerEntitySource({
      kind: 'document',
      priority: 20,
      collect: () => {
        const { roots, files } = buildDocTree(this.repoPath);
        void roots;
        const seen = new Set<string>();
        const out: GraphEntity[] = [];
        for (const file of files) {
          if (seen.has(file)) continue;
          seen.add(file);
          out.push({
            id: entityId('document', file),
            kind: 'document',
            label: file,
            updatedAt: new Date().toISOString(),
            meta: { path: file },
          });
        }
        return out;
      },
    });

    this.registry.registerEntitySource({
      kind: 'file',
      priority: 30,
      collect: async () => {
        const plans = await this.ctx.plans.list(this.ctx.runtime.getSession().fingerprint.id).catch(() => [] as any[]);
        const fingerprintId = this.ctx.runtime.getSession().fingerprint.id;
        const changeSets = await this.ctx.changeSets.listByWorkspace(fingerprintId).catch(() => [] as any[]);
        const seen = new Set<string>();
        const out: GraphEntity[] = [];
        for (const p of plans) {
          for (const t of p.tasks ?? []) for (const f of t.files ?? []) this.pushFile(out, seen, f);
        }
        for (const cs of changeSets) {
          for (const f of cs.files ?? []) {
            if (typeof f === 'string') this.pushFile(out, seen, f);
            else if (f && typeof f.path === 'string') this.pushFile(out, seen, f.path);
          }
        }
        return out;
      },
    });

    this.registry.registerEntitySource({
      kind: 'capability',
      priority: 30,
      collect: () => {
        const seen = new Set<string>();
        const out: GraphEntity[] = [];
        for (const e of this.ctx.telemetry.getEvents(400)) {
          const key = `${e.agent}/${e.operation}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            id: entityId('capability', key),
            kind: 'capability',
            label: `${e.operation}`,
            owner: e.agent,
            status: e.status,
            meta: { agent: e.agent, filePath: e.filePath },
          });
        }
        return out;
      },
    });

    this.registry.registerEntitySource({
      kind: 'event',
      priority: 40,
      collect: () => {
        const events = this.ctx.telemetry.getEvents(300);
        return events.slice(0, 200).map((e, i) => ({
          id: entityId('event', `tel-${i}-${e.agent}-${e.timestamp}`),
          kind: 'event' as const,
          label: `${e.agent} ${e.operation}`,
          status: e.status,
          owner: e.agent,
          updatedAt: e.timestamp,
          description: e.task || e.detail,
          meta: { filePath: e.filePath },
        }));
      },
    });

    // ── Relationship sources ─────────────────────────────────
    this.registry.registerEntitySource({
      kind: 'documentation-plan',
      priority: 25,
      collect: async () => {
        const inventory = this.ctx.documentation.getInventory() ?? (await this.ctx.documentation.scan());
        return [
          ...projectDocumentationGraph(
            inventory,
            this.ctx.documentation.listPlans(),
            this.ctx.documentation.listProposals(),
          ).entities,
        ];
      },
    });

    this.registry.registerRelationshipSource({
      collect: async () => {
        const rels: GraphRelationship[] = [];
        const repo = entityId('repository', this.repoName());

        const plans = await this.ctx.plans.list(this.ctx.runtime.getSession().fingerprint.id).catch(() => [] as any[]);
        const planIds = new Map(plans.map((p: any) => [p.id, p]));

        // repository → plans, docs → repository, doc contains doc.
        for (const p of plans) {
          rels.push({ from: repo, to: entityId('plan', p.id), type: 'owns', label: 'plan' });
        }
        const docEntities = this.registry.entitiesByKind('document');
        for (const d of docEntities) {
          const path = idOf(d.id) ?? '';
          rels.push({ from: d.id, to: repo, type: 'documents' });
          const slash = path.lastIndexOf('/');
          if (slash > 0) {
            const parent = docEntities.find((x) => idOf(x.id) === path.slice(0, slash));
            if (parent) rels.push({ from: parent.id, to: d.id, type: 'contains' });
          }
        }

        // plan contains task; task depends-on task; task touches-file file.
        for (const p of plans) {
          for (const t of p.tasks ?? []) {
            const taskId = entityId('task', `${p.id}:${t.id}`);
            rels.push({ from: entityId('plan', p.id), to: taskId, type: 'contains' });
            for (const dep of t.dependencies ?? []) {
              rels.push({ from: taskId, to: entityId('task', `${p.id}:${dep}`), type: 'depends-on' });
            }
            for (const f of t.files ?? []) {
              rels.push({ from: taskId, to: entityId('file', f), type: 'touches-file', weight: 1 });
            }
          }
        }

        // files → package (derived from path heuristics).
        for (const file of this.registry.entitiesByKind('file')) {
          const path = idOf(file.id) ?? '';
          const pkg = this.packageOf(path);
          if (pkg) {
            rels.push({ from: entityId('file', path), to: entityId('package', pkg), type: 'belongs-to' });
            rels.push({ from: entityId('package', pkg), to: repo, type: 'belongs-to' });
          } else {
            rels.push({ from: entityId('file', path), to: repo, type: 'belongs-to' });
          }
        }

        // sessions reference plans; timeline agents execute.
        const sessions = await this.ctx.agents.listExecutionSessions().catch(() => [] as any[]);
        for (const s of sessions) {
          const sessionId = entityId('session', s.id);
          for (const planId of s.planIds ?? []) {
            if (planIds.has(planId)) rels.push({ from: sessionId, to: entityId('plan', planId), type: 'references' });
          }
          for (const step of s.timeline ?? []) {
            if (step.agentId) {
              rels.push({
                from: sessionId,
                to: entityId('agent', step.agentId),
                type: 'executes',
                timestamp: step.timestamp,
              });
            }
          }
          for (const a of s.approvals ?? []) {
            rels.push({
              from: entityId('approval', `${s.id}/${a.agentId}`),
              to: sessionId,
              type: 'approves',
              timestamp: a.timestamp,
            });
          }
        }

        // agent executes execution; execution uses-capability capability.
        const executions = await this.ctx.agents.listExecutions().catch(() => [] as any[]);
        for (const e of executions) {
          const execId = entityId('execution', e.id);
          rels.push({ from: entityId('agent', e.agentId), to: execId, type: 'executes', timestamp: e.startedAt });
          rels.push({ from: execId, to: entityId('capability', `${e.agentId}/analyze`), type: 'uses-capability' });
        }

        // capabilities touch files.
        for (const cap of this.registry.entitiesByKind('capability')) {
          const filePath = (cap.meta?.filePath as string) ?? '';
          if (filePath) rels.push({ from: cap.id, to: entityId('file', filePath), type: 'touches-file', weight: 1 });
        }

        // artifacts: changeSet produced by plan; verification verifies changeSet; review reviews.
        const fingerprintId = this.ctx.runtime.getSession().fingerprint.id;
        const [changeSets, verifications, collab] = await Promise.all([
          this.ctx.changeSets.listByWorkspace(fingerprintId).catch(() => [] as any[]),
          this.ctx.verifications.listByWorkspace(fingerprintId).catch(() => [] as any[]),
          this.ctx.collaboration.listByWorkspace(fingerprintId).catch(() => [] as any[]),
        ]);
        for (const cs of changeSets) {
          const csId = entityId('artifact', `changeset/${cs.id}`);
          if (cs.planId && planIds.has(cs.planId))
            rels.push({ from: entityId('plan', cs.planId), to: csId, type: 'produced-artifact' });
          for (const f of cs.files ?? []) {
            const filePath = typeof f === 'string' ? f : f?.path;
            if (filePath) rels.push({ from: csId, to: entityId('file', filePath), type: 'touches-file', weight: 1 });
          }
        }
        for (const v of verifications) {
          if (v.changeSetId)
            rels.push({
              from: entityId('verification', v.id),
              to: entityId('artifact', `changeset/${v.changeSetId}`),
              type: 'verifies',
            });
        }
        for (const r of collab) {
          if (r.changeSetId)
            rels.push({
              from: entityId('review', r.id),
              to: entityId('artifact', `changeset/${r.changeSetId}`),
              type: 'reviews',
            });
        }

        // events: agent caused event; event observes agent.
        const telemetry = this.ctx.telemetry.getEvents(300);
        telemetry.slice(0, 200).forEach((e, i) => {
          const eventId = entityId('event', `tel-${i}-${e.agent}-${e.timestamp}`);
          rels.push({ from: entityId('agent', e.agent), to: eventId, type: 'caused', timestamp: e.timestamp });
          if (e.filePath)
            rels.push({
              from: eventId,
              to: entityId('file', e.filePath),
              type: 'touches-file',
              timestamp: e.timestamp,
            });
        });

        if (!this.ctx.documentation) return rels;
        const documentationInventory = this.ctx.documentation.getInventory() ?? (await this.ctx.documentation.scan());
        rels.push(
          ...projectDocumentationGraph(
            documentationInventory,
            this.ctx.documentation.listPlans(),
            this.ctx.documentation.listProposals(),
          ).relationships,
        );
        return rels;
      },
    });
  }

  private repoName(): string {
    return this.repoPath.split('/').filter(Boolean).pop() ?? 'workspace';
  }

  private pushFile(out: GraphEntity[], seen: Set<string>, f: string): void {
    if (seen.has(f)) return;
    seen.add(f);
    out.push({ id: entityId('file', f), kind: 'file', label: f, meta: { path: f } });
  }

  private packageOf(path: string): string | null {
    const m = path.match(/^(?:packages|apps)\/([^/]+)/);
    return m ? m[1] : null;
  }

  // ─── Accessors ──────────────────────────────────────────────

  async graph(): Promise<EngineeringGraph> {
    const now = Date.now();
    if (now - this.lastRefresh < TTL_MS && this.registry.stats().nodes > 0) {
      return this.registry.graph;
    }
    await this.hydrate();
    return this.registry.graph;
  }

  /** Rebuild the graph from sources and append the diff to the event store. */
  private async hydrate(): Promise<void> {
    const before: GraphState = {
      entities: this.registry.graph.allEntities(),
      relationships: this.registry.graph.allRelationships(),
    };
    await this.registry.refresh();
    const after: GraphState = {
      entities: this.registry.graph.allEntities(),
      relationships: this.registry.graph.allRelationships(),
    };
    this.store.append(diffStates(before, after, new Date().toISOString(), 'workspace-sources'));
    this.lastRefresh = Date.now();
  }

  async refresh(): Promise<{ entities: number; relationships: number; events: number }> {
    const before: GraphState = {
      entities: this.registry.graph.allEntities(),
      relationships: this.registry.graph.allRelationships(),
    };
    const result = await this.registry.refresh();
    const after: GraphState = {
      entities: this.registry.graph.allEntities(),
      relationships: this.registry.graph.allRelationships(),
    };
    const events = diffStates(before, after, new Date().toISOString(), 'workspace-sources');
    this.store.append(events);
    this.lastRefresh = Date.now();
    return { entities: result.entities, relationships: result.relationships, events: events.length };
  }

  async stats(): Promise<GraphStats> {
    return (await this.graph()).stats();
  }

  async entity(id: string) {
    return (await this.graph()).getEntity(id);
  }

  async entities(opts: { kind?: string; q?: string; limit?: number }) {
    const graph = await this.graph();
    const { kind, q, limit = 200 } = opts;
    let entities = kind && kind !== 'any' ? graph.entitiesByKind(kind as never) : graph.allEntities();
    if (q) {
      const query = q.toLowerCase();
      entities = entities.filter(
        (e) =>
          String(e.label ?? '')
            .toLowerCase()
            .includes(query) ||
          String(e.id ?? '')
            .toLowerCase()
            .includes(query) ||
          String(e.owner ?? '')
            .toLowerCase()
            .includes(query),
      );
    }
    entities.sort((a, b) => a.label.localeCompare(b.label));
    return { entities: entities.slice(0, limit), total: entities.length };
  }

  async search(q: string, kind?: string, limit = 50) {
    const graph = await this.graph();
    return graph.search(q, {
      kind: (kind as never) ?? 'any',
      limit,
      fields: ['label', 'id', 'tags', 'description', 'status', 'owner', 'meta'],
    });
  }

  async relationships(id: string, opts: { direction?: 'out' | 'in' | 'both'; type?: string; limit?: number }) {
    const graph = await this.graph();
    const rels = graph.relationships(id, {
      direction: opts.direction,
      type: (opts.type as never) ?? 'any',
      limit: opts.limit ?? 100,
    });
    const entities = (await this.graph()).allEntities();
    const byId = new Map(entities.map((e) => [e.id, e]));
    return rels.map((r) => ({
      ...r,
      fromLabel: byId.get(r.from)?.label ?? r.from,
      toLabel: byId.get(r.to)?.label ?? r.to,
    }));
  }

  async backlinks(id: string, limit = 100) {
    const graph = await this.graph();
    const rels = graph.inRelationships(id, { limit });
    const byId = new Map(graph.allEntities().map((e) => [e.id, e]));
    return rels.map((r) => ({
      ...r,
      fromLabel: byId.get(r.from)?.label ?? r.from,
      toLabel: byId.get(r.to)?.label ?? r.to,
    }));
  }

  async explore(center: string, depth = 2) {
    return (await this.graph()).subgraph(center, depth);
  }

  async dependencies(id: string, maxDepth = 6) {
    const graph = await this.graph();
    const ids = graph.dependencies(id, 'any', maxDepth);
    const byId = new Map(graph.allEntities().map((e) => [e.id, e]));
    return ids.map((i) => ({ id: i, label: byId.get(i)?.label ?? i, kind: byId.get(i)?.kind ?? 'unknown' }));
  }

  async dependents(id: string, maxDepth = 6) {
    const graph = await this.graph();
    const ids = graph.dependents(id, 'any', maxDepth);
    const byId = new Map(graph.allEntities().map((e) => [e.id, e]));
    return ids.map((i) => ({ id: i, label: byId.get(i)?.label ?? i, kind: byId.get(i)?.kind ?? 'unknown' }));
  }

  async trace(id: string) {
    const graph = await this.graph();
    const entity = graph.getEntity(id);
    if (!entity) return null;
    const origin = this.findOrigin(graph, id);
    const out = graph.outRelationships(id, { limit: 100 });
    const produced = out
      .filter((r) => r.type === 'produced-artifact' || r.type === 'executes' || r.type === 'contains')
      .map((r) => r.to);
    return {
      entity,
      origin,
      history: graph.inRelationships(id, { limit: 100 }).map((r) => r.from),
      dependencies: graph.dependencies(id, 'any', 4),
      dependents: graph.dependents(id, 'any', 4),
      produced,
    };
  }

  private findOrigin(graph: EngineeringGraph, id: string): string | null {
    // Prefer upstream edges that define provenance over observational edges,
    // and stop at root entities (repository / workspace / user / request).
    const originPriority = ['owns', 'creates', 'references', 'executes', 'produced-artifact', 'contains', 'belongs-to'];
    const rootKinds = new Set(['repository', 'workspace', 'user', 'request']);
    let current: string | null = id;
    const seen = new Set<string>();
    let hops = 0;
    while (current && hops < 8 && !seen.has(current)) {
      seen.add(current);
      const currentEntity = graph.getEntity(current);
      if (currentEntity && rootKinds.has(currentEntity.kind)) return current;
      const incoming = graph.inRelationships(current, { limit: 20 });
      if (incoming.length === 0) return current;
      const ranked = [...incoming].sort((a, b) => {
        const ra = originPriority.indexOf(a.type);
        const rb = originPriority.indexOf(b.type);
        return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
      });
      current = ranked[0].from;
      hops += 1;
    }
    return current;
  }

  async timelineFor(id: string): Promise<GraphTimelineEntry[]> {
    const graph = await this.graph();
    const entity = graph.getEntity(id);
    if (!entity) return [];
    const out: GraphTimelineEntry[] = [];
    const label = entity.label.toLowerCase();
    const rawId = idOf(id)?.toLowerCase() ?? '';

    const telemetry = this.ctx.telemetry.getEvents(400);
    for (const e of telemetry) {
      let reason: GraphTimelineEntry['reason'] | null = null;
      if (e.agent === idOf(id)) reason = 'actor';
      else if ((e.filePath ?? '').toLowerCase() === label || (e.filePath ?? '').toLowerCase() === rawId)
        reason = 'connected';
      else if (e.task?.toLowerCase().includes(label) || e.detail?.toLowerCase().includes(label)) reason = 'mentions';
      if (!reason) continue;
      out.push({
        id: `tel-${e.timestamp}-${e.agent}`,
        timestamp: e.timestamp,
        type: `${e.status}.${e.operation}`,
        actor: e.agent,
        message: e.task || e.detail || `${e.agent} ${e.operation}`,
        reason,
      });
    }

    // Session timelines that reference this entity.
    const sessions = await this.ctx.agents.listExecutionSessions().catch(() => [] as any[]);
    for (const s of sessions) {
      const linksToSession = s.planIds?.includes(rawId) || s.assignedAgentIds?.includes(rawId) || s.id === rawId;
      if (!linksToSession) continue;
      for (const step of s.timeline ?? []) {
        out.push({
          id: `${s.id}:${step.step}`,
          timestamp: step.timestamp,
          type: `session.${step.status}`,
          actor: step.agentId,
          message: `${step.step} — ${step.status}`,
          reason: 'connected',
        });
      }
    }

    return out.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)).slice(0, 100);
  }

  async insights(): Promise<GraphInsight[]> {
    return (await this.graph()).insights();
  }

  async health(): Promise<GraphHealth> {
    return (await this.graph()).health();
  }

  // ─── Temporal (Engineering Event Store) ─────────────────────

  /** Ensure the graph has been hydrated at least once so events exist. */
  private async ensureHydrated(): Promise<void> {
    if (this.registry.stats().nodes === 0) await this.hydrate();
  }

  /** Latest events from the log (newest first). */
  async events(limit = 200, afterSeq?: number): Promise<GraphEvent[]> {
    await this.ensureHydrated();
    const source = afterSeq ? this.store.since(afterSeq) : this.store.all();
    return [...source].reverse().slice(0, limit);
  }

  /** Chronological events involving one entity. */
  async history(id: string): Promise<GraphEvent[]> {
    await this.ensureHydrated();
    return this.store.history(id);
  }

  /** Reconstruct the graph exactly as it was at `time`. */
  async stateAt(
    time: string | Date,
  ): Promise<{ entities: GraphEntity[]; relationships: GraphRelationship[]; stats: GraphStats }> {
    await this.ensureHydrated();
    const graph = this.store.stateAt(time);
    return { entities: graph.allEntities(), relationships: graph.allRelationships(), stats: graph.stats() };
  }

  /** Structural diff between two points in time. */
  async stateDiff(from: string | Date, to: string | Date): Promise<GraphDiff> {
    await this.ensureHydrated();
    return this.store.diff(from, to);
  }

  /** Full event stream (optionally scoped to one entity) for replay. */
  async replay(entityId?: string): Promise<GraphEvent[]> {
    await this.ensureHydrated();
    return this.store.replay(entityId);
  }

  /** Snapshot metadata (checkpoints + event count). */
  async storeInfo(): Promise<{ events: number; checkpoints: GraphSnapshot[] }> {
    await this.ensureHydrated();
    return { events: this.store.eventCount, checkpoints: this.store.getCheckpoints() };
  }

  async createCheckpoint(): Promise<GraphSnapshot> {
    await this.ensureHydrated();
    return this.store.createCheckpoint();
  }

  async verifyStoreIntegrity(): Promise<{ valid: boolean; events: number; latestSequence: number; checkedAt: string }> {
    await this.ensureHydrated();
    const events = this.store.all();
    const valid = events.every((event, index) => event.seq === index + 1);
    return {
      valid,
      events: events.length,
      latestSequence: events.at(-1)?.seq ?? 0,
      checkedAt: new Date().toISOString(),
    };
  }

  async recordCommand(
    command: {
      commandId: string;
      correlationId: string;
      causationId?: string;
      workspaceId: string;
      source: string;
      type: string;
    },
    phase: 'requested' | 'completed' | 'failed',
    message: string,
    result?: unknown,
  ): Promise<void> {
    await this.ensureHydrated();
    const id = entityId('event', `command/${command.commandId}`);
    const at = new Date().toISOString();
    const existing = this.store.stateAt(at).getEntity(id);
    const meta = {
      commandId: command.commandId,
      correlationId: command.correlationId,
      causationId: command.causationId,
      workspaceId: command.workspaceId,
      source: command.source,
      commandType: command.type,
      phase,
      result,
    };
    this.store.append([
      existing
        ? {
            at,
            type: 'entity-updated',
            source: command.source,
            entityId: id,
            patch: { status: phase, description: message, updatedAt: at, meta },
          }
        : {
            at,
            type: 'entity-created',
            source: command.source,
            entityId: id,
            entity: {
              id,
              kind: 'event',
              label: command.type,
              status: phase,
              description: message,
              updatedAt: at,
              meta,
            },
          },
    ]);
  }

  /** General graph query, optionally against a past state. */
  async queryGraph(query: GraphQuery): Promise<ReturnType<typeof executeGraphQuery>> {
    if (!query.start) throw new Error('start is required');
    await this.ensureHydrated();
    const graph = query.at ? this.store.stateAt(query.at) : await this.graph();
    return executeGraphQuery(graph, query);
  }
}
