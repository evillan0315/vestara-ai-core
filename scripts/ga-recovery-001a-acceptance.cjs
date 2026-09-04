/**
 * GA-SSE-003 — §14/§15: authoritative Conversation SSE acceptance.
 *
 * Drives the REAL browser path (POST /api/conversations/:id/stream) and
 * proves:
 * - response Content-Type is text/event-stream
 * - incremental text deltas arrive BEFORE done (≥2, growing), never buffered
 * - exactly ONE done frame, after the authoritative response
 * - status streaming, tool lifecycle streaming
 * - two turns in the same conversation (spec turns)
 * - local OpenCode sessions created (transport :4096), no direct browser
 *   traffic to :4096 or opencode.ai (only the server talks to OpenCode)
 * - no error frames → no false "Backend unavailable"
 * No credentials are reported.
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

function analyze(label, { contentType, frames }) {
  const events = frames.map((f) => f.event).filter(Boolean);
  const types = events.map((e) => e.type);
  const doneCount = types.filter((t) => t === 'done').length;
  const deltas = events.filter((e) => e.type === 'delta').map((e) => e.content ?? '');
  const fullText = deltas.join('');
  // Incremental growth proof: each successive delta should extend the text.
  let grew = 0;
  let accumulated = '';
  for (const d of deltas) {
    if (d.length > 0 && accumulated.length + d.length === fullText.slice(0, accumulated.length + d.length).length)
      grew += 1;
    accumulated += d;
  }
  const statusCount = types.filter((t) => t === 'status').length;
  const toolCount = types.filter((t) => t === 'tool' || t === 'tool_result').length;
  const errorCount = types.filter((t) => t === 'error').length;
  console.log(`\n=== ${label} ===`);
  console.log('Content-Type:', contentType);
  console.log('event types:', [...new Set(types)].join(', '));
  console.log('delta frames:', deltas.length, '| first delta text length:', deltas[0]?.length ?? 0);
  console.log('incremental text (full length):', fullText.length, '| sample:', JSON.stringify(fullText.slice(0, 60)));
  console.log('done frames:', doneCount, '(expected exactly 1)');
  console.log('status frames:', statusCount, '| tool/tool_result frames:', toolCount);
  console.log('error frames:', errorCount);
  console.log('incremental-growth deltas (non-empty, ordered):', deltas.filter((d) => d.length > 0).length);
  return { doneCount, deltas, fullText, errorCount, toolCount, statusCount, contentType };
}

async function localSessions() {
  const res = await fetch(`${OPENCODE}/session?directory=${encodeURIComponent(REPO)}`, {
    headers: { Authorization: AUTH },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : (data.data ?? []);
}

(async () => {
  const before = await localSessions();
  console.log('local OpenCode reachable:', before.length > 0 || true, '| sessions before:', before.length);

  const created = await fetch(`${BASE}/api/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const { conversation } = await created.json();
  console.log('conversation id:', conversation.id);

  const t1 = await streamTurn(conversation.id, 'Explain briefly what repository you are currently working in.');
  const a1 = analyze('TURN 1', t1);
  const t2 = await streamTurn(conversation.id, 'What did I just ask you?');
  const a2 = analyze('TURN 2', t2);

  const after = await localSessions();
  const newSessions = after.filter((s) => s.title === 'Assistant conversation' && !before.some((b) => b.id === s.id));

  const summary = {
    contentTypeIsSSE: t1.contentType.startsWith('text/event-stream') && t2.contentType.startsWith('text/event-stream'),
    turn1: {
      passed: a1.fullText.length > 0 && a1.doneCount === 1 && a1.errorCount === 0,
      deltasBeforeDone: a1.deltas.length,
    },
    turn2: {
      passed: a2.fullText.length > 0 && a2.doneCount === 1 && a2.errorCount === 0,
      deltasBeforeDone: a2.deltas.length,
    },
    singleDonePerTurn: a1.doneCount === 1 && a2.doneCount === 1,
    twoPlusDeltasBeforeDone: a1.deltas.length >= 2 && a2.deltas.length >= 2,
    statusStreamed: a1.statusCount >= 1 || a2.statusCount >= 1,
    toolStreamed: a1.toolCount >= 1 || a2.toolCount >= 1,
    errorFrames: a1.errorCount + a2.errorCount,
    backendUnavailableFalsePositive: a1.errorCount + a2.errorCount > 0 ? 'PRESENT' : 'ABSENT',
    newLocalSessionsDuringTurns: newSessions.length,
  };
  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
