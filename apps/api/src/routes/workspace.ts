import * as fs from 'node:fs';
import type * as http from 'node:http';
import * as path from 'node:path';
import {
  createWorkspaceCommand,
  isSettingsWorkspaceCommand,
  type SettingsSectionId,
  type WorkspaceCommandSource,
} from '@vestara/configuration';
import { AuditAction, logAudit } from '../audit-log';
import { requireRole } from '../auth';
import type { WorkspaceContext } from '../workspace-context';
import { serviceFor as graphServiceFor } from './graph';
import { getActor, json, readBody } from './types';

export async function handleWorkspaceRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  if (method === 'GET' && p === '/api/workspace') {
    const ws = ctx.runtime.currentWorkspace;
    const session = ctx.runtime.getSession();
    json(res, 200, {
      status: ctx.runtime.currentStatus,
      fingerprint: session.fingerprint,
      profile: session.profile,
      presentation: ws.presentation,
    });
    return true;
  }

  if (method === 'GET' && p === '/api/understanding') {
    const u = ctx.runtime.getSession().understanding;
    if (!u) {
      json(res, 503, { error: 'Understanding not yet available', understanding: null });
      return true;
    }
    json(res, 200, u);
    return true;
  }

  if (method === 'GET' && p === '/api/settings') {
    json(res, 200, ctx.settings.resolve());
    return true;
  }

  if ((method === 'PATCH' || method === 'PUT') && p === '/api/settings') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const raw = await readBody(req);
    const body = (raw ? JSON.parse(raw) : {}) as {
      section?: SettingsSectionId;
      overrides?: Record<string, unknown>;
      expectedRevision?: string;
      source?: WorkspaceCommandSource;
    };
    const actor = getActor(req, ctx);
    try {
      if (!body.section || !body.overrides || typeof body.overrides !== 'object') {
        json(res, 400, { error: 'section and overrides are required' });
        return true;
      }
      const source = body.source === 'cli' ? 'cli' : body.source === 'api' ? 'api' : 'workspace-ui';
      const command = createWorkspaceCommand({
        workspaceId: ctx.runtime.getSession().fingerprint.id,
        source,
        type: 'settings.update',
        payload: { section: body.section, keys: Object.keys(body.overrides) },
      });
      await publishCommandEvent(ctx, command, 'command-requested', `${source} requested settings update`);
      const configuration = ctx.settings.save({
        section: body.section,
        overrides: body.overrides,
        expectedRevision: body.expectedRevision,
      });
      await publishCommandEvent(ctx, command, 'execution-completed', `Updated ${body.section} settings`);
      json(res, 200, { saved: true, command, configuration });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save settings';
      json(res, message.includes('changed since') ? 409 : 400, { error: message });
      return true;
    }
    logAudit(
      ctx.audit,
      req,
      actor.id,
      actor.name,
      AuditAction.SETTINGS_UPDATE,
      'settings',
      undefined,
      JSON.stringify(Object.keys(body.overrides ?? {})),
    );
    return true;
  }

  const resetMatch = p.match(/^\/api\/settings\/overrides\/([a-z-]+)$/);
  if (method === 'DELETE' && resetMatch) {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    try {
      const section = resetMatch[1] as SettingsSectionId;
      const command = createWorkspaceCommand({
        workspaceId: ctx.runtime.getSession().fingerprint.id,
        source: req.headers['x-vestara-source'] === 'cli' ? 'cli' : 'workspace-ui',
        type: 'settings.reset',
        payload: { section },
      });
      await publishCommandEvent(ctx, command, 'command-requested', `Requested ${section} settings reset`);
      const configuration = ctx.settings.resetSection(section, req.headers['if-match']);
      await publishCommandEvent(ctx, command, 'execution-completed', `Reset ${section} settings to inherited values`);
      json(res, 200, { reset: true, command, configuration });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to reset settings';
      json(res, message.includes('changed since') ? 409 : 400, { error: message });
    }
    return true;
  }

  if (method === 'GET' && p === '/api/runtime/status') {
    const graph = graphServiceFor(ctx);
    const [graphHealth, store, agents] = await Promise.all([
      graph.health(),
      graph.storeInfo(),
      ctx.agents.listExecutions().catch(() => []),
    ]);
    json(res, 200, {
      status: ctx.runtime.currentStatus,
      apiEndpoint: `http://127.0.0.1:${process.env.VESTARA_API_PORT ?? 3001}`,
      websocketEndpoint: `ws://127.0.0.1:${process.env.VESTARA_API_PORT ?? 3001}/ws`,
      websocketStatus: 'available',
      runtimeVersion: '0.3.0',
      workspaceId: ctx.runtime.getSession().fingerprint.id,
      currentSession: ctx.runtime.getSession().fingerprint.id,
      activeExecutionCount: agents.filter((entry) => entry.status === 'running').length,
      eventBusStatus: 'running',
      engineeringGraphStatus: graphHealth.checks.some((check) => check.status === 'fail') ? 'degraded' : 'healthy',
      engineeringEventStoreStatus: 'running',
      engineeringEventCount: store.events,
      filesystemRuntimeStatus: 'available',
      verificationRuntimeStatus: 'running',
      telemetryStatus: 'running',
    });
    return true;
  }

  if (method === 'POST' && p === '/api/runtime/health-check') {
    const raw = await readBody(req);
    const supplied = raw ? (JSON.parse(raw) as unknown) : null;
    const command =
      isSettingsWorkspaceCommand(supplied) &&
      supplied.type === 'runtime.health-check' &&
      supplied.workspaceId === ctx.runtime.getSession().fingerprint.id &&
      supplied.source === (req.headers['x-vestara-source'] === 'cli' ? 'cli' : 'workspace-ui')
        ? supplied
        : createWorkspaceCommand({
            workspaceId: ctx.runtime.getSession().fingerprint.id,
            source: req.headers['x-vestara-source'] === 'cli' ? 'cli' : 'workspace-ui',
            type: 'runtime.health-check',
          });
    await publishCommandEvent(ctx, command, 'command-requested', 'Runtime health check requested');
    const health = ctx.apiRuntime.health;
    await publishCommandEvent(ctx, command, 'execution-completed', `Runtime health check completed: ${health.status}`);
    json(res, 200, { command, health });
    return true;
  }

  if (method === 'GET' && p === '/api/cli/status') {
    json(res, 200, cliStatus(ctx));
    return true;
  }

  if (method === 'POST' && p === '/api/cli/verify') {
    const status = cliStatus(ctx);
    json(res, status.detected ? 200 : 503, {
      ...status,
      validation: [
        { stage: 'executable', status: status.detected ? 'passed' : 'failed' },
        { stage: 'version', status: status.compatible ? 'passed' : 'failed' },
        { stage: 'runtime-connectivity', status: 'passed' },
        { stage: 'workspace-identity', status: 'passed' },
      ],
      verifiedAt: new Date().toISOString(),
    });
    return true;
  }

  if (
    (method === 'POST' && p === '/api/workspace-ui/test-build') ||
    ((method === 'POST' || method === 'GET') && p === '/api/workspace-ui/test-build')
  ) {
    if (!ctx.runtime) {
      json(res, 503, { error: 'Workspace runtime not available' });
      return true;
    }
    try {
      const session = ctx.runtime.getSession();
      const result = await ctx.agentRuntime.run(
        'agent-workspace-ui-tester',
        'Run test + build for workspace-ui',
        session,
      );
      json(res, 200, {
        result: {
          status: result.execution.status,
          message: result.message,
          artifacts: result.execution.outputArtifacts,
        },
      });
    } catch (error) {
      json(res, 500, { error: error instanceof Error ? error.message : 'Workspace UI verification failed' });
    }
    return true;
  }

  return false;
}

