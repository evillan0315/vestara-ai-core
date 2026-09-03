// OpenCode integration routes — OCV-001 health + discovery surface.
//
// The API exposes OpenCode capabilities through /api/opencode/*. Credentials
// are resolved server-side from configuration and never returned to clients.

import { execFileSync } from 'node:child_process';
import type * as http from 'node:http';
import {
  checkOpenApiCompatibility,
  contractEventType,
  disabledError,
  InMemoryPermissionRegistry,
  InMemorySessionRegistry,
  isOpenCodeIntegrationError,
  loadPinnedSchema,
  OpenCodeConfigError,
  OpenCodeEventBridge,
  OpenCodeHttpClient,
  type OpenCodePromptPart,
  type OpenCodeRequestContext,
  type OpenCodeSessionBinding,
  renderCompatibilityEvidence,
  renderOpenCodeExecutionEvidence,
  requirePendingPermission,
  requireSessionOwnership,
  resolveOpenCodeConfig,
  summarizeOpenCodeExecution,
  toCompatibilityEvidence,
} from '@vestara/opencode-runtime';
import { AuditAction, logAudit } from '../audit-log';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

let cachedConfig: ReturnType<typeof resolveOpenCodeConfig> | undefined;
let configFailed = false;
const sessionRegistry = new InMemorySessionRegistry();
const permissionRegistry = new InMemoryPermissionRegistry();

// Single persistent event bridge shared by all request handlers. Owns one
// upstream SSE connection; downstream clients subscribe through EventBus.
let eventBridge: OpenCodeEventBridge | undefined;

function openCodeClient() {
  if (!process.env.OPENCODE_PROXY_ENABLED || process.env.OPENCODE_PROXY_ENABLED === 'false') {
    throw disabledError();
  }
  if (!cachedConfig && !configFailed) {
    try {
      cachedConfig = resolveOpenCodeConfig({});
    } catch (error) {
      configFailed = true;
      if (error instanceof OpenCodeConfigError) throw error;
      throw error;
    }
  }
  if (!cachedConfig) throw new OpenCodeConfigError('OPENCODE_SERVER_PASSWORD is required');
  return new OpenCodeHttpClient(cachedConfig);
}

function bridgeFor(ctx: WorkspaceContext): OpenCodeEventBridge {
  if (!eventBridge) {
    eventBridge = new OpenCodeEventBridge({
      client: openCodeClient(),
      eventBus: ctx.eventBus,
      context: { workspaceId: workspaceIdOf(ctx) },
      onPermissionRequest: (request) => {
        permissionRegistry.record(request, workspaceIdOf(ctx), 'opencode-agent');
      },
    });
    void eventBridge.start().catch(() => {});
  }
  return eventBridge;
}

function sendOpenCodeError(res: http.ServerResponse, error: unknown): void {
  if (error instanceof OpenCodeConfigError) {
    json(res, 503, { error: disabledError().toPayload() });
    return;
  }
  if (isOpenCodeIntegrationError(error)) {
    json(res, error.httpStatus, { error: error.toPayload() });
    return;
  }
  json(res, 503, { error: disabledError().toPayload() });
}

