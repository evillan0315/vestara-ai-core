/**
 * Orchestration routes — multi-agent workflow orchestration (ADR-118).
 *
 * Exposes the WorkflowOrchestrator's project/plan/task lifecycle over HTTP.
 * Each phase is driven explicitly so callers can interpose human approval;
 * `POST .../execute` dispatches task waves through the harness and
 * `POST .../verify` closes the loop with verification.passed.
 */

import type * as http from 'node:http';
import type { CreateTaskInput } from '@vestara/workflow-orchestrator';
import { requireRole } from '../auth';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

interface Body {
  [key: string]: unknown;
}

function bodyOf(raw: string): Body {
  return raw ? (JSON.parse(raw) as Body) : {};
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function bool(value: unknown): boolean {
  return value === true || value === 'true';
}

function taskInputs(value: unknown): CreateTaskInput[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Body => Boolean(item) && typeof item === 'object')
    .map((item, index) => {
      const summary = str(item.summary) ?? `Task ${index + 1}`;
      const dependencies = Array.isArray(item.dependencies) ? item.dependencies.map(String) : [];
      const files = Array.isArray(item.files) ? item.files.map(String) : [];
      const capabilities = Array.isArray(item.requiredCapabilities) ? item.requiredCapabilities.map(String) : [];
      return {
        planId: '',
        summary,
        description: str(item.description) ?? '',
        files,
        dependencies,
        effort: item.effort === 'small' || item.effort === 'large' ? item.effort : 'medium',
        requiredCapabilities: capabilities,
      };
    });
}

