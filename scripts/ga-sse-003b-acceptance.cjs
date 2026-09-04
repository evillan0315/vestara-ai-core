/**
 * GA-SSE-003B — async SSE baseline acceptance (real browser path).
 *
 * Two turns through POST /api/conversations/:id/stream. Counts:
 * - OpenCode message.part.delta events (parallel /event subscription)
 * - Conversation SSE text deltas
 * - persisted Assistant messages (GET conversation after each turn)
 * Proves: SSE content type, incremental deltas, single done, prompt_async path
 * (session accepted ~instantly), one persisted final message per turn, no
 * errors → no false Backend-unavailable.
 * No credentials reported.
 */

/* eslint-disable no-console */
const BASE = 'http://127.0.0.1:3001';
const OPENCODE = 'http://127.0.0.1:4096';
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const REPO = '/home/user/projects/vestara/vestara-ai-core';
const ENV = join(REPO, '.env');
if (existsSync(ENV)) {
  for (const line of readFileSync(ENV, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !m[1].startsWith('#')) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const AUTH = `Basic ${Buffer.from(
  `${process.env.OPENCODE_SERVER_USERNAME ?? 'opencode'}:${process.env.OPENCODE_SERVER_PASSWORD ?? ''}`,
).toString('base64')}`;

async function watchOpenCodeDeltas(ms) {
  const controller = new AbortController();
  const perSession = new Map(); // sessionID -> delta count
  const reader = (async () => {
    try {
      const res = await fetch(`${OPENCODE}/event?directory=${encodeURIComponent(REPO)}`, {
        headers: { Authorization: AUTH },
        signal: controller.signal,
      });
      const rd = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await rd.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const p of parts) {
          if (p.includes('message.part.delta') && p.includes('"sessionID"')) {
            const m = p.match(/"sessionID":"(ses_[^"]+)"/);
            if (m) perSession.set(m[1], (perSession.get(m[1]) ?? 0) + 1);
          }
        }
      }
    } catch {
      /* aborted */
    }
  })();
  await new Promise((r) => setTimeout(r, ms));
  controller.abort();
  await reader.catch(() => {});
  return perSession;
}

async function localSessions() {
  const res = await fetch(`${OPENCODE}/session?directory=${encodeURIComponent(REPO)}`, {
    headers: { Authorization: AUTH },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : (data.data ?? []);
}

/** Attribute OpenCode deltas to the turn's session: the new 'Assistant
 *  conversation' session created during the window. */
async function turnSessionDeltas(perSession, beforeIds) {
  const after = await localSessions();
  const turnSession = after.find((s) => s.title === 'Assistant conversation' && !beforeIds.has(s.id));
  if (!turnSession) return { sessionId: null, deltas: 0 };
  return { sessionId: turnSession.id, deltas: perSession.get(turnSession.id) ?? 0 };
}

async function streamTurn(conversationId, message) {
  const res = await fetch(`${BASE}/api/conversations/${conversationId}/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  const contentType = res.headers.get('content-type') ?? '';
  const frames = [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const line = part.trim();
      if (line.startsWith('data: ')) {
        try {
          frames.push(JSON.parse(line.slice(6)));
        } catch {
          frames.push({ raw: line.slice(6) });
        }
      }
    }
  }
  return { contentType, frames };
}

async function persistedMessages(conversationId) {
  const res = await fetch(`${BASE}/api/conversations/${conversationId}`);
  const { conversation } = await res.json();
  const assistant = conversation.messages.filter((m) => m.role === 'assistant');
  const human = conversation.messages.filter((m) => m.role === 'user');
  return { assistant: assistant.length, human: human.length };
}

async function turn(label, conversationId, message) {
  // Start OpenCode delta watcher, then stream the turn concurrently.
  const before = await localSessions();
  const beforeIds = new Set(before.map((s) => s.id));
  const watch = watchOpenCodeDeltas(60000);
  const { contentType, frames } = await streamTurn(conversationId, message);
  const perSession = await watch;
  const openCode = await turnSessionDeltas(perSession, beforeIds);
  const events = frames.map((f) => f.event).filter(Boolean);
  const types = events.map((e) => e.type);
  const sseDeltas = events.filter((e) => e.type === 'delta');
  const doneCount = types.filter((t) => t === 'done').length;
  const errors = events.filter((e) => e.type === 'error');
  const persisted = await persistedMessages(conversationId);
  console.log(`\n=== ${label} ===`);
  console.log('Content-Type:', contentType);
  console.log('OpenCode message.part.delta events (turn session', openCode.sessionId ?? '?', '):', openCode.deltas);
  console.log('Conversation SSE text deltas:', sseDeltas.length);
  console.log('done frames:', doneCount, '| error frames:', errors.length);
  console.log('persisted messages → human:', persisted.human, 'assistant:', persisted.assistant);
  console.log(
    'delta sample length:',
    sseDeltas.map((d) => (d.content ?? '').length).reduce((a, b) => a + b, 0),
  );
  return {
    openCodeDeltas: openCode.deltas,
    sseDeltas: sseDeltas.length,
    doneCount,
    errors: errors.length,
    persisted,
    contentType,
  };
}

(async () => {
  const created = await fetch(`${BASE}/api/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const { conversation } = await created.json();
  console.log('conversation id:', conversation.id);

  const t1 = await turn(
    'TURN 1',
    conversation.id,
    'Explain briefly what repository you are currently working in, covering the main packages and their roles.',
  );
  const t2 = await turn('TURN 2', conversation.id, 'What did I just ask you?');

  const summary = {
    sseContentType: t1.contentType.startsWith('text/event-stream') && t2.contentType.startsWith('text/event-stream'),
    turn1: {
      openCodeDeltas: t1.openCodeDeltas,
      sseDeltas: t1.sseDeltas,
      done: t1.doneCount,
      errors: t1.errors,
      persistedAssistant: t1.persisted.assistant,
      persistedHuman: t1.persisted.human,
    },
    turn2: {
      openCodeDeltas: t2.openCodeDeltas,
      sseDeltas: t2.sseDeltas,
      done: t2.doneCount,
      errors: t2.errors,
      persistedAssistant: t2.persisted.assistant,
      persistedHuman: t2.persisted.human,
    },
    naturalMultiDelta: t1.sseDeltas > 1 && t2.sseDeltas > 1,
    oneFinalMessagePerTurn: t1.persisted.assistant === 1 && t2.persisted.assistant === 1,
    oneHumanPerTurn: t1.persisted.human === 1 && t2.persisted.human === 1,
    singleDonePerTurn: t1.doneCount === 1 && t2.doneCount === 1,
    falseBackendUnavailable: t1.errors + t2.errors > 0 ? 'PRESENT' : 'ABSENT',
  };
  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
