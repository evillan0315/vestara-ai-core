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
import { describeWhisperAvailability, VestaraSTTService, WhisperSTTProvider } from '@vestara/stt';
import {
  describePiperAvailability,
  listPiperVoices,
  PIPER_MAX_TEXT,
  PiperTTSProvider,
  VestaraTTSService,
} from '@vestara/tts';
import { type BrowserAction, BrowserEngineAdapter, intentToAction, parseVoiceIntent } from '@vestara/voice-browser';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

// Lazy voice services — real providers when the binaries/models are present,
// honest `unavailable` health otherwise (see describeWhisperAvailability /
// describePiperAvailability). Never throws at construction.
let sttService: VestaraSTTService | undefined;
function getSttService(): VestaraSTTService {
  if (!sttService) {
    sttService = new VestaraSTTService({});
    sttService.registerProvider(new WhisperSTTProvider());
  }
  return sttService;
}

let ttsService: VestaraTTSService | undefined;
function getTtsService(): VestaraTTSService {
  if (!ttsService) {
    ttsService = new VestaraTTSService({});
    ttsService.registerProvider(new PiperTTSProvider());
  }
  return ttsService;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

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
  if (!p.startsWith('/api/voice') && !p.startsWith('/api/tts')) return false;

  // ── Live voice endpoints (no browser runtime required) ──────────

  if (method === 'GET' && p === '/api/voice/health') {
    const stt = getSttService();
    const tts = getTtsService();
    const [sttHealth, ttsHealth] = await Promise.all([stt.healthCheck(), tts.healthCheck()]);
    const whisper = describeWhisperAvailability();
    json(res, 200, {
      stt: {
        available: sttHealth.status === 'healthy',
        provider: stt.providerName,
        latency: sttHealth.latency,
        detail: whisper.detail,
      },
      tts: {
        available: ttsHealth.status === 'healthy',
        provider: tts.providerName,
        latency: ttsHealth.latency,
        detail: describePiperAvailability().detail,
      },
      streaming: {
        supported: whisper.available,
        endpoint: '/ws/voice',
        detail: whisper.available
          ? 'Incremental utterance streaming over WS /ws/voice (?token=); batch POST /api/stt + /api/tts remain live'
          : 'WS /ws/voice requires whisper on the server — batch POST /api/stt remains the fallback',
      },
    });
    return true;
  }

  if (method === 'GET' && p === '/api/voice/models') {
    const whisper = describeWhisperAvailability();
    const piper = describePiperAvailability();
    json(res, 200, {
      sttEngines: [
        {
          id: 'browser',
          name: 'Browser Web Speech',
          available: true,
          detail: 'Built-in SpeechRecognition — no server needed, Chrome/Edge only',
        },
        {
          id: 'whisper',
          name: 'Whisper (server)',
          available: whisper.available,
          detail: whisper.detail,
        },
        {
          id: 'opencode',
          name: 'OpenCode audio model',
          available: null,
          detail: 'Audio-capable configured models via GET /api/opencode/config/providers (capabilities input.audio)',
        },
      ],
      ttsEngines: [
        {
          id: 'system',
          name: 'System voices',
          available: true,
          detail: 'Built-in speechSynthesis — no server needed',
        },
        {
          id: 'server',
          name: 'Piper (server)',
          available: piper.available,
          detail: piper.detail,
        },
        {
          id: 'opencode',
          name: 'OpenCode audio model',
          available: null,
          detail: 'Audio-capable configured models via GET /api/opencode/config/providers (capabilities output.audio)',
        },
      ],
      ttsVoices: listPiperVoices(),
    });
    return true;
  }

  if (method === 'POST' && (p === '/api/tts' || p === '/api/voice/tts')) {
    try {
      const body = await readJson(req);
      const text = str(body.text)?.trim();
      if (!text) throw new Error('tts requires non-empty text');
      if (text.length > PIPER_MAX_TEXT) throw new Error(`tts input capped at ${PIPER_MAX_TEXT} characters`);
      const voice = str(body.voice);
      const speed = num(body.speed);
      const { audio, duration } = await getTtsService().synthesize(text, {
        ...(voice ? { voice } : {}),
        ...(speed !== undefined ? { speed } : {}),
      });
      const bytes = Buffer.from(audio);
      res.writeHead(200, {
        'Content-Type': 'audio/wav',
        'Content-Length': bytes.byteLength,
        'X-Audio-Duration': duration.toFixed(2),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(bytes);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const unavailable = /not available/i.test(message);
      json(res, unavailable ? 503 : 400, { error: message });
    }
    return true;
  }

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
  throw new Error('browser runtime not configured');
}