export async function handleOpenCodeRoute(
  method: string,
  p: string,
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  _ctx: WorkspaceContext,
): Promise<boolean> {
  if (method === 'GET' && p === '/api/opencode/health') {
    return withOpenCodeClient(res, async (client) => {
      const started = Date.now();
      const health = await client.getHealth();
      json(res, 200, {
        integration: 'opencode',
        status: health.healthy ? 'healthy' : 'unhealthy',
        reachable: true,
        upstream: { healthy: health.healthy, version: health.version },
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        eventBridge: eventBridge ? eventBridge.metrics : { connected: false, connectionState: 'disconnected' },
      });
    });
  }
  if (method === 'GET' && p === '/api/opencode/compatibility') {
    return withOpenCodeClient(res, async (client) => {
      const pinned = loadPinnedSchema();
      const live = await client.getOpenApiDocument();
      const health = await client.getHealth();
      const result = await checkOpenApiCompatibility({
        pinned: pinned.document,
        candidate: live,
        openCodeVersion: health.version,
      });
      const eventType = contractEventType(result);
      const evidence = toCompatibilityEvidence(result);
      const summary = renderCompatibilityEvidence(evidence);
      // Emit contract telemetry through the event bus.
      void _ctx.eventBus
        .emit({
          type: eventType,
          source: 'opencode-runtime',
          payload: { ...evidence, report: summary } as unknown as Record<string, unknown>,
        })
        .catch(() => {});
      // Persist an immutable compatibility evidence bundle (PCS-026).
      try {
        const executionId = `opencode-contract-${Date.now()}`;
        const bundle = await _ctx.evidencePipeline.buildBundle({
          executionId,
          taskId: 'opencode-contract',
          verifierId: 'opencode-contract-check',
          profileId: 'standard',
          repository: _ctx.repoPath,
          implementationCommit: gitHeadCommit(_ctx.repoPath),
          outcome: result.compatible ? 'passed' : 'failed',
          scope: [],
          limitations: ['Contract compatibility check against the pinned OpenCode schema.'],
          checks: [
            {
              id: 'opencode-schema-compatibility',
              name: 'OpenCode schema compatibility',
              status: result.compatible ? 'passed' : 'failed',
              summary: result.checksumMatches
                ? 'Schema in sync with pinned contract'
                : `${result.breakingChanges.length} breaking, ${result.potentiallyBreaking.length} potentially breaking, ${result.warnings.length} compatible changes`,
              evidenceKinds: ['source-diff'],
            },
          ],
          uncoveredRisks: result.potentiallyBreaking.map((c) => c.summary),
          workspaceRoot: _ctx.repoPath,
          correlationId: `opencode-contract:${pinned.checksum}`,
        });
        try {
          _ctx.engineeringEvents.append({
            type: eventType,
            source: 'opencode-runtime',
            actorId: 'opencode-contract-check',
            authority: 'system',
            workspaceId: workspaceIdOf(_ctx),
            environmentId: `local:${workspaceIdOf(_ctx)}`,
            correlationId: `opencode-contract:${pinned.checksum}`,
            payload: {
              bundleId: bundle.id,
              compatible: result.compatible,
              checksumMatches: result.checksumMatches,
              pinnedChecksum: pinned.checksum,
              candidateChecksum: result.candidateSchemaChecksum,
              changeCount: result.changeCount,
              breakingCount: result.breakingChanges.length,
              openCodeVersion: health.version,
              report: summary,
            },
          });
        } catch {
          // evidence projection failure must not fail the compatibility report
        }
      } catch {
        // evidence failure must not fail the compatibility report
      }
      json(res, 200, {
        status: result.compatible ? 'compatible' : 'breaking',
        pinnedSchemaChecksum: `sha256:${pinned.checksum}`,
        liveSchemaChecksum: `sha256:${result.candidateSchemaChecksum}`,
        checksumMatches: result.checksumMatches,
        breakingChanges: result.breakingChanges,
        warnings: [...result.potentiallyBreaking, ...result.warnings],
        openCodeVersion: health.version,
        checkedAt: result.checkedAt,
      });
    });
  }
  if (method === 'GET' && p === '/api/opencode/events') {
    try {
      const bridge = bridgeFor(_ctx);
      void bridge;
    } catch (error) {
      sendOpenCodeError(res, error);
      return true;
    }
    const headers: Record<string, string> = {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    };
    res.writeHead(200, headers);
    res.write(`retry: 3000\n\n`);
    const workspaceId = workspaceIdOf(_ctx);
    const unsub = _ctx.eventBus.subscribe('opencode.*', async (event) => {
      const payload = (event as { payload?: Record<string, unknown> }).payload ?? {};
      const sessionId = payload.sessionId as string | undefined;
      if (sessionId) {
        const binding = sessionRegistry.get(sessionId);
        if (binding && binding.workspaceId !== workspaceId) return;
      }
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        /* client may have disconnected */
      }
    });
    _req.on('close', () => {
      unsub();
      try {
        res.end();
      } catch {
        /* already closed */
      }
    });
    return true;
  }

  if (method === 'GET' && p === '/api/opencode/project') {
    return withOpenCodeClient(res, async (client) => {
      const [projects, current] = await Promise.all([client.listProjects(), client.getCurrentProject()]);
      json(res, 200, { projects, current });
    });
  }
  if (method === 'GET' && p === '/api/opencode/path') {
    return withOpenCodeClient(res, async (client) => json(res, 200, await client.getPathInfo()));
  }
  if (method === 'GET' && p === '/api/opencode/vcs') {
    return withOpenCodeClient(res, async (client) => json(res, 200, await client.getVcsInfo()));
  }
  if (method === 'GET' && p === '/api/opencode/providers') {
    return withOpenCodeClient(res, async (client) => json(res, 200, { providers: await client.listProviders() }));
  }
  if (method === 'GET' && p === '/api/opencode/agents') {
    return withOpenCodeClient(res, async (client) => json(res, 200, { agents: await client.listAgents() }));
  }
  if (method === 'GET' && p === '/api/opencode/commands') {
    return withOpenCodeClient(res, async (client) => json(res, 200, { commands: await client.listCommands() }));
  }

  // ── Session management (OCV-003) ─────────────────────────────────────

  if (method === 'GET' && p === '/api/opencode/sessions') {
    return withOpenCodeClient(res, async (client) => {
      const sessions = await client.listSessions(workspaceContext(_ctx));
      json(res, 200, { sessions });
    });
  }

  // `/sessions/status` must be matched before the generic `/sessions/:id` route.
  if (method === 'GET' && p === '/api/opencode/sessions/status') {
    return withOpenCodeClient(res, async (client) => {
      json(res, 200, { status: await client.getSessionStatus(workspaceContext(_ctx)) });
    });
  }

  if (method === 'POST' && p === '/api/opencode/sessions') {
    return withOpenCodeClient(res, async (client) => {
      const raw = await readBody(_req);
      const body = parseJson(raw);
      const directory = typeof body?.directory === 'string' ? body.directory : undefined;
      const title = typeof body?.title === 'string' ? body.title : undefined;
      const agent = typeof body?.agent === 'string' ? body.agent : undefined;
      const model =
        body?.model && typeof body.model === 'object'
          ? (() => {
              const m = body.model as Record<string, unknown>;
              return {
                providerID: typeof m.providerID === 'string' ? m.providerID : undefined,
                id: typeof m.modelID === 'string' ? m.modelID : typeof m.id === 'string' ? m.id : undefined,
              };
            })()
          : undefined;
      const session = await client.createSession({ title }, workspaceContext(_ctx));
      const binding = sessionRegistry.bind({
        openCodeSessionId: session.id,
        vestaraSessionId: _ctx.runtime.getSession?.().fingerprint?.id ?? 'workspace-session',
        workspaceId: workspaceIdOf(_ctx),
        createdBy: 'console',
      });
      json(res, 201, { session, binding: sanitizeBinding(binding) });
    });
  }

  const sessionMatch = p.match(/^\/api\/opencode\/sessions\/([^/]+)(?:\/([^/]+))?$/);
  if (sessionMatch && method === 'GET' && !sessionMatch[2]) {
    const sessionId = decodeURIComponent(sessionMatch[1]);
    return withOpenCodeClient(res, async (client) => {
      const ownership = requireSessionOwnership(sessionRegistry, sessionId, { workspaceId: workspaceIdOf(_ctx) });
      if (!ownership.ok) throw ownership.error;
      const session = await client.getSession(sessionId, workspaceContext(_ctx));
      json(res, 200, { session });
    });
  }

  if (sessionMatch && method === 'DELETE' && !sessionMatch[2]) {
    const sessionId = decodeURIComponent(sessionMatch[1]);
    return withOpenCodeClient(res, async (client) => {
      const ownership = requireSessionOwnership(sessionRegistry, sessionId, { workspaceId: workspaceIdOf(_ctx) });
      if (!ownership.ok) throw ownership.error;
      await client.deleteSession(sessionId, workspaceContext(_ctx));
      sessionRegistry.updateStatus(sessionId, 'deleted');
      json(res, 200, { deleted: true, sessionId });
    });
  }

  if (sessionMatch && method === 'PATCH' && !sessionMatch[2]) {
    const sessionId = decodeURIComponent(sessionMatch[1]);
    return withOpenCodeClient(res, async (client) => {
      const ownership = requireSessionOwnership(sessionRegistry, sessionId, { workspaceId: workspaceIdOf(_ctx) });
      if (!ownership.ok) throw ownership.error;
      const raw = await readBody(_req);
      const body = parseJson(raw);
      const title = typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : undefined;
      if (!title) {
        json(res, 400, { error: { code: 'OPENCODE_INVALID_ARGUMENT', message: 'title is required.' } });
        return;
      }
      const session = await client.renameSession(sessionId, title, workspaceContext(_ctx));
      json(res, 200, { session });
    });
  }

  const subMatch = p.match(/^\/api\/opencode\/sessions\/([^/]+)\/(status|todos|diff|abort)$/);
  if (subMatch && method === 'GET') {
    const sessionId = decodeURIComponent(subMatch[1]);
    const resource = subMatch[2];
    return withOpenCodeClient(res, async (client) => {
      const ownership = requireSessionOwnership(sessionRegistry, sessionId, { workspaceId: workspaceIdOf(_ctx) });
      if (!ownership.ok) throw ownership.error;
      if (resource === 'status') json(res, 200, { status: await client.getSessionStatus(workspaceContext(_ctx)) });
      else if (resource === 'todos')
        json(res, 200, { todos: await client.getSessionTodos(sessionId, workspaceContext(_ctx)) });
      else if (resource === 'diff')
        json(res, 200, { diff: await client.getSessionDiff(sessionId, workspaceContext(_ctx)) });
    });
  }

  if (subMatch && method === 'POST' && subMatch[2] === 'abort') {
    const sessionId = decodeURIComponent(subMatch[1]);
    return withOpenCodeClient(res, async (client) => {
      const ownership = requireSessionOwnership(sessionRegistry, sessionId, { workspaceId: workspaceIdOf(_ctx) });
      if (!ownership.ok) throw ownership.error;
      await client.abortSession(sessionId, workspaceContext(_ctx));
      sessionRegistry.updateStatus(sessionId, 'aborted');
      json(res, 200, { aborted: true, sessionId });
    });
  }

  // ── Message execution (OCV-004) ───────────────────────────────────────
  //
  // Session-scoped message send (sync), async dispatch, history, and slash
  // commands. Every route requires session ownership and propagates the
  // execution correlation ID to the upstream request.

  const messageMatch = p.match(/^\/api\/opencode\/sessions\/([^/]+)\/messages(?:\/([^/]+))?$/);
  if (messageMatch && method === 'GET') {
    const sessionId = decodeURIComponent(messageMatch[1]);
    return withOpenCodeClient(res, async (client) => {
      const ownership = requireSessionOwnership(sessionRegistry, sessionId, { workspaceId: workspaceIdOf(_ctx) });
      if (!ownership.ok) throw ownership.error;
      const messages = await client.listMessages(sessionId, workspaceContext(_ctx));
      json(res, 200, { messages });
    });
  }

  if (messageMatch && method === 'POST' && !messageMatch[2]) {
    const sessionId = decodeURIComponent(messageMatch[1]);
    return withOpenCodeClient(res, async (client) => {
      const ownership = requireSessionOwnership(sessionRegistry, sessionId, { workspaceId: workspaceIdOf(_ctx) });
      if (!ownership.ok) throw ownership.error;
      const raw = await readBody(_req);
      const body = parseJson(raw);
      const parts = parsePromptParts(body);
      if (parts.length === 0) {
        json(res, 400, { error: { code: 'OPENCODE_INVALID_ARGUMENT', message: 'message parts are required.' } });
        return;
      }
      const result = await client.sendMessage(sessionId, { parts }, workspaceContext(_ctx));
      json(res, 200, { result });
    });
  }

  if (messageMatch && method === 'POST' && messageMatch[2] === 'async') {
    const sessionId = decodeURIComponent(messageMatch[1]);
    return withOpenCodeClient(res, async (client) => {
      const ownership = requireSessionOwnership(sessionRegistry, sessionId, { workspaceId: workspaceIdOf(_ctx) });
      if (!ownership.ok) throw ownership.error;
      const raw = await readBody(_req);
      const body = parseJson(raw);
      const parts = parsePromptParts(body);
      if (parts.length === 0) {
        json(res, 400, { error: { code: 'OPENCODE_INVALID_ARGUMENT', message: 'message parts are required.' } });
        return;
      }
      const executionId = typeof body?.executionId === 'string' ? body.executionId : undefined;
      if (executionId) sessionRegistry.correlateExecution(sessionId, executionId);
      await client.sendMessageAsync(
        sessionId,
        {
          parts,
          messageID: typeof body?.messageID === 'string' ? body.messageID : undefined,
          agent: typeof body?.agent === 'string' ? body.agent : undefined,
          system: typeof body?.system === 'string' ? body.system : undefined,
        },
        workspaceContext(_ctx),
      );
      json(res, 202, { accepted: true, sessionId, executionId });
    });
  }

  const commandMatch = p.match(/^\/api\/opencode\/sessions\/([^/]+)\/command$/);
  if (commandMatch && method === 'POST') {
    const sessionId = decodeURIComponent(commandMatch[1]);
    return withOpenCodeClient(res, async (client) => {
      const ownership = requireSessionOwnership(sessionRegistry, sessionId, { workspaceId: workspaceIdOf(_ctx) });
      if (!ownership.ok) throw ownership.error;
      const raw = await readBody(_req);
      const body = parseJson(raw);
      const command = typeof body?.command === 'string' ? body.command : undefined;
      if (!command) {
        json(res, 400, { error: { code: 'OPENCODE_INVALID_ARGUMENT', message: 'command name is required.' } });
        return;
      }
      await client.runCommand(
        sessionId,
        {
          command,
          arguments: typeof body?.arguments === 'string' ? body.arguments : undefined,
          agent: typeof body?.agent === 'string' ? body.agent : undefined,
        },
        workspaceContext(_ctx),
      );
      json(res, 202, { accepted: true, sessionId, command });
    });
  }

  // Cancel the currently-running message for an execution. The execution ID
  // maps to a bound session; aborting it cancels the in-flight model turn.
  if (method === 'POST' && p === '/api/opencode/executions/cancel') {
    return withOpenCodeClient(res, async (client) => {
      const raw = await readBody(_req);
      const body = parseJson(raw);
      const executionId = typeof body?.executionId === 'string' ? body.executionId : undefined;
      if (!executionId) {
        json(res, 400, { error: { code: 'OPENCODE_INVALID_ARGUMENT', message: 'executionId is required.' } });
        return;
      }
      const binding = sessionRegistry.findByExecution(executionId);
      if (!binding) {
        json(res, 200, { cancelled: false, reason: 'no_session' });
        return;
      }
      await client.abortSession(binding.openCodeSessionId, workspaceContext(_ctx));
      sessionRegistry.updateStatus(binding.openCodeSessionId, 'aborted');
      json(res, 200, { cancelled: true, sessionId: binding.openCodeSessionId, executionId });
    });
  }

  // ── Permission governance (OCV-006) ───────────────────────────────────
  //
  // Permission requests surfaced by the event bridge land in the permission
  // registry. Workspace-scoped endpoints list pending requests and forward
  // Vestara decisions to the upstream server, recording an audit entry and an
  // engineering event per decision.

  if (method === 'GET' && p === '/api/opencode/permissions') {
    return withOpenCodeClient(res, async () => {
      const workspaceId = workspaceIdOf(_ctx);
      const pending = permissionRegistry.listPending(workspaceId).map(sanitizePermission);
      json(res, 200, { permissions: pending, count: pending.length });
    });
  }

  const permissionMatch = p.match(/^\/api\/opencode\/sessions\/([^/]+)\/permissions\/([^/]+)\/respond$/);
  if (permissionMatch && method === 'POST') {
    const sessionId = decodeURIComponent(permissionMatch[1]);
    const permissionId = decodeURIComponent(permissionMatch[2]);
    return withOpenCodeClient(res, async (client) => {
      const workspaceId = workspaceIdOf(_ctx);
      const ownership = requireSessionOwnership(sessionRegistry, sessionId, { workspaceId });
      if (!ownership.ok) throw ownership.error;
      const pending = requirePendingPermission(permissionRegistry, permissionId, workspaceId);
      if ('error' in pending) throw pending.error;
      const raw = await readBody(_req);
      const body = parseJson(raw);
      const decision = typeof body?.decision === 'string' ? body.decision : undefined;
      if (decision !== 'approve' && decision !== 'reject') {
        json(res, 400, {
          error: { code: 'OPENCODE_INVALID_ARGUMENT', message: 'decision must be approve or reject.' },
        });
        return;
      }
      const scope = body?.scope === 'session' ? 'session' : 'once';
      await client.respondToPermission(
        sessionId,
        permissionId,
        decision === 'approve'
          ? { decision: 'approve', scope }
          : { decision: 'reject', reason: String(body?.reason ?? '') },
        workspaceContext(_ctx),
      );
      const decided = permissionRegistry.decide(permissionId, {
        decision,
        scope: decision === 'approve' ? scope : undefined,
        reason: typeof body?.reason === 'string' ? body.reason : undefined,
        decidedBy: 'console',
      });
      const actor = actorFromRequest(_req);
      logAudit(
        _ctx.audit,
        _req,
        actor.id,
        actor.name,
        decision === 'approve' ? AuditAction.OPENCODE_PERMISSION_APPROVE : AuditAction.OPENCODE_PERMISSION_REJECT,
        'opencode-permission',
        permissionId,
        JSON.stringify({ sessionId, decision, scope, action: pending.record.action, risk: pending.record.risk }),
      );
      json(res, 200, { decided: decided ? sanitizePermission(decided) : undefined, sessionId });
    });
  }

  // ── Engineering evidence (OCV-007) ────────────────────────────────────
  //
  // Session executions are correlated to a Vestara execution via the session
  // binding. Capturing evidence fetches the session's messages, diff, and todos
  // from upstream, normalizes them into a verifier-readable summary, writes an
  // immutable VerificationEvidenceBundle through the evidence pipeline, and
  // appends an `opencode.execution.completed` engineering event.

  const evidenceMatch = p.match(/^\/api\/opencode\/sessions\/([^/]+)\/evidence$/);
  if (evidenceMatch && method === 'GET') {
    const sessionId = decodeURIComponent(evidenceMatch[1]);
    return withOpenCodeClient(res, async () => {
      const workspaceId = workspaceIdOf(_ctx);
      const ownership = requireSessionOwnership(sessionRegistry, sessionId, { workspaceId });
      if (!ownership.ok) throw ownership.error;
      const binding = sessionRegistry.get(sessionId);
      const executionId = binding?.executionId;
      if (executionId && _ctx.evidenceBundles.read(executionId)) {
        json(res, 200, { bundle: _ctx.evidenceBundles.read(executionId) });
        return;
      }
      json(res, 200, { bundle: undefined, executionId, captured: false });
    });
  }

  if (evidenceMatch && method === 'POST') {
    const sessionId = decodeURIComponent(evidenceMatch[1]);
    return withOpenCodeClient(res, async (client) => {
      const workspaceId = workspaceIdOf(_ctx);
      const ownership = requireSessionOwnership(sessionRegistry, sessionId, { workspaceId });
      if (!ownership.ok) throw ownership.error;
      const binding = sessionRegistry.get(sessionId);
      const executionId = binding?.executionId ?? `opencode-${sessionId}-${Date.now()}`;
      const raw = await readBody(_req);
      const body = parseJson(raw);
      const aborted = body?.aborted === true;
      const [messages, diff, todos] = await Promise.all([
        client.listMessages(sessionId, workspaceContext(_ctx)),
        client.getSessionDiff(sessionId, workspaceContext(_ctx)),
        client.getSessionTodos(sessionId, workspaceContext(_ctx)),
      ]);
      const evidence = summarizeOpenCodeExecution({
        sessionId,
        executionId,
        workspaceId,
        messages,
        diff,
        todos,
        aborted,
      });
      const _summaryText = renderOpenCodeExecutionEvidence(evidence);
      const commit = gitHeadCommit(_ctx.repoPath);
      const bundle = await _ctx.evidencePipeline.buildBundle({
        executionId,
        taskId: sessionId,
        verifierId: 'opencode-evidence',
        profileId: 'standard',
        repository: _ctx.repoPath,
        implementationCommit: commit,
        outcome:
          evidence.outcome === 'completed' ? 'passed' : evidence.outcome === 'aborted' ? 'blocked' : 'inconclusive',
        scope: evidence.changedFiles.map((file) => file.path),
        limitations: ['Session messages include assistant reasoning and tool deltas.'],
        checks: [
          {
            id: 'opencode-execution-completed',
            name: 'OpenCode session execution',
            status: evidence.outcome === 'completed' ? 'passed' : 'failed',
            summary: `${evidence.messageCount} messages, ${evidence.changedFiles.length} files changed, ${evidence.completedTodos}/${evidence.todos.length} todos complete`,
            evidenceKinds: ['source-diff', 'filesystem-change'],
          },
        ],
        uncoveredRisks: evidence.openTodos > 0 ? [`${evidence.openTodos} open todos`] : [],
        workspaceRoot: _ctx.repoPath,
        changedFiles: evidence.changedFiles.map((file) => file.path),
        correlationId: `opencode:${sessionId}`,
      });
      sessionRegistry.correlateExecution(sessionId, executionId);
      try {
        _ctx.engineeringEvents.append({
          type: 'opencode.execution.completed',
          source: 'opencode-runtime',
          actorId: 'opencode-agent',
          authority: 'system',
          workspaceId,
          environmentId: `local:${workspaceId}`,
          taskId: sessionId,
          correlationId: `opencode:${sessionId}`,
          payload: {
            sessionId,
            executionId,
            bundleId: bundle.id,
            outcome: evidence.outcome,
            messageCount: evidence.messageCount,
            changedFiles: evidence.changedFiles.length,
            additions: evidence.additions,
            deletions: evidence.deletions,
            openTodos: evidence.openTodos,
          },
        });
      } catch {
        // evidence projection failure must not fail the request
      }
      json(res, 201, { bundle, evidence: sanitizeEvidence(evidence), executionId });
    });
  }

  return false;
}

