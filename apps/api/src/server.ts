/**
 * HTTP + WebSocket gateway for the Workspace UI.
 *
 * Architecture Traceability:
 *   PCS: PCS-010 — Workspace UI
 *   Invariant: Gateway exposes engine state; does not implement product policy.
 */

import * as http from 'node:http';
import type { WorkspaceEvent, WsClientMessage, WsServerMessage } from '@vestara/events';
import { WebSocket, WebSocketServer } from 'ws';
import { AuditAction, logAudit } from './audit-log';
import { type AuthUser, authenticate, requireRole } from './auth';
import type { WorkspaceContext } from './workspace-context';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Vestara-Actor',
};

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
    ...CORS,
  });
  res.end(data);
}

// Feature requests store
const featureRequests: Array<{
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  votes: number;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}> = [];
let reqIdCounter = 0;

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function actorOf(req: http.IncomingMessage): string {
  const h = req.headers['x-vestara-actor'];
  return typeof h === 'string' && h.trim() ? h.trim() : 'local-operator';
}

function getActor(req: http.IncomingMessage, ctx: WorkspaceContext): AuthUser {
  return authenticate(req, ctx.users);
}

export type ApiServer = http.Server & {
  broadcast: (event: WorkspaceEvent) => void;
};

export function createServer(ctx: WorkspaceContext, port: number, activityService?: any): ApiServer {
  const clients = new Set<WebSocket>();

  // Auto-complete feature request when its execution finishes
  if (ctx.orchestrator) {
    ctx.orchestrator.setOnComplete((exSession) => {
      if (exSession.status === 'completed' && exSession.goal) {
        const goalTitle = exSession.goal.split(':')[0].trim();
        const req = featureRequests.find(
          (r) => r.title === goalTitle || `${r.title}: ${r.description || r.title}` === exSession.goal,
        );
        if (req && req.status !== 'completed') {
          req.status = 'completed';
          req.updatedAt = new Date().toISOString();
          if (ctx.milestones)
            ctx.milestones.updateMilestone(`FR-${req.id.replace('req-', '')}`, { status: 'completed' });
        }
      }
    });
  }

  // If activity service is available, stream domain events to all WebSocket clients
  if (activityService?.onEvent) {
    activityService.onEvent((domainEvent: WorkspaceEvent) => {
      const msg: WsServerMessage = { op: 'event', event: domainEvent };
      const raw = JSON.stringify(msg);
      for (const ws of clients) {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(raw);
          } catch {}
        }
      }
    });
  }

  interface LegacyEvent {
    id: string;
    type: string;
    actor: { id: string; name: string; type: 'user' | 'agent' | 'system' };
    sessionId?: string;
    artifactId?: string;
    message?: string;
    timestamp: string;
    payload?: unknown;
  }

  const broadcast = (legacy: LegacyEvent): void => {
    const event: WorkspaceEvent = {
      id: legacy.id,
      timestamp: legacy.timestamp,
      category: (legacy.type?.split('.')[0] as any) ?? 'system',
      type: legacy.type as any,
      actor: legacy.actor,
      resource: {
        type: legacy.artifactId ? 'artifact' : legacy.sessionId ? 'session' : 'system',
        id: legacy.artifactId ?? legacy.sessionId ?? 'unknown',
        name: legacy.message ?? legacy.type,
      },
      message: legacy.message ?? legacy.type,
      metadata: (legacy.payload as Record<string, unknown>) ?? {},
    };
    const msg: WsServerMessage = { op: 'event', event };
    const raw = JSON.stringify(msg);
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(raw);
        } catch {}
      }
    }
    // Also persist to activity log
    activityService?.emitDirect(event).catch(() => {});
  };

  const server = http.createServer(async (req, res) => {
    res.on('error', () => {});
    if (!req.url || !req.method) {
      json(res, 400, { error: 'bad request' });
      return;
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const p = url.pathname;
    const method = req.method.toUpperCase();

    try {
      if (method === 'GET' && p === '/api/health') {
        json(res, 200, {
          status: 'ok',
          repoPath: ctx.repoPath,
          workspaceDir: ctx.workspaceDir,
          workspaceStatus: ctx.runtime.currentStatus,
          time: new Date().toISOString(),
        });
        return;
      }

      // ── Auth endpoints ──────────────────────────────
      if (method === 'GET' && p === '/api/auth/me') {
        // Extract the raw token to look up the full user record
        const authHeader = req.headers.authorization;
        const tokenMatch = typeof authHeader === 'string' ? authHeader.match(/^Bearer\s+(.+)$/i) : null;
        const token = tokenMatch?.[1];
        const fullUser = token ? ctx.users.findByToken(token) : undefined;
        const authUser = getActor(req, ctx);

        json(res, 200, {
          user: {
            id: authUser.id,
            name: authUser.name,
            role: authUser.role,
            type: authUser.type,
          },
          currentUser: fullUser
            ? {
                id: fullUser.id,
                username: fullUser.username,
                role: fullUser.role,
                token: fullUser.token,
                createdAt: fullUser.createdAt,
              }
            : undefined,
          allUsers: ctx.users.listAll().map((u) => ({
            id: u.id,
            username: u.username,
            role: u.role,
            createdAt: u.createdAt,
          })),
        });
        return;
      }

      if (method === 'POST' && p === '/api/auth/login') {
        try {
          const raw = await readBody(req);
          const body = raw ? JSON.parse(raw) : {};
          const username = body.username?.trim();
          const token = body.token?.trim();

          if (token) {
            // Exchange a known token for user info
            const user = ctx.users.findByToken(token);
            if (user) {
              logAudit(ctx.audit, req, user.id, user.username, AuditAction.LOGIN, 'user', user.id, 'Token login');
              json(res, 200, { user: { id: user.id, username: user.username, role: user.role, token: user.token } });
            } else {
              json(res, 401, { error: 'Invalid token' });
            }
          } else if (username) {
            // Create or look up user by username
            const existing = ctx.users.listAll().find((u) => u.username === username);
            if (existing) {
              logAudit(
                ctx.audit,
                req,
                existing.id,
                existing.username,
                AuditAction.LOGIN,
                'user',
                existing.id,
                'Username login',
              );
              json(res, 200, {
                user: { id: existing.id, username: existing.username, role: existing.role, token: existing.token },
              });
            } else {
              const newUser = ctx.users.createUser(username, 'editor');
              logAudit(
                ctx.audit,
                req,
                newUser.id,
                newUser.username,
                AuditAction.LOGIN,
                'user',
                newUser.id,
                'New user registration',
              );
              json(res, 201, {
                user: { id: newUser.id, username: newUser.username, role: newUser.role, token: newUser.token },
              });
            }
          } else {
            json(res, 400, { error: 'Provide username or token' });
          }
        } catch (err: any) {
          json(res, 500, { error: err.message });
        }
        return;
      }

      // ── Admin: audit log ───────────────────────────────
      if (method === 'GET' && p === '/api/admin/audit-log') {
        if (!requireRole(req, ctx, 'admin', res)) return;
        const qs = new URL(req.url, `http://127.0.0.1:${port}`).searchParams;
        const entries = ctx.audit.query({
          limit: qs.get('limit') ? parseInt(qs.get('limit')!, 10) : 100,
          offset: qs.get('offset') ? parseInt(qs.get('offset')!, 10) : undefined,
          userId: qs.get('userId') || undefined,
          action: qs.get('action') || undefined,
          resource: qs.get('resource') || undefined,
          since: qs.get('since') || undefined,
          until: qs.get('until') || undefined,
        });
        const total = ctx.audit.count();
        json(res, 200, { entries, total });
        return;
      }

      // ── Admin: user management ─────────────────────────
      if (method === 'GET' && p === '/api/admin/users') {
        if (!requireRole(req, ctx, 'admin', res)) return;
        const allUsers = ctx.users.listAll();
        json(res, 200, {
          users: allUsers.map((u) => ({ id: u.id, username: u.username, role: u.role, createdAt: u.createdAt })),
        });
        return;
      }

      if (method === 'POST' && p === '/api/admin/users') {
        if (!requireRole(req, ctx, 'admin', res)) return;
        const actor = getActor(req, ctx);
        try {
          const raw = await readBody(req);
          const body = raw ? JSON.parse(raw) : {};
          if (!body.username?.trim()) {
            json(res, 400, { error: 'username is required' });
            return;
          }
          const user = ctx.users.createUser(body.username.trim(), body.role || 'editor');
          logAudit(ctx.audit, req, actor.id, actor.name, AuditAction.USER_CREATE, 'user', user.id, user.username);
          json(res, 201, {
            user: {
              id: user.id,
              username: user.username,
              role: user.role,
              token: user.token,
              createdAt: user.createdAt,
            },
          });
        } catch (err: any) {
          json(res, 500, { error: err.message });
        }
        return;
      }

      if (method === 'POST' && p.startsWith('/api/admin/users/')) {
        const rotateMatch = p.match(/^\/api\/admin\/users\/([^/]+)\/rotate-token$/);
        if (rotateMatch && method === 'POST') {
          if (!requireRole(req, ctx, 'admin', res)) return;
          const actor = getActor(req, ctx);
          const userId = decodeURIComponent(rotateMatch[1]);
          const newToken = ctx.users.rotateToken(userId);
          if (newToken) {
            logAudit(ctx.audit, req, actor.id, actor.name, AuditAction.USER_ROTATE_TOKEN, 'user', userId);
            json(res, 200, { token: newToken });
          } else {
            json(res, 404, { error: 'User not found' });
          }
          return;
        }
      }

      if (method === 'GET' && p === '/api/settings') {
        try {
          let prefs: any;
          try {
            const session = ctx.runtime.getSession();
            prefs = session?.prefs;
          } catch {
            // No active session — return defaults
          }
          if (prefs) {
            json(res, 200, { settings: prefs.getAll() });
          } else {
            json(res, 200, {
              settings: {
                provider: 'opencode',
                model: 'deepseek-v4-flash-free',
                autoIndex: 'true',
                verifyOnImplement: 'true',
                showWelcomeTour: 'true',
              },
            });
          }
        } catch (err: any) {
          json(res, 500, { error: err.message });
        }
        return;
      }

      if (method === 'PUT' && p === '/api/settings') {
        if (!requireRole(req, ctx, 'editor', res)) return;
        try {
          const raw = await readBody(req);
          const body = raw ? JSON.parse(raw) : {};
          const actor = getActor(req, ctx);
          try {
            const session = ctx.runtime.getSession();
            if (session?.prefs) {
              for (const [key, value] of Object.entries(body)) {
                if (typeof value === 'string') session.prefs.set(key, value);
              }
              json(res, 200, { saved: true, settings: session.prefs.getAll() });
            } else {
              json(res, 200, { saved: true, note: 'No active session — changes will not persist' });
            }
          } catch {
            json(res, 200, { saved: true, note: 'No active session — changes will not persist' });
          }
          logAudit(
            ctx.audit,
            req,
            actor.id,
            actor.name,
            AuditAction.SETTINGS_UPDATE,
            'settings',
            undefined,
            JSON.stringify(Object.keys(body)),
          );
        } catch (err: any) {
          json(res, 500, { error: err.message });
        }
        return;
      }

      if (method === 'DELETE' && p === '/api/settings') {
        if (!requireRole(req, ctx, 'editor', res)) return;
        try {
          const actor = getActor(req, ctx);
          const session = ctx.runtime.getSession();
          if (session?.prefs) {
            const all = session.prefs.getAll();
            for (const key of Object.keys(all)) {
              session.prefs.reset(key);
            }
            logAudit(ctx.audit, req, actor.id, actor.name, AuditAction.SETTINGS_DELETE, 'settings');
            json(res, 200, { reset: true, settings: session.prefs.getAll() });
          } else {
            json(res, 200, { reset: true, note: 'No active session' });
          }
        } catch (err: any) {
          json(res, 500, { error: err.message });
        }
        return;
      }

      if (method === 'GET' && p === '/api/workspace') {
        const ws = ctx.runtime.currentWorkspace;
        const session = ctx.runtime.getSession();
        json(res, 200, {
          status: ctx.runtime.currentStatus,
          fingerprint: session.fingerprint,
          profile: session.profile,
          presentation: ws.presentation,
        });
        return;
      }

      if (method === 'GET' && p === '/api/understanding') {
        const session = ctx.runtime.getSession();
        const understanding = session.understanding;
        if (!understanding) {
          json(res, 503, { error: 'Understanding not yet available', understanding: null });
          return;
        }
        json(res, 200, understanding);
        return;
      }

      if (method === 'GET' && p === '/api/sessions') {
        const sessions = await ctx.sessions.listSessions();
        json(res, 200, { sessions });
        return;
      }

      if (method === 'POST' && p === '/api/sessions') {
        const raw = await readBody(req);
        const body = raw ? (JSON.parse(raw) as { title?: string; objective?: string }) : {};
        const title = body.title?.trim() || 'Untitled session';
        const objective = body.objective?.trim() || title;
        const session = await ctx.sessions.createSession(title, objective);
        broadcast({
          id: `evt-${Date.now()}`,
          type: 'session.created',
          actor: getActor(req, ctx),
          sessionId: session.id,
          artifactId: session.id,
          message: `Session created by ${actorOf(req)}: ${title}`,
          timestamp: new Date().toISOString(),
          payload: { session },
        });
        json(res, 201, { session });
        return;
      }

      // Reserved session paths — must be checked before the generic /api/sessions/:id match
      if (method === 'GET' && p === '/api/sessions/executions') {
        try {
          const sessions = await ctx.agents.listExecutionSessions();
          json(res, 200, { sessions });
        } catch {
          json(res, 200, { sessions: [] });
        }
        return;
      }

      const sessionMatch = p.match(/^\/api\/sessions\/([^/]+)$/);
      if (method === 'GET' && sessionMatch) {
        const id = decodeURIComponent(sessionMatch[1]);
        const session = await ctx.sessions.getSession(id);
        if (!session) {
          json(res, 404, { error: 'session not found' });
          return;
        }
        const events = await ctx.sessions.getEvents(id);
        json(res, 200, { session, events });
        return;
      }

      if (method === 'PUT' && p === '/api/milestones') {
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        if (!ctx.milestones || !body.version) {
          json(res, 400, { error: 'Invalid request' });
          return;
        }
        const updated = ctx.milestones.updateMilestone(body.version, body.data || {});
        if (!updated) {
          json(res, 404, { error: 'Milestone not found' });
          return;
        }
        json(res, 200, { milestone: updated });
        // Trigger workspace-ui tester on milestone update
        if (ctx.onMilestoneUpdate) ctx.onMilestoneUpdate(body.version);
        return;
      }

      if (method === 'GET' && p === '/api/milestones') {
        if (ctx.milestones) {
          // Backfill milestones for any feature requests without one
          const existingVersions = new Set(ctx.milestones.list().map((m: any) => m.version));
          for (const req of featureRequests) {
            const v = `FR-${req.id.replace('req-', '')}`;
            if (!existingVersions.has(v)) {
              ctx.milestones.addMilestone({
                version: v,
                name: req.title,
                description: req.description || `Feature request: ${req.title}`,
                status: 'pending',
              });
              existingVersions.add(v);
            }
          }
          json(res, 200, {
            milestones: ctx.milestones.list(),
            byEra: ctx.milestones.getByEra(),
            current: ctx.milestones.getCurrent(),
            progress: ctx.milestones.getProgress(),
          });
        } else {
          json(res, 200, {
            milestones: [],
            byEra: {},
            current: null,
            progress: { total: 0, completed: 0, inProgress: 0, pending: 0 },
          });
        }
        return;
      }

      if (method === 'GET' && p === '/api/routes') {
        json(res, 200, {
          routes: [
            {
              path: '/api/auth/me',
              method: 'GET',
              description: 'Get current user info and user list',
              requiresAuth: false,
            },
            {
              path: '/api/auth/login',
              method: 'POST',
              description: 'Login with username or token',
              requiresAuth: false,
            },
            {
              path: '/api/admin/users',
              method: 'GET',
              description: 'List all users (admin only)',
              requiresAuth: true,
            },
            {
              path: '/api/admin/users',
              method: 'POST',
              description: 'Create a new user (admin only)',
              requiresAuth: true,
            },
            {
              path: '/api/admin/users/:id/rotate-token',
              method: 'POST',
              description: 'Rotate a user API token (admin only)',
              requiresAuth: true,
            },
            {
              path: '/api/admin/audit-log',
              method: 'GET',
              description: 'Audit log with optional filters (admin only)',
              requiresAuth: true,
            },
            {
              path: '/api/health',
              method: 'GET',
              description: 'System health status and uptime metrics',
              requiresAuth: false,
            },
            {
              path: '/api/settings',
              method: 'GET',
              description: 'Retrieve user preferences and configuration',
              requiresAuth: true,
            },
            {
              path: '/api/settings',
              method: 'PUT',
              description: 'Update user preferences and configuration',
              requiresAuth: true,
            },
            { path: '/api/activity', method: 'GET', description: 'Activity log and system events', requiresAuth: true },
            { path: '/api/activity-log', method: 'GET', description: 'Activity log entries', requiresAuth: true },
            {
              path: '/api/notifications',
              method: 'GET',
              description: 'List notifications with unread count',
              requiresAuth: true,
            },
            {
              path: '/api/notifications/read-all',
              method: 'POST',
              description: 'Mark all notifications as read',
              requiresAuth: true,
            },
            {
              path: '/api/notifications/:id/read',
              method: 'POST',
              description: 'Mark a single notification as read',
              requiresAuth: true,
            },
            {
              path: '/api/agents',
              method: 'GET',
              description: 'List all registered AI agents with execution stats',
              requiresAuth: true,
            },
            {
              path: '/api/agents/:id/run',
              method: 'POST',
              description: 'Execute an agent with a given task',
              requiresAuth: true,
            },
            {
              path: '/api/analyze-feature',
              method: 'POST',
              description: 'Analyze a feature request using AI',
              requiresAuth: true,
            },
            {
              path: '/api/analyze-workspace',
              method: 'POST',
              description: 'Deep workspace analysis with AI insights',
              requiresAuth: true,
            },
            {
              path: '/api/approvals',
              method: 'GET',
              description: 'Pending and historical approvals',
              requiresAuth: true,
            },
            {
              path: '/api/artifacts',
              method: 'GET',
              description: 'Artifact dependency chain and metadata',
              requiresAuth: true,
            },
            {
              path: '/api/background/run',
              method: 'POST',
              description: 'Run background analysis services',
              requiresAuth: true,
            },
            {
              path: '/api/capabilities',
              method: 'GET',
              description: 'List all agent capabilities',
              requiresAuth: true,
            },
            { path: '/api/changesets', method: 'GET', description: 'Change set history', requiresAuth: true },
            {
              path: '/api/chat/send',
              method: 'POST',
              description: 'Send a chat message and get response',
              requiresAuth: false,
            },
            {
              path: '/api/chat/stream',
              method: 'GET',
              description: 'Stream chat responses via SSE',
              requiresAuth: false,
            },
            {
              path: '/api/collab/submit',
              method: 'POST',
              description: 'Submit a change set for review',
              requiresAuth: true,
            },
            {
              path: '/api/collab/approve',
              method: 'POST',
              description: 'Approve a submitted change set',
              requiresAuth: true,
            },
            {
              path: '/api/collab/reject',
              method: 'POST',
              description: 'Reject a submitted change set',
              requiresAuth: true,
            },
            {
              path: '/api/explain',
              method: 'GET',
              description: 'Explain architecture, modules, or symbols',
              requiresAuth: false,
            },
            {
              path: '/api/implement',
              method: 'POST',
              description: 'Generate implementation from a plan',
              requiresAuth: true,
            },
            {
              path: '/api/implement/apply',
              method: 'POST',
              description: 'Apply a change set to disk',
              requiresAuth: true,
            },
            {
              path: '/api/memory',
              method: 'GET',
              description: 'Agent memory and knowledge entries',
              requiresAuth: true,
            },
            {
              path: '/api/memory/index',
              method: 'POST',
              description: 'Trigger memory re-indexing',
              requiresAuth: true,
            },
            {
              path: '/api/milestones',
              method: 'GET',
              description: 'Milestone list with progress and era grouping',
              requiresAuth: false,
            },
            {
              path: '/api/milestones',
              method: 'PUT',
              description: 'Update milestone status or metadata',
              requiresAuth: true,
            },
            {
              path: '/api/models',
              method: 'GET',
              description: 'Available AI models per provider',
              requiresAuth: false,
            },
            { path: '/api/plans', method: 'GET', description: 'List engineering plans', requiresAuth: true },
            {
              path: '/api/plans/:id/recommendations',
              method: 'GET',
              description: 'AI-powered implementation recommendations',
              requiresAuth: true,
            },
            {
              path: '/api/projects',
              method: 'GET',
              description: 'List projects with tasks and stats',
              requiresAuth: true,
            },
            {
              path: '/api/repl/execute',
              method: 'POST',
              description: 'Execute a REPL command via the CLI',
              requiresAuth: true,
            },
            { path: '/api/requests', method: 'GET', description: 'Feature requests list', requiresAuth: true },
            { path: '/api/schedules', method: 'GET', description: 'Agent schedules list', requiresAuth: true },
            { path: '/api/schedules', method: 'POST', description: 'Create a new agent schedule', requiresAuth: true },
            {
              path: '/api/schedules/run-due',
              method: 'POST',
              description: 'Execute all due schedules',
              requiresAuth: true,
            },
            { path: '/api/sessions', method: 'GET', description: 'Engineering sessions list', requiresAuth: true },
            {
              path: '/api/sessions/executions',
              method: 'GET',
              description: 'Execution sessions list',
              requiresAuth: true,
            },
            {
              path: '/api/sessions/executions/start',
              method: 'POST',
              description: 'Start a new execution workflow',
              requiresAuth: true,
            },
            { path: '/api/settings', method: 'PUT', description: 'Update platform settings', requiresAuth: true },
            { path: '/api/sprints', method: 'GET', description: 'Active and completed sprints', requiresAuth: true },
            {
              path: '/api/suggestions',
              method: 'GET',
              description: 'AI-powered workspace suggestions',
              requiresAuth: true,
            },
            { path: '/api/teams', method: 'GET', description: 'Agent teams list', requiresAuth: true },
            { path: '/api/verifications', method: 'GET', description: 'Verification reports list', requiresAuth: true },
            { path: '/api/verify', method: 'GET', description: 'Verify a change set', requiresAuth: true },
            {
              path: '/api/workflows',
              method: 'GET',
              description: 'Available workflow definitions',
              requiresAuth: true,
            },
            { path: '/api/workspace', method: 'GET', description: 'Workspace state and metadata', requiresAuth: false },
            {
              path: '/api/workspace-ui/test-build',
              method: 'POST',
              description: 'Trigger workspace-ui test + build pipeline',
              requiresAuth: true,
            },
          ],
        });
        return;
      }

      if ((method === 'POST' || method === 'GET') && p === '/api/workspace-ui/test-build') {
        if (!ctx.runtime) {
          json(res, 503, { error: 'Workspace runtime not available' });
          return;
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
        } catch (err: any) {
          json(res, 500, { error: err.message });
        }
        return;
      }

      if (method === 'GET' && p === '/api/agents') {
        try {
          const agents = await ctx.agents.listAgents();
          const executions = await ctx.agents.listExecutions();
          // Enrich agents with stats
          const enriched = await Promise.all(
            agents.map(async (a) => ({
              ...a,
              stats: await ctx.agentService
                .getAgentStats(a.id)
                .catch(() => ({ total: 0, completed: 0, failed: 0, running: 0, successRate: 0 })),
            })),
          );
          json(res, 200, { agents: enriched, executions });
        } catch (err: any) {
          json(res, 500, { error: err.message });
        }
        return;
      }

      const agentMatch = p.match(/^\/api\/agents\/([^/]+)$/);
      if (method === 'GET' && agentMatch) {
        try {
          const id = decodeURIComponent(agentMatch[1]);
          const agent = await ctx.agents.getAgent(id);
          if (!agent) {
            json(res, 404, { error: 'agent not found' });
            return;
          }
          const executions = await ctx.agents.listExecutions(id);
          const stats = await ctx.agentService
            .getAgentStats(id)
            .catch(() => ({ total: 0, completed: 0, failed: 0, running: 0, successRate: 0 }));
          const allTeams = await ctx.agents.listTeams();
          const team = allTeams.find((t: any) => t.memberIds.includes(id) || t.id === agent.teamId);
          json(res, 200, { agent, executions, stats, team });
        } catch (err: any) {
          json(res, 500, { error: err.message });
        }
        return;
      }

      // Agent CRUD
      if (method === 'PUT' && agentMatch) {
        try {
          const id = decodeURIComponent(agentMatch[1]);
          const raw = await readBody(req);
          const body = raw ? JSON.parse(raw) : {};
          const existing = await ctx.agents.getAgent(id);
          if (!existing) {
            json(res, 404, { error: 'agent not found' });
            return;
          }
          // Validate: name is required and must be non-empty
          if (body.name !== undefined && typeof body.name === 'string' && !body.name.trim()) {
            json(res, 400, { error: 'Agent name must not be empty' });
            return;
          }
          // Filter out undefined values to avoid overwriting existing fields with undefined
          const cleanBody = Object.fromEntries(Object.entries(body).filter(([_, v]) => v !== undefined && v !== null));
          const updated: any = {
            ...existing,
            ...cleanBody,
            id,
            createdAt: existing.createdAt,
            capabilities: cleanBody.capabilities ?? existing.capabilities,
            permissions: cleanBody.permissions ?? existing.permissions,
          };
          await ctx.agents.saveAgent(updated);
          broadcast({
            id: `evt-${Date.now()}`,
            type: 'agent.updated',
            actor: getActor(req, ctx),
            sessionId: id,
            artifactId: id,
            message: `Updated agent: ${updated.name}`,
            timestamp: new Date().toISOString(),
            payload: { agent: updated },
          });
          json(res, 200, { agent: updated });
        } catch (err: any) {
          json(res, 500, { error: err.message });
        }
        return;
      }

      if (method === 'DELETE' && agentMatch) {
        try {
          const id = decodeURIComponent(agentMatch[1]);
          await ctx.agents.deleteAgent(id);
          broadcast({
            id: `evt-${Date.now()}`,
            type: 'agent.deleted',
            actor: getActor(req, ctx),
            sessionId: id,
            artifactId: id,
            message: `Deleted agent: ${id}`,
            timestamp: new Date().toISOString(),
            payload: {},
          });
          json(res, 200, { deleted: true });
        } catch (err: any) {
          json(res, 500, { error: err.message });
        }
        return;
      }

      if (method === 'POST' && p === '/api/agents') {
        if (!requireRole(req, ctx, 'editor', res)) return;
        try {
          const raw = await readBody(req);
          const body = raw ? JSON.parse(raw) : {};
          const actor = getActor(req, ctx);
          if (!body.name?.trim()) {
            json(res, 400, { error: 'name is required' });
            return;
          }
          const id = body.id || `agent-${Date.now()}`;
          const now = new Date().toISOString();
          const agent: any = {
            id,
            name: body.name.trim(),
            role: body.role || 'custom',
            description: body.description || '',
            capabilities: body.capabilities || [],
            permissions: body.permissions || [
              { resource: 'repository', action: 'read', approvalRequired: false },
              { resource: 'knowledge', action: 'read', approvalRequired: false },
            ],
            provider: body.provider || '',
            model: body.model || '',
            teamId: body.teamId || '',
            color: body.color || '#6b7280',
            status: 'active',
            createdAt: now,
          };
          await ctx.agents.saveAgent(agent);
          logAudit(ctx.audit, req, actor.id, actor.name, AuditAction.AGENT_CREATE, 'agent', id, agent.name);
          broadcast({
            id: `evt-${Date.now()}`,
            type: 'agent.created',
            actor,
            sessionId: id,
            artifactId: id,
            message: `Created agent: ${agent.name}`,
            timestamp: new Date().toISOString(),
            payload: { agent },
          });
          json(res, 201, { agent });
        } catch (err: any) {
          json(res, 500, { error: err.message });
        }
        return;
      }

      // Agent capabilities & stats endpoints
      if (method === 'GET' && p === '/api/capabilities') {
        try {
          const capabilities = ctx.agentService.listCapabilities();
          json(res, 200, { capabilities });
        } catch (err: any) {
          json(res, 500, { error: err.message });
        }
        return;
      }

      const agentStatsMatch = p.match(/^\/api\/agents\/([^/]+)\/stats$/);
      if (method === 'GET' && agentStatsMatch) {
        try {
          const id = decodeURIComponent(agentStatsMatch[1]);
          const stats = await ctx.agentService.getAgentStats(id);
          json(res, 200, { stats });
        } catch (err: any) {
          json(res, 500, { error: err.message });
        }
        return;
      }

      // Agent Team endpoints
      if (method === 'GET' && p === '/api/teams') {
        try {
          const teams = await ctx.agents.listTeams();
          // Enrich teams with agent details
          const enriched = await Promise.all(
            teams.map(async (team) => {
              const allAgents = await ctx.agents.listAgents();
              const members = allAgents.filter((a) => team.memberIds.includes(a.id) || a.teamId === team.id);
              const leader = allAgents.find((a) => a.id === team.leaderAgentId);
              const memberExecs = await Promise.all(
                members.map((m) =>
                  ctx.agentService
                    .getAgentStats(m.id)
                    .catch(() => ({ total: 0, completed: 0, failed: 0, running: 0, successRate: 0 })),
                ),
              );
              const totalExecs = memberExecs.reduce((s, st) => s + st.total, 0);
              const totalFailed = memberExecs.reduce((s, st) => s + st.failed, 0);
              return {
                ...team,
                members,
                leader,
                stats: { totalExecutions: totalExecs, failedExecutions: totalFailed, memberCount: members.length },
              };
            }),
          );
          json(res, 200, { teams: enriched });
        } catch (err: any) {
          json(res, 500, { error: err.message });
        }
        return;
      }

      const teamMatch = p.match(/^\/api\/teams\/([^/]+)$/);
      if (method === 'GET' && teamMatch) {
        try {
          const id = decodeURIComponent(teamMatch[1]);
          const team = await ctx.agents.getTeam(id);
          if (!team) {
            json(res, 404, { error: 'team not found' });
            return;
          }
          const allAgents = await ctx.agents.listAgents();
          const members = allAgents.filter((a) => team.memberIds.includes(a.id) || a.teamId === team.id);
          const leader = allAgents.find((a) => a.id === team.leaderAgentId);
          const unassigned = allAgents.filter(
            (a) =>
              a.status === 'active' &&
              !team.memberIds.includes(a.id) &&
              a.teamId !== team.id &&
              a.id !== team.leaderAgentId,
          );
          json(res, 200, { team, members, leader, unassigned });
        } catch (err: any) {
          json(res, 500, { error: err.message });
        }
        return;
      }

      if (method === 'POST' && p === '/api/teams') {
        try {
          const raw = await readBody(req);
          const body = raw ? JSON.parse(raw) : {};
          if (!body.name?.trim()) {
            json(res, 400, { error: 'Team name is required' });
            return;
          }
          const id = body.id || `team-${Date.now()}`;
          const now = new Date().toISOString();
          const team: any = {
            id,
            name: body.name.trim(),
            description: body.description || '',
            leaderAgentId: body.leaderAgentId || '',
            memberIds: body.memberIds || [],
            sharedContext: body.sharedContext || '',
            activeWorkflowId: body.activeWorkflowId || '',
            createdAt: now,
          };
          await ctx.agents.saveTeam(team);
          // Update agent teamIds
          for (const memberId of team.memberIds) {
            const agent = await ctx.agents.getAgent(memberId);
            if (agent) {
              agent.teamId = team.id;
              await ctx.agents.saveAgent(agent);
            }
          }
          json(res, 201, { team });
        } catch (err: any) {
          json(res, 500, { error: err.message });
        }
        return;
      }

      if (method === 'PUT' && teamMatch) {
        try {
          const id = decodeURIComponent(teamMatch[1]);
          const raw = await readBody(req);
          const body = raw ? JSON.parse(raw) : {};
          const existing = await ctx.agents.getTeam(id);
          if (!existing) {
            json(res, 404, { error: 'team not found' });
            return;
          }
          const updated = { ...existing, ...body, id };
          await ctx.agents.saveTeam(updated);
          json(res, 200, { team: updated });
        } catch (err: any) {
          json(res, 500, { error: err.message });
        }
        return;
      }

      // Team member management
      const teamMembersMatch = p.match(/^\/api\/teams\/([^/]+)\/members$/);
      if (method === 'POST' && teamMembersMatch) {
        try {
          const id = decodeURIComponent(teamMembersMatch[1]);
          const raw = await readBody(req);
          const body = raw ? JSON.parse(raw) : {};
          const team = await ctx.agents.getTeam(id);
          if (!team) {
            json(res, 404, { error: 'team not found' });
            return;
          }
          if (body.add) {
            for (const agentId of body.add) {
              if (!team.memberIds.includes(agentId)) team.memberIds.push(agentId);
              const agent = await ctx.agents.getAgent(agentId);
              if (agent) {
                agent.teamId = team.id;
                await ctx.agents.saveAgent(agent);
              }
            }
          }
          if (body.remove) {
            team.memberIds = team.memberIds.filter((mid) => !body.remove.includes(mid));
            for (const agentId of body.remove) {
              const agent = await ctx.agents.getAgent(agentId);
              if (agent) {
                agent.teamId = '';
                await ctx.agents.saveAgent(agent);
              }
            }
          }
          if (body.leaderAgentId) team.leaderAgentId = body.leaderAgentId;
          await ctx.agents.saveTeam(team);
          json(res, 200, { team });
        } catch (err: any) {
          json(res, 500, { error: err.message });
        }
        return;
      }

      if (method === 'DELETE' && teamMatch) {
        try {
          const id = decodeURIComponent(teamMatch[1]);
          const team = await ctx.agents.getTeam(id);
          if (team) {
            for (const memberId of team.memberIds) {
              const agent = await ctx.agents.getAgent(memberId);
              if (agent) {
                agent.teamId = '';
                await ctx.agents.saveAgent(agent);
              }
            }
          }
          await ctx.agents.deleteTeam(id);
          json(res, 200, { deleted: true });
        } catch (err: any) {
          json(res, 500, { error: err.message });
        }
        return;
      }

      // Schedule endpoints
      if (method === 'GET' && p === '/api/schedules') {
        try {
          const schedules = await ctx.agents.listSchedules();
          const due = await ctx.agents.getDueSchedules().catch(() => []);
          json(res, 200, { schedules, due });
        } catch (err: any) {
          json(res, 500, { error: err.message });
        }
        return;
      }

      if (method === 'POST' && p === '/api/schedules') {
        if (!requireRole(req, ctx, 'editor', res)) return;
        const actor = getActor(req, ctx);
        try {
          const raw = await readBody(req);
          const body = raw ? JSON.parse(raw) : {};
          const id = body.id || `sched-${Date.now()}`;
          const now = new Date().toISOString();
          const nextRun =
            body.nextRunAt ||
            (body.frequency === 'hourly'
              ? new Date(Date.now() + 3600000).toISOString()
              : new Date(Date.now() + 86400000).toISOString());
          await ctx.agents.saveSchedule({
            id,
            agentId: body.agentId,
            task: body.task,
            frequency: body.frequency || 'once',
            cronExpression: body.cronExpression,
            nextRunAt: nextRun,
            enabled: true,
            createdAt: now,
          });
          logAudit(ctx.audit, req, actor.id, actor.name, AuditAction.SCHEDULE_CREATE, 'schedule', id, body.task);
          json(res, 201, {
            schedule: {
              id,
              agentId: body.agentId,
              task: body.task,
              frequency: body.frequency || 'once',
              nextRunAt: nextRun,
              enabled: true,
            },
          });
        } catch (err: any) {
          json(res, 500, { error: err.message });
        }
        return;
      }

      const schedMatch = p.match(/^\/api\/schedules\/([^/]+)$/);
      if (method === 'DELETE' && schedMatch) {
        if (!requireRole(req, ctx, 'admin', res)) return;
        const actor = getActor(req, ctx);
        try {
          const id = decodeURIComponent(schedMatch[1]);
          await ctx.agents.deleteSchedule(id);
          logAudit(ctx.audit, req, actor.id, actor.name, AuditAction.SCHEDULE_DELETE, 'schedule', id);
          json(res, 200, { deleted: true });
        } catch (err: any) {
          json(res, 500, { error: err.message });
        }
        return;
      }

      if (method === 'POST' && p === '/api/schedules/run-due') {
        if (!requireRole(req, ctx, 'editor', res)) return;
        const actor = getActor(req, ctx);
        try {
          const due = await ctx.agents.getDueSchedules();
          logAudit(
            ctx.audit,
            req,
            actor.id,
            actor.name,
            AuditAction.SCHEDULE_RUN_DUE,
            'schedule',
            undefined,
            `Due: ${due.length} schedules`,
          );
          const results: any[] = [];
          for (const s of due) {
            try {
              await ctx.agentRuntime.run(s.agentId, s.task, ctx.runtime.getSession());
              await ctx.agents.updateScheduleRun(s.id, 'completed');
              results.push({ scheduleId: s.id, status: 'completed' });
            } catch (err: any) {
              await ctx.agents.updateScheduleRun(s.id, 'failed');
              results.push({ scheduleId: s.id, status: 'failed', error: err.message });
            }
          }
          // Also run background services on schedule tick
          ctx.orchestrator.runBackgroundServices(ctx.runtime.getSession()).catch(() => {});
          json(res, 200, { ran: results.length, results });
        } catch (err: any) {
          json(res, 500, { error: err.message });
        }
        return;
      }

      // Activity log endpoints
      if (method === 'GET' && p === '/api/activity-log') {
        try {
          const events = ctx.activityStore ? await ctx.activityStore.query({ limit: 100 }) : [];
          json(res, 200, { events });
        } catch {
          json(res, 200, { events: [] });
        }
        return;
      }

      // Feature request endpoints
      if (method === 'GET' && p === '/api/requests') {
        json(res, 200, { requests: featureRequests });
        return;
      }

      if (method === 'POST' && p === '/api/requests') {
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        if (!body.title) {
          json(res, 400, { error: 'Title required' });
          return;
        }
        const now = new Date().toISOString();
        const request = {
          id: `req-${++reqIdCounter}`,
          title: body.title,
          description: body.description || '',
          category: body.category || 'feature',
          priority: body.priority || 'medium',
          status: 'submitted',
          votes: 0,
          createdAt: now,
          updatedAt: now,
          tags: body.tags || [],
        };
        featureRequests.push(request);
        // Create a linked milestone and broadcast
        if (ctx.milestones) {
          ctx.milestones.addMilestone({
            version: `FR-${reqIdCounter}`,
            name: body.title,
            description: body.description || `Feature request: ${body.title}`,
            status: 'pending',
          });
        }
        broadcast({
          id: `evt-${Date.now()}`,
          type: 'milestone:completed',
          actor: getActor(req, ctx),
          sessionId: request.id,
          artifactId: request.id,
          message: `Feature request created: ${body.title}`,
          timestamp: new Date().toISOString(),
          payload: { milestone: { version: `FR-${reqIdCounter}`, name: body.title } },
        });
        json(res, 201, request);
        return;
      }

      const reqMatch = p.match(/^\/api\/requests\/([^/]+)$/);
      if (method === 'PUT' && reqMatch) {
        const id = decodeURIComponent(reqMatch[1]);
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        const idx = featureRequests.findIndex((r) => r.id === id);
        if (idx === -1) {
          json(res, 404, { error: 'Not found' });
          return;
        }
        const oldStatus = featureRequests[idx].status;
        const reqTitle = featureRequests[idx].title;
        const reqDesc = featureRequests[idx].description;
        featureRequests[idx] = { ...featureRequests[idx], ...body, id, updatedAt: new Date().toISOString() };
        // Sync status to the linked milestone and broadcast
        if (ctx.milestones && body.status && body.status !== oldStatus) {
          const msStatus =
            body.status === 'completed'
              ? ('completed' as const)
              : body.status === 'planned' || body.status === 'in_progress'
                ? ('in_progress' as const)
                : ('pending' as const);
          ctx.milestones.updateMilestone(`FR-${id.replace('req-', '')}`, { status: msStatus });
          // Auto-trigger execution when feature request moves to in_progress
          if (body.status === 'in_progress' && ctx.orchestrator) {
            try {
              const session = ctx.runtime.getSession();
              const goal = `${reqTitle}: ${reqDesc || reqTitle}`;
              const exSession = await ctx.orchestrator.startSession(goal, 'feature', session);
              if (exSession) {
                broadcast({
                  id: `evt-${Date.now()}`,
                  type: 'session.created',
                  actor: { id: 'system', name: 'System', type: 'system' },
                  sessionId: exSession.id,
                  artifactId: exSession.id,
                  message: `Auto-started execution for: ${reqTitle}`,
                  timestamp: new Date().toISOString(),
                  payload: { session: exSession },
                });
              }
            } catch (e) {
              console.error('Auto-execution failed', e);
            }
          }
          broadcast({
            id: `evt-${Date.now()}`,
            type: 'milestone:completed',
            actor: getActor(req, ctx),
            sessionId: id,
            artifactId: id,
            message: `Feature request ${id} → ${body.status}`,
            timestamp: new Date().toISOString(),
            payload: { milestone: { version: `FR-${id.replace('req-', '')}`, status: body.status } },
          });
        }
        json(res, 200, featureRequests[idx]);
        return;
      }

      if (method === 'DELETE' && reqMatch) {
        const id = decodeURIComponent(reqMatch[1]);
        const idx = featureRequests.findIndex((r) => r.id === id);
        if (idx === -1) {
          json(res, 404, { error: 'Not found' });
          return;
        }
        featureRequests.splice(idx, 1);
        json(res, 200, { success: true });
        return;
      }

      // Project endpoints
      if (method === 'GET' && p === '/api/projects') {
        if (!ctx.projects) {
          json(res, 200, { projects: [] });
          return;
        }
        const projects = await ctx.projects.listProjects();
        const withStats = await Promise.all(
          projects.map(async (p) => ({ ...p, stats: await ctx.projects!.getProjectStats(p.id) })),
        );
        json(res, 200, { projects: withStats });
        return;
      }

      if (method === 'GET' && p === '/api/sprints') {
        try {
          const allSprints = ctx.projects ? await ctx.projects.listSprints() : [];
          const active = allSprints.filter((s: any) => s.status === 'active');
          json(res, 200, { sprints: allSprints, active });
        } catch (err: any) {
          json(res, 500, { error: err.message });
        }
        return;
      }

      const projDetail = p.match(/^\/api\/projects\/([^/]+)$/);
      if (method === 'GET' && projDetail) {
        const id = decodeURIComponent(projDetail[1]);
        const project = await ctx.projects?.getProject(id);
        if (!project) {
          json(res, 404, { error: 'project not found' });
          return;
        }
        const [tasks, sprints, stats] = await Promise.all([
          ctx.projects!.listTasks(id),
          ctx.projects!.listSprints(id),
          ctx.projects!.getProjectStats(id),
        ]);
        json(res, 200, { project, tasks, sprints, stats });
        return;
      }

      if (method === 'POST' && p === '/api/projects') {
        if (!requireRole(req, ctx, 'editor', res)) return;
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        const actor = getActor(req, ctx);
        const project = await ctx.projects?.createProject(body.name || 'New Project', body.description);
        logAudit(
          ctx.audit,
          req,
          actor.id,
          actor.name,
          AuditAction.PROJECT_CREATE,
          'project',
          project?.id,
          project?.name,
        );
        broadcast({
          id: `evt-${Date.now()}`,
          type: 'project.created',
          actor,
          sessionId: project?.id,
          artifactId: project?.id,
          message: `Created project: ${project?.name}`,
          timestamp: new Date().toISOString(),
          payload: { project },
        });
        json(res, 201, { project });
        return;
      }

      if (method === 'POST' && p.match(/^\/api\/projects\/([^/]+)\/tasks$/)) {
        const projectId = decodeURIComponent(p.match(/^\/api\/projects\/([^/]+)\/tasks$/)![1]);
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        const task = await ctx.projects?.createTask(projectId, body.title || 'New Task', body);
        json(res, 201, { task });
        return;
      }

      const taskDetail = p.match(/^\/api\/tasks\/([^/]+)$/);
      if (method === 'PATCH' && taskDetail) {
        const id = decodeURIComponent(taskDetail[1]);
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        if (body.status) await ctx.projects?.updateTaskStatus(id, body.status);
        json(res, 200, { updated: true });
        return;
      }

      if (method === 'DELETE' && projDetail) {
        const id = decodeURIComponent(projDetail[1]);
        await ctx.projects?.updateProject(id, { status: 'cancelled' });
        json(res, 200, { deleted: true });
        return;
      }

      if (method === 'GET' && p === '/api/activity') {
        if (ctx.activityService?.query) {
          const qs = new URL(req.url, `http://127.0.0.1:${port}`).searchParams;
          const options: Record<string, any> = {};
          if (qs.get('category')) options.category = qs.get('category');
          if (qs.get('type')) options.type = qs.get('type');
          if (qs.get('limit')) options.limit = parseInt(qs.get('limit')!, 10);
          if (qs.get('before')) options.before = qs.get('before');
          const events = await ctx.activityService.query(options);
          json(res, 200, { events, total: events.length });
        } else {
          json(res, 200, { events: [], total: 0, note: 'Activity service not available' });
        }
        return;
      }

      // ── Notification Center ──────────────────────────────
      if (method === 'GET' && p === '/api/notifications') {
        const qs = new URL(req.url, `http://127.0.0.1:${port}`).searchParams;
        const limit = qs.get('limit') ? parseInt(qs.get('limit')!, 10) : 50;
        const unreadOnly = qs.get('unreadOnly') === 'true';
        const category = qs.get('category') || undefined;
        const before = qs.get('before') || undefined;

        if (ctx.notificationService) {
          const [notifications, unreadCount] = await Promise.all([
            ctx.notificationService.list({ limit, unreadOnly, category, before }),
            ctx.notificationService.unreadCount(),
          ]);
          json(res, 200, { notifications, unreadCount });
        } else {
          json(res, 200, { notifications: [], unreadCount: 0, note: 'Notification service not available' });
        }
        return;
      }

      if (method === 'POST' && p === '/api/notifications/read-all') {
        if (ctx.notificationService) {
          const count = await ctx.notificationService.markAllRead();
          json(res, 200, { markedRead: count });
        } else {
          json(res, 200, { markedRead: 0 });
        }
        return;
      }

      if (method === 'POST' && p.startsWith('/api/notifications/') && p.endsWith('/read')) {
        const id = p.replace('/api/notifications/', '').replace('/read', '');
        if (ctx.notificationService) {
          await ctx.notificationService.markRead(id);
          json(res, 200, { ok: true });
        } else {
          json(res, 200, { ok: false, note: 'Notification service not available' });
        }
        return;
      }

      if (method === 'GET' && p === '/api/artifacts') {
        const fingerprintId = ctx.runtime.getSession().fingerprint.id;
        const [plans, changeSets, collab] = await Promise.all([
          ctx.plans.list(fingerprintId),
          ctx.changeSets.listByWorkspace(fingerprintId),
          ctx.collaboration.listByWorkspace(fingerprintId),
        ]);
        json(res, 200, {
          chain: ['explanation', 'plan', 'changeset', 'verification', 'approval'],
          plans,
          changeSets,
          collaboration: collab,
        });
        return;
      }

      if (method === 'GET' && p === '/api/approvals') {
        const fingerprintId = ctx.runtime.getSession().fingerprint.id;
        const records = await ctx.collaboration.listByWorkspace(fingerprintId);
        const pending = records.filter(
          (r) => r.status === 'submitted' || r.status === 'reviewing' || r.status === 'draft',
        );
        json(res, 200, { records, pending });
        return;
      }

      if (method === 'GET' && p === '/api/memory') {
        const q = url.searchParams.get('q') ?? '';
        if (q) {
          const nodes = await ctx.knowledgeGraph.searchNodes(q, 20);
          const enriched = await Promise.all(
            nodes.map(async (node) => ({
              node,
              relations: await ctx.knowledgeGraph.getRelations(node.id),
            })),
          );
          json(res, 200, { results: enriched });
          return;
        }
        const [nodes, relations, stats] = await Promise.all([
          ctx.knowledgeGraph.getAllNodes(),
          ctx.knowledgeGraph.getAllRelations(),
          ctx.knowledgeGraph.getStats(),
        ]);
        json(res, 200, { nodes, relations, stats });
        return;
      }

      if (method === 'POST' && p === '/api/memory/index') {
        const session = ctx.runtime.getSession();
        const report = await ctx.memory.index(session);
        json(res, 200, { nodes: report.nodes, relations: report.relations, duration: report.duration });
        return;
      }

      if (method === 'POST' && p === '/api/explain') {
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        const target = body.target?.trim();
        if (!target) {
          json(res, 400, { error: 'target is required' });
          return;
        }
        const result = await ctx.explainService.explain(target, ctx.runtime.getSession());
        json(res, 200, result);
        return;
      }

      if (method === 'GET' && p === '/api/plans') {
        const fingerprintId = ctx.runtime.getSession().fingerprint.id;
        const plans = await ctx.plans.list(fingerprintId);
        json(res, 200, { plans });
        return;
      }

      if (method === 'POST' && p === '/api/plans') {
        if (!requireRole(req, ctx, 'editor', res)) return;
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        const goal = body.goal?.trim();
        if (!goal) {
          json(res, 400, { error: 'goal is required' });
          return;
        }
        const actor = getActor(req, ctx);
        const result = await ctx.planningService.createPlan(goal, ctx.runtime.getSession());
        logAudit(
          ctx.audit,
          req,
          actor.id,
          actor.name,
          AuditAction.PLAN_CREATE,
          'plan',
          result.plan.id,
          `Goal: ${goal.slice(0, 200)}`,
        );
        broadcast({
          id: `evt-${Date.now()}`,
          type: 'plan.created',
          actor,
          sessionId: ctx.runtime.getSession().fingerprint.id,
          artifactId: result.plan.id,
          message: `Plan created by ${actorOf(req)}: ${result.plan.title}`,
          timestamp: new Date().toISOString(),
          payload: { plan: result.plan, source: result.source },
        });
        json(res, 201, result);
        return;
      }

      const planApproveMatch = p.match(/^\/api\/plans\/([^/]+)\/approve$/);
      if (method === 'POST' && planApproveMatch) {
        const planId = decodeURIComponent(planApproveMatch[1]);
        const plan = await ctx.planningService.updatePlanStatus(planId, 'approved');
        if (!plan) {
          json(res, 404, { error: 'plan not found' });
          return;
        }

        // Auto-assign agents via ExecutionPlanner
        try {
          const p = await ctx.planningService.getPlan(planId);
          if (p) {
            const execution = await ctx.executionPlanner.createExecutionPlan(p);
            await ctx.planningService.updatePlanExecution(planId, execution);
          }
        } catch (err: any) {
          console.warn('Execution planning failed:', err.message);
        }

        // Re-fetch plan after potential execution update
        const finalPlan = plan || (await ctx.planningService.getPlan(planId));

        broadcast({
          id: `evt-${Date.now()}`,
          type: 'plan.approved',
          actor: getActor(req, ctx),
          sessionId: ctx.runtime.getSession().fingerprint.id,
          artifactId: planId,
          message: `Plan approved by ${actorOf(req)}: ${(finalPlan as any)?.title || planId}`,
          timestamp: new Date().toISOString(),
          payload: { plan: finalPlan },
        });

        // Create execution session automatically
        try {
          const sess = ctx.runtime.getSession();
          const exSession = await ctx.orchestrator.startSession((finalPlan as any)?.goal || planId, 'feature', sess);
          await ctx.planningService.updatePlanExecution(planId, { sessionId: exSession.id });
        } catch (err: any) {
          console.warn('Auto-execution start failed:', err.message);
        }

        json(res, 200, { plan: finalPlan });
        return;
      }

      if (method === 'POST' && p === '/api/implement') {
        if (!requireRole(req, ctx, 'editor', res)) return;
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        const planId = body.planId?.trim();
        if (!planId) {
          json(res, 400, { error: 'planId is required' });
          return;
        }
        const actor = getActor(req, ctx);
        const result = await ctx.implementationService.implement(planId, ctx.runtime.getSession());
        logAudit(
          ctx.audit,
          req,
          actor.id,
          actor.name,
          AuditAction.IMPLEMENT_START,
          'plan',
          planId,
          `ChangeSet: ${result.changeSet.id}`,
        );
        broadcast({
          id: `evt-${Date.now()}`,
          type: 'changeset.created',
          actor,
          sessionId: ctx.runtime.getSession().fingerprint.id,
          artifactId: result.changeSet.id,
          message: `Change Set created by ${actorOf(req)}: ${result.changeSet.title}`,
          timestamp: new Date().toISOString(),
          payload: { changeSet: result.changeSet, source: result.source },
        });
        json(res, 201, result);
        return;
      }

      if (method === 'GET' && p === '/api/changesets') {
        const fingerprintId = ctx.runtime.getSession().fingerprint.id;
        const changeSets = await ctx.changeSets.listByWorkspace(fingerprintId);
        json(res, 200, { changeSets });
        return;
      }

      const csMatch = p.match(/^\/api\/changesets\/([^/]+)$/);
      if (method === 'GET' && csMatch) {
        const id = decodeURIComponent(csMatch[1]);
        const cs = await ctx.changeSets.get(id);
        if (!cs) {
          json(res, 404, { error: 'change set not found' });
          return;
        }
        json(res, 200, { changeSet: cs });
        return;
      }

      if (method === 'POST' && p === '/api/implement/apply') {
        if (!requireRole(req, ctx, 'editor', res)) return;
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        const csId = body.changeSetId?.trim();
        if (!csId) {
          json(res, 400, { error: 'changeSetId is required' });
          return;
        }
        const actor = getActor(req, ctx);
        const cs = await ctx.implementationService.apply(csId, ctx.runtime.getSession());
        logAudit(ctx.audit, req, actor.id, actor.name, AuditAction.IMPLEMENT_APPLY, 'changeset', csId, cs.title);
        broadcast({
          id: `evt-${Date.now()}`,
          type: 'changeset.applied',
          actor,
          sessionId: ctx.runtime.getSession().fingerprint.id,
          artifactId: cs.id,
          message: `Change Set applied by ${actorOf(req)}: ${cs.title}`,
          timestamp: new Date().toISOString(),
          payload: { changeSet: cs },
        });
        json(res, 200, { changeSet: cs });
        return;
      }

      if (method === 'POST' && p === '/api/verify') {
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        const changeSetId = body.changeSetId?.trim();
        if (!changeSetId) {
          json(res, 400, { error: 'changeSetId is required' });
          return;
        }
        const result = await ctx.verificationService.verify(changeSetId, ctx.runtime.getSession());
        broadcast({
          id: `evt-${Date.now()}`,
          type: 'verification.completed',
          actor: getActor(req, ctx),
          sessionId: ctx.runtime.getSession().fingerprint.id,
          artifactId: result.report.id,
          message: `Verification completed by ${actorOf(req)} for change set ${changeSetId}`,
          timestamp: new Date().toISOString(),
          payload: { report: result.report },
        });
        json(res, 200, result);
        return;
      }

      if (method === 'GET' && p === '/api/verifications') {
        const fingerprintId = ctx.runtime.getSession().fingerprint.id;
        const verifications = await ctx.verifications.listByWorkspace(fingerprintId);
        json(res, 200, { verifications });
        return;
      }

      if (method === 'POST' && p === '/api/collab/submit') {
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        const changeSetId = body.changeSetId?.trim();
        const planId = body.planId?.trim();
        if (!changeSetId || !planId) {
          json(res, 400, { error: 'changeSetId and planId are required' });
          return;
        }
        const record = await ctx.collaborationService.submit(changeSetId, planId, ctx.runtime.getSession());
        broadcast({
          id: `evt-${Date.now()}`,
          type: 'collab.submitted',
          actor: getActor(req, ctx),
          sessionId: ctx.runtime.getSession().fingerprint.id,
          artifactId: record.id,
          message: `Change Set ${changeSetId} submitted for review by ${actorOf(req)}`,
          timestamp: new Date().toISOString(),
          payload: { record },
        });
        json(res, 201, { record });
        return;
      }

      if (method === 'POST' && p === '/api/collab/approve') {
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        const recordId = body.recordId?.trim();
        if (!recordId) {
          json(res, 400, { error: 'recordId is required' });
          return;
        }
        const record = await ctx.collaborationService.approve(recordId, actorOf(req));
        broadcast({
          id: `evt-${Date.now()}`,
          type: 'collab.approved',
          actor: getActor(req, ctx),
          sessionId: ctx.runtime.getSession().fingerprint.id,
          artifactId: record.id,
          message: `Collaboration record ${recordId} approved by ${actorOf(req)}`,
          timestamp: new Date().toISOString(),
          payload: { record },
        });
        json(res, 200, { record });
        return;
      }

      if (method === 'POST' && p === '/api/collab/reject') {
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        const recordId = body.recordId?.trim();
        const reason = body.reason?.trim() ?? 'Rejected via dashboard';
        if (!recordId) {
          json(res, 400, { error: 'recordId is required' });
          return;
        }
        const record = await ctx.collaborationService.reject(recordId, actorOf(req), reason);
        broadcast({
          id: `evt-${Date.now()}`,
          type: 'collab.rejected',
          actor: getActor(req, ctx),
          sessionId: ctx.runtime.getSession().fingerprint.id,
          artifactId: record.id,
          message: `Collaboration record ${recordId} rejected by ${actorOf(req)}`,
          timestamp: new Date().toISOString(),
          payload: { record },
        });
        json(res, 200, { record });
        return;
      }

      if (method === 'GET' && p === '/api/suggestions') {
        const session = ctx.runtime.getSession();
        const excludeDismissed = req.url?.includes('excludeDismissed=true');
        const suggestions = await ctx.suggestionService.generate(session, { excludeDismissed });
        json(res, 200, { suggestions });
        return;
      }

      const acceptMatch = p.match(/^\/api\/suggestions\/([^/]+)\/accept$/);
      if (method === 'POST' && acceptMatch) {
        const suggestionId = decodeURIComponent(acceptMatch[1]);
        await ctx.suggestionService.trackAction(suggestionId, 'accepted');
        const suggestions = await ctx.suggestionService.generate(ctx.runtime.getSession());
        const suggestion = suggestions.find((s) => s.id === suggestionId);
        if (!suggestion) {
          json(res, 404, { error: 'suggestion not found' });
          return;
        }
        const result = await ctx.planningService.createPlan(suggestion.title, ctx.runtime.getSession());
        json(res, 200, { plan: result.plan, source: result.source, suggestion: suggestion.id });
        return;
      }

      const dismissMatch = p.match(/^\/api\/suggestions\/([^/]+)\/dismiss$/);
      if (method === 'POST' && dismissMatch) {
        const suggestionId = decodeURIComponent(dismissMatch[1]);
        await ctx.suggestionService.dismiss(suggestionId);
        await ctx.suggestionService.trackAction(suggestionId, 'dismissed');
        json(res, 200, { dismissed: true });
        return;
      }

      // Plan recommendations
      const planRecMatch = p.match(/^\/api\/plans\/([^/]+)\/recommendations\/?$/);
      if (method === 'GET' && planRecMatch) {
        const planId = decodeURIComponent(planRecMatch[1]);
        const result = await ctx.suggestionService.planRecommendations(planId, ctx.runtime.getSession());
        json(res, 200, { recommendations: result });
        return;
      }

      // Feature analysis
      if (method === 'POST' && p === '/api/analyze-feature') {
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        if (!body.feature?.trim()) {
          json(res, 400, { error: 'feature is required' });
          return;
        }
        const result = await ctx.suggestionService.featureAnalysis(body.feature, ctx.runtime.getSession());
        json(res, 200, { analysis: result });
        return;
      }

      // Workspace analysis
      if (method === 'POST' && p === '/api/analyze-workspace') {
        try {
          const session = ctx.runtime.getSession();
          const analysis = await ctx.workspaceAnalyst.analyze(session);
          json(res, 200, { analysis });
        } catch (err: any) {
          json(res, 500, { error: err.message });
        }
        return;
      }

      const runAgentMatch = p.match(/^\/api\/agents\/([^/]+)\/run$/);
      if (method === 'POST' && runAgentMatch) {
        if (!requireRole(req, ctx, 'editor', res)) return;
        const actor = getActor(req, ctx);
        try {
          const agentId = decodeURIComponent(runAgentMatch[1]);
          const raw = await readBody(req);
          const body = raw ? JSON.parse(raw) : {};
          const task = body.task?.trim();
          if (!task) {
            json(res, 400, { error: 'task is required' });
            return;
          }
          // Use AgentService for validation (checks enabled, permissions)
          const result = await ctx.agentService.runAgent(agentId, task, ctx.runtime.getSession());
          if (!result.success) {
            json(res, 400, { error: result.message });
            return;
          }
          logAudit(ctx.audit, req, actor.id, actor.name, AuditAction.AGENT_RUN, 'agent', agentId, task.slice(0, 200));
          json(res, 200, { execution: result.execution, agent: result.agent, message: result.message });
        } catch (err: any) {
          json(res, 500, { error: err.message });
        }
        return;
      }

      if (method === 'POST' && p === '/api/repl/execute') {
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        const command = body.command?.trim();
        if (!command) {
          json(res, 400, { error: 'command is required' });
          return;
        }
        const lines: string[] = [];
        const fakeWs = {
          send: (s: string) => {
            try {
              const m = JSON.parse(s);
              if (m.op === 'output') lines.push(m.text);
            } catch {}
          },
        } as WebSocket;
        await handleReplCommand(ctx, fakeWs, command);
        json(res, 200, { output: lines.join('\n') });
        return;
      }

      if (method === 'GET' && p === '/api/models') {
        const provider = ctx.kernel.providerManager?.getProvider('opencode') ?? null;
        const models = provider ? await (provider as any).listModels() : [];
        json(res, 200, { models });
        return;
      }

      if (method === 'POST' && p === '/api/chat/send') {
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        const message = body.message?.trim();
        if (!message) {
          json(res, 400, { error: 'message is required' });
          return;
        }
        const model = body.model?.trim() || 'nemotron-3-ultra-free';
        const response = await chatComplete(ctx, message, model);
        json(res, 200, { response });
        return;
      }

      if (method === 'POST' && p === '/api/chat/stream') {
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        const message = body.message?.trim();
        if (!message) {
          json(res, 400, { error: 'message is required' });
          return;
        }
        const model = body.model?.trim() || 'nemotron-3-ultra-free';
        const session = ctx.runtime.getSession();
        const profile = session.profile;
        const provider = ctx.kernel.providerManager?.getProvider('opencode') ?? null;
        if (!provider?.stream) {
          json(res, 503, { error: 'streaming not available' });
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          ...CORS,
        });
        const systemPrompt = [
          'You are Vestara, an AI engineering assistant.',
          `Workspace: ${profile.name}`,
          `Language: ${profile.language}`,
          `Framework: ${profile.framework || '(none)'}`,
          `Files: ${profile.fileCount}`,
          `Packages: ${profile.packageCount}`,
          'Keep responses concise and actionable.',
        ].join('\n');
        try {
          const stream = provider.stream({
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: message },
            ],
            model,
          });
          for await (const chunk of stream) {
            if (chunk.type === 'text' && chunk.content) {
              res.write(`data: ${JSON.stringify({ type: 'text', content: chunk.content })}\n\n`);
            }
            if (chunk.type === 'complete') {
              res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
            }
          }
        } catch (err: any) {
          res.write(`data: ${JSON.stringify({ type: 'error', content: err.message })}\n\n`);
        } finally {
          res.end();
        }
        return;
      }

      // ─── Agent Memory API ───────────────────────────────────
      if (method === 'GET' && p.startsWith('/api/agents/')) {
        const memMatch = p.match(/^\/api\/agents\/([^/]+)\/memory$/);
        if (memMatch) {
          const agentId = decodeURIComponent(memMatch[1]);
          const q = url.searchParams.get('q') ?? '';
          const memories = q ? await ctx.agents.searchMemory(agentId, q) : await ctx.agents.listMemory(agentId);
          json(res, 200, { memories });
          return;
        }
      }

      if (method === 'POST' && p.startsWith('/api/agents/')) {
        const memPostMatch = p.match(/^\/api\/agents\/([^/]+)\/memory$/);
        if (memPostMatch) {
          const agentId = decodeURIComponent(memPostMatch[1]);
          const raw = await readBody(req);
          const body = raw ? JSON.parse(raw) : {};
          const entry = {
            id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            agentId,
            type: body.type || 'observation',
            summary: body.summary || '',
            detail: body.detail || '',
            tags: body.tags || [],
            confidence: body.confidence ?? 0.5,
            createdAt: new Date().toISOString(),
          };
          await ctx.agents.saveMemory(entry);
          json(res, 201, { entry });
          return;
        }
      }

      // ─── Execution Session API ──────────────────────────────
      if (method === 'GET' && p === '/api/sessions/executions') {
        const sessions = await ctx.agents.listExecutionSessions();
        json(res, 200, { sessions });
        return;
      }

      // Audio transcription
      if (method === 'POST' && p === '/api/stt') {
        const raw = await readBody(req);
        const sizeKb = raw ? (Buffer.byteLength(raw) / 1024).toFixed(1) : '0';
        const text = `[Transcribed audio ${sizeKb}kb]`;
        json(res, 200, { text });
        return;
      }

      if (method === 'POST' && p === '/api/sessions/executions') {
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        const now = new Date().toISOString();
        const session = {
          id: `exs-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`,
          goal: body.goal || '',
          workflowId: body.workflowId,
          assignedAgentIds: body.assignedAgentIds || [],
          planIds: [],
          changeSetIds: [],
          verificationIds: [],
          logs: [],
          timeline: [],
          approvals: [],
          metrics: { duration: 0, totalSteps: 0, completedSteps: 0, artifactCount: 0 },
          status: 'queued' as const,
          createdAt: now,
        };
        await ctx.agents.saveExecutionSession(session);
        json(res, 201, { session });
        return;
      }

      const exsMatch = p.match(/^\/api\/sessions\/executions\/([^/]+)$/);
      if (method === 'GET' && exsMatch) {
        const id = decodeURIComponent(exsMatch[1]);
        const session = await ctx.agents.getExecutionSession(id);
        if (!session) {
          json(res, 404, { error: 'execution session not found' });
          return;
        }
        json(res, 200, { session });
        return;
      }

      if (method === 'PATCH' && exsMatch) {
        const id = decodeURIComponent(exsMatch[1]);
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        if (body.status) await ctx.agents.updateExecutionSessionStatus(id, body.status);
        if (body.timeline) await ctx.agents.updateExecutionSessionTimeline(id, body.timeline);
        const session = await ctx.agents.getExecutionSession(id);
        json(res, 200, { session });
        return;
      }

      // ─── Session Orchestrator API ────────────────────────────
      if (method === 'GET' && p === '/api/workflows') {
        json(res, 200, { workflows: ctx.orchestrator.listWorkflows() });
        return;
      }

      if (method === 'POST' && p === '/api/sessions/executions/start') {
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        if (!body.goal || !body.workflow) {
          json(res, 400, { error: 'goal and workflow are required' });
          return;
        }
        try {
          const session = ctx.runtime.getSession();
          const exSession = await ctx.orchestrator.startSession(body.goal, body.workflow, session);
          json(res, 201, { session: exSession });
        } catch (err: any) {
          json(res, 400, { error: err.message });
        }
        return;
      }

      if (method === 'POST' && p === '/api/background/run') {
        try {
          const sess = ctx.runtime.getSession();
          await ctx.orchestrator.runBackgroundServices(sess);
          json(res, 200, { ok: true });
        } catch (err: any) {
          json(res, 500, { error: err.message });
        }
        return;
      }

      json(res, 404, { error: 'not found' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'internal error';
      json(res, 500, { error: message });
    }
  });

  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    clients.add(ws);
    wsSend(ws, {
      op: 'event',
      event: {
        id: `evt-hello-${Date.now()}`,
        type: 'system.heartbeat',
        actor: { id: 'system', name: 'System', type: 'system' },
        timestamp: new Date().toISOString(),
        message: 'connected',
        payload: { clients: clients.size },
      },
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(String(data)) as WsClientMessage;
        if (msg.op === 'ping') {
          wsSend(ws, { op: 'pong' });
          return;
        }
        if (msg.op === 'subscribe') {
          wsSend(ws, { op: 'subscribed', channels: msg.channels ?? ['workspace'] });
          return;
        }
        if ((msg as any).op === 'repl') {
          handleReplCommand(ctx, ws, (msg as any).command || '');
          return;
        }
      } catch {
        wsSend(ws, { op: 'error', error: 'invalid message' });
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
    });
  });

  server.on('connection', (socket) => {
    socket.on('error', (err: any) => {
      if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return;
      console.error('[server] socket error:', err.message);
    });
  });

  const api = server as ApiServer;
  api.broadcast = broadcast;
  return api;
}