export async function handleOrchestrationRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  const orchestrator = ctx.workflowOrchestrator;

  // POST /api/orchestration/projects — create a new orchestrated project.
  if (method === 'POST' && p === '/api/orchestration/projects') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const body = bodyOf(await readBody(req));
    const name = str(body.name);
    const goal = str(body.goal);
    if (!name || !goal) {
      json(res, 400, { error: 'name and goal are required' });
      return true;
    }
    const workspaceId = ctx.runtime.getSession().fingerprint.id;
    const project = await orchestrator.createProject({
      name,
      goal,
      repoPath: str(body.repoPath) ?? ctx.repoPath,
      workspaceId,
    });
    json(res, 201, { project, snapshot: await orchestrator.snapshot(project.id) });
    return true;
  }

  const phaseMatch = p.match(/^\/api\/orchestration\/projects\/([^/]+)\/([a-z-]+)$/);
  if (phaseMatch && method === 'POST') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const projectId = decodeURIComponent(phaseMatch[1]);
    const action = phaseMatch[2];
    const body = bodyOf(await readBody(req));
    const goalOf = (value: unknown): string => str(value) ?? '';
    try {
      switch (action) {
        case 'start': {
          json(res, 200, { snapshot: await orchestrator.startProject(projectId) });
          return true;
        }
        case 'analysis': {
          json(res, 200, {
            snapshot: await orchestrator.completeAnalysis(projectId, {
              analystId: str(body.analystId) ?? 'analyst',
              report: (body.report as Body) ?? {},
            }),
          });
          return true;
        }
        case 'plan': {
          const tasks = taskInputs(body.tasks);
          if (tasks.length === 0) {
            json(res, 400, { error: 'tasks are required' });
            return true;
          }
          json(res, 200, {
            snapshot: await orchestrator.generatePlan(projectId, {
              plannerId: str(body.plannerId) ?? 'planner',
              title: goalOf(body.title),
              goal: goalOf(body.goal),
              tasks,
            }),
          });
          return true;
        }
        case 'architecture': {
          json(res, 200, {
            snapshot: await orchestrator.reviewArchitecture(projectId, {
              architectId: str(body.architectId) ?? 'architect',
              status: body.status === 'violations' ? 'violations' : 'approved',
              findings: Array.isArray(body.findings) ? (body.findings as Body[]) : undefined,
            }),
          });
          return true;
        }
        case 'approve': {
          json(res, 200, {
            snapshot: await orchestrator.approveProject(projectId, {
              approvalId: str(body.approvalId),
            }),
          });
          return true;
        }
        case 'execute': {
          json(res, 200, { snapshot: await orchestrator.runExecution(projectId) });
          return true;
        }
        case 'verify': {
          json(res, 200, {
            snapshot: await orchestrator.runVerification(projectId, {
              verifierId: str(body.verifierId) ?? 'verifier',
              report: (body.report as Body) ?? {},
              passed: bool(body.passed),
            }),
          });
          return true;
        }
        case 'cancel': {
          json(res, 200, {
            snapshot: await orchestrator.cancelProject(projectId, str(body.reason) ?? 'cancelled'),
          });
          return true;
        }
        case 'archive': {
          json(res, 200, { snapshot: await orchestrator.archiveProject(projectId) });
          return true;
        }
        case 'resume': {
          json(res, 200, { snapshot: await orchestrator.resume(projectId) });
          return true;
        }
        default:
          return false;
      }
    } catch (error) {
      json(res, 409, { error: error instanceof Error ? error.message : String(error) });
      return true;
    }
  }

  const projectMatch = p.match(/^\/api\/orchestration\/projects\/([^/]+)$/);
  if (projectMatch && method === 'GET') {
    const projectId = decodeURIComponent(projectMatch[1]);
    try {
      json(res, 200, { snapshot: await orchestrator.snapshot(projectId) });
    } catch (error) {
      json(res, 404, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  // List orchestrated projects in the workspace (UI dashboard).
  if (method === 'GET' && p === '/api/orchestration/projects') {
    const workspaceId = ctx.runtime.getSession().fingerprint.id;
    json(res, 200, { projects: await orchestrator.listProjects(workspaceId) });
    return true;
  }

  // Observability metrics for every orchestrated project in the workspace.
  if (method === 'GET' && p === '/api/orchestration/metrics') {
    const workspaceId = ctx.runtime.getSession().fingerprint.id;
    json(res, 200, { metrics: await orchestrator.listMetrics(workspaceId) });
    return true;
  }

  // Pending high-risk-change approvals for a project.
  const approvalsMatch = p.match(/^\/api\/orchestration\/projects\/([^/]+)\/approvals$/);
  if (approvalsMatch && method === 'GET') {
    const projectId = decodeURIComponent(approvalsMatch[1]);
    json(res, 200, { approvals: await orchestrator.pendingApprovals(projectId) });
    return true;
  }

  // Observability metrics for a project (PCS-025 §18).
  const metricsMatch = p.match(/^\/api\/orchestration\/projects\/([^/]+)\/metrics$/);
  if (metricsMatch && method === 'GET') {
    const projectId = decodeURIComponent(metricsMatch[1]);
    try {
      json(res, 200, { metrics: await orchestrator.metrics(projectId) });
    } catch (error) {
      json(res, 404, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  // Resolve a high-risk-change approval, then continue execution.
  const taskApprovalMatch = p.match(/^\/api\/orchestration\/projects\/([^/]+)\/tasks\/([^/]+)\/approval$/);
  if (taskApprovalMatch && method === 'POST') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const projectId = decodeURIComponent(taskApprovalMatch[1]);
    const taskId = decodeURIComponent(taskApprovalMatch[2]);
    const body = bodyOf(await readBody(req));
    try {
      const snapshot = await orchestrator.resolveTaskApproval(projectId, taskId, bool(body.approved));
      json(res, 200, { snapshot });
    } catch (error) {
      json(res, 409, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  const auditMatch = p.match(/^\/api\/orchestration\/projects\/([^/]+)\/audit$/);
  if (auditMatch && method === 'GET') {
    const projectId = decodeURIComponent(auditMatch[1]);
    const events = ctx.engineeringEvents.query({ correlationId: projectId, limit: 100_000 });
    json(res, 200, { events });
    return true;
  }

  return false;
}