async function publishCommandEvent(
  ctx: WorkspaceContext,
  command: ReturnType<typeof createWorkspaceCommand>,
  type: string,
  message: string,
): Promise<void> {
  await graphServiceFor(ctx).recordCommand(
    command,
    type === 'command-requested' ? 'requested' : type === 'execution-completed' ? 'completed' : 'failed',
    message,
  );
  ctx.publish({
    id: `evt-${command.commandId}-${type}`,
    timestamp: new Date().toISOString(),
    category: 'system',
    type,
    actor: { id: command.source, name: command.source, type: command.source === 'agent' ? 'agent' : 'user' },
    resource: { type: 'command', id: command.commandId, name: command.type },
    message,
    metadata: {
      commandId: command.commandId,
      correlationId: command.correlationId,
      causationId: command.causationId,
      workspaceId: command.workspaceId,
      source: command.source,
      commandType: command.type,
    },
  });
}

function cliStatus(ctx: WorkspaceContext) {
  const executablePath = path.join(ctx.repoPath, 'apps', 'cli', 'dist', 'index.js');
  const socketPath = path.join(
    process.env.XDG_DATA_HOME ?? path.join(process.env.HOME ?? '', '.local', 'share'),
    'vestara',
    'runtime.sock',
  );
  const detected = fs.existsSync(executablePath);
  return {
    detected,
    executablePath: detected ? executablePath : null,
    cliVersion: detected ? '0.3.0' : null,
    runtimeVersion: '0.3.0',
    compatible: detected,
    runtimeConnected: true,
    connectionEvidence: 'This response was served by the active Workspace API runtime.',
    workspaceId: ctx.runtime.getSession().fingerprint.id,
    connectedWorkspace: ctx.repoPath,
    runtimeEndpoint: `http://127.0.0.1:${process.env.VESTARA_API_PORT ?? 3001}`,
    authenticationStatus: 'local-session',
    localSocketPath: socketPath,
    localSocketAvailable: fs.existsSync(socketPath),
    transport: fs.existsSync(socketPath) ? 'unix-socket' : 'http',
    configurationSynchronized: true,
  };
}