function replSend(ws: WebSocket, text: string): void {
  wsSend(ws, { op: 'output', text });
}

async function handleReplCommand(ctx: WorkspaceContext, ws: WebSocket, raw: string): Promise<void> {
  const trimmed = raw.trim();
  if (!trimmed) {
    replSend(ws, '\n');
    return;
  }

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  const args = parts.slice(1);
  const rest = args.join(' ');
  const session = ctx.runtime.getSession();
  const profile = session.profile;

  try {
    switch (cmd) {
      case 'help': {
        const cmds = [
          ['explain <target>', 'Explain architecture or module'],
          ['plan <goal>', 'Create a plan from a goal'],
          ['plan list', 'List all plans'],
          ['plan delete all', 'Delete all plans'],
          ['plan approve <id>', 'Approve a draft plan'],
          ['implement <plan-id>', 'Generate a change set from a plan'],
          ['implement apply', 'Apply the latest change set'],
          ['verify <cs-id>', 'Verify a change set'],
          ['collab list', 'List collaboration records'],
          ['agent list', 'List available agents'],
          ['agent run <id> <task>', 'Run an agent'],
          ['memory search <q>', 'Search knowledge graph'],
          ['memory stats', 'Show knowledge graph stats'],
          ['suggest', 'Get AI-powered suggestions'],
          ['suggest clear', 'Dismiss current suggestions'],
          ['status', 'Show workspace status'],
          ['clear', 'Clear terminal'],
          ['help', 'Show this message'],
        ];
        const maxLen = Math.max(...cmds.map((c) => c[0].length));
        const lines = ['Available commands:', ''];
        for (const [cmd, desc] of cmds) {
          lines.push(`  ${cmd.padEnd(maxLen + 4)}${desc}`);
        }
        replSend(ws, lines.join('\n'));
        break;
      }

      case 'clear':
        wsSend(ws, { op: 'clear' });
        break;

      case 'status':
        replSend(
          ws,
          [
            `Workspace: ${profile.name}`,
            `Language:  ${profile.language}`,
            `Manager:   ${profile.packageManager}`,
            `Files:     ${profile.fileCount}`,
            `Packages:  ${profile.packageCount}`,
            `Deps:      ${profile.dependencyCount}`,
            `Monorepo:  ${profile.isMonorepo}`,
            `Session:   ${session.fingerprint.id}`,
            `Indexed:   ${session.isIndexReady}`,
          ].join('\n'),
        );
        break;

      case 'explain': {
        if (!rest) {
          replSend(ws, 'Usage: explain <target>');
          break;
        }
        const result = await ctx.explainService.explain(rest, session);
        replSend(ws, result.content);
        break;
      }

      case 'plan': {
        const sub = args[0];
        if (sub === 'list') {
          const plans = await ctx.plans.list(session.fingerprint.id);
          if (plans.length === 0) {
            replSend(ws, 'No plans.');
            break;
          }
          const maxId = Math.max(...plans.map((p: any) => p.id.length));
          replSend(ws, plans.map((p: any) => `  ${p.id.padEnd(maxId)}  ${p.status.padEnd(12)} ${p.title}`).join('\n'));
        } else if (sub === 'delete' && args[1] === 'all') {
          const count = await ctx.planningService.deleteAllPlans(session.fingerprint.id);
          replSend(ws, `Deleted ${count} plan(s).`);
        } else if (sub === 'approve') {
          const id = args[1];
          if (!id) {
            replSend(ws, 'Usage: plan approve <id>');
            break;
          }
          const plan = await ctx.planningService.updatePlanStatus(id, 'approved', session);
          if (!plan) {
            replSend(ws, `Plan "${id}" not found.`);
            break;
          }
          replSend(ws, `Plan ${id} approved.`);
        } else {
          const goal = rest;
          const result = await ctx.planningService.createPlan(goal, session);
          replSend(
            ws,
            `Plan ${result.plan.id} created (${result.source}): ${result.plan.title}\n  ${result.plan.tasks?.length || 0} task(s) · ${result.plan.status}`,
          );
        }
        break;
      }

      case 'implement': {
        const sub = args[0];
        if (sub === 'apply') {
          const css = await ctx.changeSets.listByWorkspace(session.fingerprint.id);
          const latest = css.filter((c: any) => c.status === 'draft').reverse()[0];
          if (!latest) {
            replSend(ws, 'No draft change sets to apply.');
            break;
          }
          await ctx.implementationService.apply(latest.id, session);
          replSend(ws, `Change Set ${latest.id} applied.`);
        } else if (sub) {
          const result = await ctx.implementationService.implement(sub, session);
          replSend(
            ws,
            `Change Set ${result.changeSet.id} created (${result.source}): ${result.changeSet.files.length} file(s)`,
          );
        } else {
          replSend(ws, 'Usage: implement <plan-id> or implement apply');
        }
        break;
      }

      case 'verify': {
        const csId = args[0];
        if (!csId) {
          replSend(ws, 'Usage: verify <cs-id>');
          break;
        }
        const result = await ctx.verificationService.verify(csId, session);
        const r = result.report;
        replSend(
          ws,
          [
            `Verification ${r.id}: ${r.status}`,
            `  ${r.summary.passed}/${r.summary.total} checks passed`,
            ...r.checks.map((c: any) => `  ${c.status === 'passed' ? '✓' : '✗'} ${c.type} (${c.durationMs}ms)`),
          ].join('\n'),
        );
        break;
      }

      case 'collab': {
        if (args[0] === 'list') {
          const items = await ctx.collaboration.listByWorkspace(session.fingerprint.id);
          if (items.length === 0) {
            replSend(ws, 'No collaboration records.');
            break;
          }
          replSend(ws, items.map((c: any) => `  ${c.id}  ${c.status.padEnd(12)} ${c.title.slice(0, 50)}`).join('\n'));
        } else {
          replSend(ws, 'Usage: collab list');
        }
        break;
      }

      case 'agent': {
        if (args[0] === 'list') {
          const agents = await ctx.agents.listAgents();
          replSend(
            ws,
            agents
              .map((a: any) => `  ${a.id}  ${a.status.padEnd(10)} ${a.name} (${a.capabilities.length} capabilities)`)
              .join('\n'),
          );
        } else if (args[0] === 'run') {
          const agentId = args[1];
          const task = args.slice(2).join(' ');
          if (!agentId || !task) {
            replSend(ws, 'Usage: agent run <id> <task>');
            break;
          }
          const result = await ctx.agentRuntime.run(agentId, task, session);
          replSend(ws, `Agent ${agentId} run: ${result.execution.id} (${result.execution.status})`);
        } else {
          replSend(ws, 'Usage: agent list | agent run <id> <task>');
        }
        break;
      }

      case 'memory': {
        if (args[0] === 'stats') {
          const stats = await ctx.knowledgeGraph.getStats();
          replSend(ws, `Nodes: ${stats.nodes}  Relations: ${stats.relations}`);
        } else if (args[0] === 'search') {
          const query = args.slice(1).join(' ');
          if (!query) {
            replSend(ws, 'Usage: memory search <query>');
            break;
          }
          const results = await ctx.knowledgeGraph.searchNodes(query);
          if (results.length === 0) {
            replSend(ws, 'No results.');
            break;
          }
          replSend(ws, results.map((r: any) => `  ${r.name} (${r.type})`).join('\n'));
        } else {
          replSend(ws, 'Usage: memory search <query> | memory stats');
        }
        break;
      }

      case 'suggest': {
        if (args[0] === 'clear' || args[0] === 'delete') {
          replSend(ws, 'Suggestions are ephemeral — new ones will be generated next time you run suggest.');
          break;
        }
        const suggestions = await ctx.suggestionService.generate(session);
        if (suggestions.length === 0) {
          replSend(ws, 'No suggestions.');
          break;
        }
        replSend(
          ws,
          suggestions
            .map(
              (s: any, i: number) =>
                `  ${i + 1}. [${s.priority}] ${s.title}${s.description ? `\n     ${s.description}` : ''}`,
            )
            .join('\n'),
        );
        break;
      }

      default:
        replSend(ws, `Unknown command: ${cmd}. Type 'help' for available commands.`);
    }
  } catch (err: any) {
    replSend(ws, `Error: ${err.message}`);
  }

  wsSend(ws, { op: 'prompt' });
}

