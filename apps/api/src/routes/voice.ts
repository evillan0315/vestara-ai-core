/**
 * @vestara/api — Voice Browser HTTP routes (/api/voice/*)
 *
 * Converts transcribed voice text into a browser action and executes it through
 * the governed BrowserRuntimeService via the BrowserEngineAdapter bridge. The
 * STT step happens at /api/stt (real provider) or client-side; this endpoint
 * consumes the transcript text.
 */

import type * as http from 'node:http';
import type { BrowserRuntimeService } from '@vestara/browser-runtime';
import { type BrowserAction, BrowserEngineAdapter, intentToAction, parseVoiceIntent } from '@vestara/voice-browser';
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

function bool(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

async function executeAction(adapter: BrowserEngineAdapter, action: BrowserAction): Promise<unknown> {
  switch (action.type) {
    case 'navigate':
      return adapter.navigate(action.value ?? '');
    case 'click':
      return adapter.click(action.selector ?? action.target ?? '');
    case 'type':
      return adapter.type(action.target ?? 'body', action.value ?? '');
    case 'scroll':
      return adapter.scroll(action.scrollDirection ?? 'down', action.scrollAmount);
    case 'go_back':
      return adapter.goBack();
    case 'go_forward':
      return adapter.goForward();
    case 'reload':
      return adapter.reload();
    case 'screenshot':
      return { success: true, screenshot: await adapter.screenshot() };
    case 'extract_text':
      return { success: true, extractedText: await adapter.getText(action.selector) };
    default:
      return { success: false, error: `Unsupported action: ${action.type}` };
  }
}

export async function handleVoiceRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
  _port: number,
  _url: URL,
): Promise<boolean> {
  if (!p.startsWith('/api/voice')) return false;

  try {
    const rt: BrowserRuntimeService = ctx.browserRuntime ?? (throwUnconfigured() as never);

    if (method === 'POST' && p === '/api/voice/intent') {
      const body = await readJson(req);
      const text = str(body.text);
      if (!text) throw new Error('voice intent requires text');
      const sessionId = str(body.sessionId) ?? rt.getOrCreateSession('web', 'voice').id;
      const autoApprove = bool(body.autoApprove) ?? true;

      const intent = parseVoiceIntent(text);
      if (intent.type === 'unknown') {
        json(res, 400, { error: `Unknown command: "${text}"`, intent });
        return true;
      }

      const action = intentToAction(intent);
      const adapter = new BrowserEngineAdapter(rt, sessionId, { autoApprove });
      const result = await executeAction(adapter, action);
      json(res, 200, { intent, action, result, sessionId });
      return true;
    }

    return false;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    json(res, 400, { error: message });
    return true;
  }
}

function throwUnconfigured(): never {
  throw new Error('browser runtime not configured (set VESTARA_BROWSER_URL)');
}