function sanitizeEvidence(evidence: ReturnType<typeof summarizeOpenCodeExecution>) {
  return {
    sessionId: evidence.sessionId,
    executionId: evidence.executionId,
    outcome: evidence.outcome,
    messageCount: evidence.messageCount,
    changedFiles: evidence.changedFiles,
    additions: evidence.additions,
    deletions: evidence.deletions,
    todos: evidence.todos,
    openTodos: evidence.openTodos,
    completedTodos: evidence.completedTodos,
  };
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

function actorFromRequest(req: http.IncomingMessage): { id: string; name: string } {
  const header = req.headers['x-vestara-actor'];
  if (typeof header === 'string' && header.trim()) {
    return { id: header, name: header };
  }
  return { id: 'local-operator', name: 'Local Operator' };
}

function sanitizePermission(record: {
  id: string;
  permission?: string;
  action: string;
  resources: readonly string[];
  risk: string;
  status: string;
  sessionId?: string;
  askedAt: string;
}) {
  return {
    id: record.id,
    permission: record.permission,
    action: record.action,
    resources: record.resources,
    risk: record.risk,
    status: record.status,
    sessionId: record.sessionId,
    askedAt: record.askedAt,
  };
}

function workspaceIdOf(_ctx: WorkspaceContext): string {
  return _ctx.runtime.getSession?.().fingerprint?.id ?? 'workspace';
}

function workspaceContext(_ctx: WorkspaceContext): OpenCodeRequestContext {
  return {
    workspaceId: workspaceIdOf(_ctx),
    directory: _ctx.workspaceDir,
    correlationId: `req-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  };
}

function parseJson(raw: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function parsePromptParts(body: Record<string, unknown> | undefined): OpenCodePromptPart[] {
  if (!body || !Array.isArray(body.parts)) return [];
  return body.parts
    .filter((part): part is Record<string, unknown> => Boolean(part) && typeof part === 'object')
    .map((part) => {
      if (part.type === 'tool') {
        return {
          type: 'tool' as const,
          tool: typeof part.tool === 'string' ? part.tool : '',
          input: part.input && typeof part.input === 'object' ? (part.input as Record<string, unknown>) : undefined,
        };
      }
      if (part.type === 'file') {
        return {
          type: 'file' as const,
          path: typeof part.path === 'string' ? part.path : '',
          content: typeof part.content === 'string' ? part.content : undefined,
        };
      }
      return { type: 'text' as const, text: typeof part.text === 'string' ? part.text : '' };
    })
    .filter((part) =>
      part.type === 'text' ? part.text.length > 0 : part.type === 'tool' ? part.tool.length > 0 : part.path.length > 0,
    );
}

function sanitizeBinding(binding: OpenCodeSessionBinding): OpenCodeSessionBinding {
  return { ...binding };
}

async function withOpenCodeClient(
  res: http.ServerResponse,
  run: (client: OpenCodeHttpClient) => Promise<void>,
): Promise<boolean> {
  let client: OpenCodeHttpClient;
  try {
    client = openCodeClient();
  } catch (error) {
    sendOpenCodeError(res, error);
    return true;
  }
  try {
    await run(client);
  } catch (error) {
    sendOpenCodeError(res, error);
  }
  return true;
}