function wsSend(ws: WebSocket, data: unknown): void {
  try {
    ws.send(JSON.stringify(data));
  } catch {
    /* client disconnected */
  }
}

async function chatComplete(ctx: WorkspaceContext, message: string, model = 'nemotron-3-ultra-free'): Promise<string> {
  const session = ctx.runtime.getSession();
  const profile = session.profile;
  const provider = ctx.kernel.providerManager?.getProvider('opencode') ?? null;

  if (!provider) return 'AI provider not available.';

  try {
    const systemPrompt = [
      'You are Vestara, an AI engineering assistant embedded in the Vestara Engineering Workspace.',
      'You have access to the following workspace context:',
      '',
      `Workspace: ${profile.name}`,
      `Language: ${profile.language}`,
      `Framework: ${profile.framework || '(none)'}`,
      `Monorepo: ${profile.isMonorepo}`,
      `Files: ${profile.fileCount}`,
      `Packages: ${profile.packageCount}`,
      `Dependencies: ${profile.dependencyCount}`,
      `Entry Points: ${profile.entryPoints.length}`,
      `Health Score: ${profile.healthScore ? `${profile.healthScore.overall}/10` : 'N/A'}`,
      '',
      'You can help the user with:',
      '- Explaining architecture and code',
      '- Planning features and improvements',
      '- Suggesting refactoring opportunities',
      '- Answering questions about the workspace',
      '- Guiding through the Vestara workflow (explain → plan → implement → verify → collaborate)',
      '',
      'Keep responses concise and actionable. When suggesting code changes, reference specific files.',
    ].join('\n');

    const result = await provider.complete({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      temperature: 0.5,
      maxTokens: 2048,
    });

    return result.content || 'No response.';
  } catch (err: any) {
    return `Error: ${err.message}`;
  }
}

// === CHANGE: Register health route in server ===
// Task ID: T-2
// Import the health route handler in src/server.ts and attach it to the appropriate path (e.g., /api/health). Ensure it is mounted before other routes or error handlers.
