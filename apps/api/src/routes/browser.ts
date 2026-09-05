/**
 * @vestara/api — Live Browser HTTP routes (/api/browser/*)
 *
 * Drives the governed BrowserRuntimeService from the UI. Every action is
 * authorized (browser.* permission rules), gated on human takeover
 * (assertAgentControl), and emits browser.* events via the kernel event bus.
 */

import type * as http from 'node:http';
import { type BrowserRuntimeService, BrowserTaskRunner } from '@vestara/browser-runtime';
import { planBrowserTask } from '@vestara/voice-browser';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function bool(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function runtime(ctx: WorkspaceContext): BrowserRuntimeService | undefined {
  return ctx.browserRuntime;
}

function requireRuntime(ctx: WorkspaceContext): BrowserRuntimeService {
  const rt = runtime(ctx);
  if (!rt) {
    throw new Error('browser runtime not configured');
  }
  return rt;
}

function requireSession(rt: BrowserRuntimeService, sessionId: string) {
  const managed = rt.getSession(sessionId);
  if (!managed) {
    throw new Error(`browser session not found: ${sessionId}`);
  }
  return managed;
}

export async function handleBrowserRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
  _port: number,
  _url: URL,
): Promise<boolean> {
  if (!p.startsWith('/api/browser')) return false;

  try {
    const rt = requireRuntime(ctx);

    if (method === 'POST' && p === '/api/browser/session') {
      const body = await readJson(req);
      const ownerId = str(body.ownerId) ?? 'web';
      const taskId = str(body.taskId) ?? 'live';
      const baseUrl = str(body.baseUrl);
      const managed = rt.getOrCreateSession(ownerId, taskId, baseUrl ? { baseUrl } : undefined);
      json(res, 200, {
        sessionId: managed.id,
        status: managed.status,
        controlMode: managed.controlMode,
        lastActivityAt: managed.lastActivityAt,
      });
      return true;
    }

    if (method === 'POST' && p === '/api/browser/close') {
      const body = await readJson(req);
      const sessionId = str(body.sessionId);
      if (sessionId) await rt.closeSession(sessionId);
      json(res, 200, { closed: true });
      return true;
    }

    if (method === 'POST' && p === '/api/browser/take-control') {
      const body = await readJson(req);
      const sessionId = str(body.sessionId);
      if (sessionId) rt.takeControl(sessionId);
      json(res, 200, { controlMode: sessionId ? 'human' : 'agent' });
      return true;
    }

    if (method === 'POST' && p === '/api/browser/return-control') {
      const body = await readJson(req);
      const sessionId = str(body.sessionId);
      if (sessionId) rt.returnControl(sessionId);
      json(res, 200, { controlMode: sessionId ? 'agent' : 'agent' });
      return true;
    }

    if (method === 'POST' && p === '/api/browser/authorize') {
      const body = await readJson(req);
      const sessionId = str(body.sessionId);
      const action = str(body.action);
      if (!sessionId || !action) throw new Error('authorize requires sessionId and action');
      const decision = await rt.authorizeAction(action, sessionId, { autoApprove: bool(body.autoApprove) ?? true });
      json(res, 200, { decision });
      return true;
    }

    // ─── Session-scoped actions ─────────────────────────────────
    if (method === 'POST' && p === '/api/browser/state') {
      const body = await readJson(req);
      const sessionId = str(body.sessionId);
      if (!sessionId) throw new Error('state requires sessionId');
      const managed = requireSession(rt, sessionId);
      json(res, 200, {
        sessionId,
        status: managed.status,
        controlMode: managed.controlMode,
        url: managed.session.lastKnownUrl(sessionId),
      });
      return true;
    }

    if (method === 'POST' && p === '/api/browser/navigate') {
      const body = await readJson(req);
      const sessionId = str(body.sessionId);
      const url = str(body.url);
      if (!sessionId || !url) throw new Error('navigate requires sessionId and url');
      rt.assertAgentControl(sessionId);
      const managed = requireSession(rt, sessionId);
      rt.recordNavigationStarted(sessionId, url);
      const result = await managed.session.navigate(url, sessionId);
      rt.recordNavigationCompleted(sessionId, result.url, result.title);
      json(res, 200, { url: result.url, title: result.title });
      return true;
    }

    if (method === 'POST' && p === '/api/browser/observe') {
      const body = await readJson(req);
      const sessionId = str(body.sessionId);
      if (!sessionId) throw new Error('observe requires sessionId');
      const managed = requireSession(rt, sessionId);
      rt.assertAgentControl(sessionId);
      const result = await managed.session.observe(sessionId);
      rt.recordObservationCreated(sessionId, result.observationId, result.elements.length);
      json(res, 200, {
        url: result.url,
        title: result.title,
        observationId: result.observationId,
        elements: result.elements,
      });
      return true;
    }

    if (method === 'POST' && p === '/api/browser/click') {
      const body = await readJson(req);
      const sessionId = str(body.sessionId);
      if (!sessionId) throw new Error('click requires sessionId');
      const managed = requireSession(rt, sessionId);
      rt.assertAgentControl(sessionId);
      const observationId = str(body.observationId);
      const ref = str(body.ref);
      const selector = str(body.selector);
      if (observationId && ref) {
        await managed.session.clickRef(observationId, ref, sessionId);
      } else if (selector) {
        await managed.session.click(selector, undefined, sessionId);
      } else {
        const x = num(body.x);
        const y = num(body.y);
        if (x === undefined || y === undefined) throw new Error('click requires selector, ref, or x/y');
        await managed.session.click('body', { x, y }, sessionId);
      }
      json(res, 200, { url: managed.session.lastKnownUrl(sessionId) });
      return true;
    }

    if (method === 'POST' && p === '/api/browser/type') {
      const body = await readJson(req);
      const sessionId = str(body.sessionId);
      const text = str(body.text);
      if (!sessionId || text === undefined) throw new Error('type requires sessionId and text');
      const managed = requireSession(rt, sessionId);
      rt.assertAgentControl(sessionId);
      const observationId = str(body.observationId);
      const ref = str(body.ref);
      const submit = bool(body.submit) ?? false;
      const selector = str(body.selector);
      if (observationId && ref) {
        await managed.session.typeRef(observationId, ref, text, submit, sessionId);
      } else if (selector) {
        await managed.session.type(selector, text, submit, sessionId);
      } else {
        throw new Error('type requires selector or ref');
      }
      json(res, 200, { url: managed.session.lastKnownUrl(sessionId) });
      return true;
    }

    if (method === 'POST' && p === '/api/browser/scroll') {
      const body = await readJson(req);
      const sessionId = str(body.sessionId);
      const direction = str(body.direction);
      if (!sessionId || !direction) throw new Error('scroll requires sessionId and direction');
      if (direction !== 'up' && direction !== 'down') throw new Error('scroll direction must be up or down');
      const managed = requireSession(rt, sessionId);
      rt.assertAgentControl(sessionId);
      await managed.session.scroll(direction, num(body.amount) ?? 500, sessionId);
      json(res, 200, { scrolled: true });
      return true;
    }

    if (method === 'POST' && p === '/api/browser/back') {
      const body = await readJson(req);
      const sessionId = str(body.sessionId);
      if (!sessionId) throw new Error('back requires sessionId');
      const managed = requireSession(rt, sessionId);
      rt.assertAgentControl(sessionId);
      const result = await managed.session.back(sessionId);
      json(res, 200, { url: result.url, title: result.title });
      return true;
    }

    if (method === 'POST' && p === '/api/browser/forward') {
      const body = await readJson(req);
      const sessionId = str(body.sessionId);
      if (!sessionId) throw new Error('forward requires sessionId');
      const managed = requireSession(rt, sessionId);
      rt.assertAgentControl(sessionId);
      const result = await managed.session.forward(sessionId);
      json(res, 200, { url: result.url, title: result.title });
      return true;
    }

    if (method === 'POST' && p === '/api/browser/reload') {
      const body = await readJson(req);
      const sessionId = str(body.sessionId);
      if (!sessionId) throw new Error('reload requires sessionId');
      const managed = requireSession(rt, sessionId);
      rt.assertAgentControl(sessionId);
      const result = await managed.session.reload(sessionId);
      json(res, 200, { url: result.url, title: result.title });
      return true;
    }

    if (method === 'POST' && p === '/api/browser/screenshot') {
      const body = await readJson(req);
      const sessionId = str(body.sessionId);
      if (!sessionId) throw new Error('screenshot requires sessionId');
      const managed = requireSession(rt, sessionId);
      // Screenshot is a passive read-only observation — no assertAgentControl.
      // The UI polls this every 2 seconds to show the viewport; it must work
      // even when a human has taken control (LB-013).
      const result = await managed.session.screenshot(sessionId);
      const dataUrl = `data:image/png;base64,${Buffer.from(result.bytes).toString('base64')}`;
      // Stream the capture over the WS so every client sees the live viewport.
      rt.recordViewportCaptured(sessionId, result.url, result.width, result.height, dataUrl);
      json(res, 200, { url: result.url, width: result.width, height: result.height, dataUrl });
      return true;
    }

    if (method === 'POST' && p === '/api/browser/instruction') {
      const body = await readJson(req);
      const sessionId = str(body.sessionId);
      const text = str(body.text);
      if (!sessionId || !text) throw new Error('instruction requires sessionId and text');
      const managed = requireSession(rt, sessionId);
      rt.assertAgentControl(sessionId);
      const plan = planBrowserTask(text, { sessionId, ownerId: managed.ownerId });
      const runner = new BrowserTaskRunner({ session: managed, runtime: rt });
      const result = await runner.run(plan.task, { liveView: bool(body.liveView) ?? true });
      json(res, 200, {
        task: result.task,
        summary: result.summary,
        success: result.success,
        cancelled: result.cancelled,
        warnings: plan.warnings,
      });
      return true;
    }

    return false;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    json(res, 400, { error: message });
    return true;
  }
}
