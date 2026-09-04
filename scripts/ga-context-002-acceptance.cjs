/**
 * GA-CONTEXT-002 §17 — live acceptance: turn-time surface awareness.
 * Real conversation SSE path with surfaceContext per scenario. Observes
 * tool activity for page/workspace questions (expected 0 discovery calls).
 * No credentials reported.
 */

/* eslint-disable no-console */
const BASE = 'http://127.0.0.1:3001';
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

async function turn(conversationId, surface, question) {
  const res = await fetch(`${BASE}/api/conversations/${conversationId}/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: question, surfaceContext: surface }),
  });
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
          /* skip */
        }
      }
    }
  }
  const events = frames.map((f) => f.event).filter(Boolean);
  const text = events
    .filter((e) => e.type === 'delta')
    .map((e) => e.content ?? '')
    .join('');
  const toolEvents = events.filter((e) => e.type === 'tool' || e.type === 'tool_result');
  const toolNames = [...new Set(toolEvents.map((e) => e.name ?? '').filter(Boolean))];
  const errors = events.filter((e) => e.type === 'error').length;
  const done = events.filter((e) => e.type === 'done').length;
  return { text, toolNames, toolCount: toolEvents.length, errors, done };
}

(async () => {
  const created = await (
    await fetch(`${BASE}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
  ).json();
  const conversationId = created.conversation.id;
  const ws = { id: 'ws-x', name: 'vestara-ai-core' };

  const scenarios = [
    {
      label: 'DASHBOARD',
      surface: {
        workspace: ws,
        surface: { routeId: '/dashboard', path: '/dashboard', title: 'Dashboard', section: 'Workspace' },
      },
      q: 'Which page am I on?',
    },
    {
      label: 'AGENTS',
      surface: {
        workspace: ws,
        surface: { routeId: '/agents', path: '/agents', title: 'Agent Control', section: 'Workspace' },
      },
      q: 'Which page am I on now?',
    },
    {
      label: 'MARKETPLACE',
      surface: {
        workspace: ws,
        surface: { routeId: '/marketplace', path: '/marketplace', title: 'Marketplace', section: 'Workspace' },
      },
      q: 'What screen am I viewing?',
    },
    {
      label: 'WORKSPACE',
      surface: {
        workspace: ws,
        surface: { routeId: '/dashboard', path: '/dashboard', title: 'Dashboard', section: 'Workspace' },
      },
      q: 'What workspace is this?',
    },
  ];

  let discoveryToolCalls = 0;
  for (const s of scenarios) {
    const r = await turn(conversationId, s.surface, s.q);
    const readTools = r.toolNames.filter((n) => ['read', 'glob', 'grep', 'bash', 'ls', 'cat'].includes(n));
    discoveryToolCalls += readTools.length;
    console.log(`\n=== ${s.label} ===`);
    console.log('answer:', JSON.stringify(r.text.slice(0, 400)));
    console.log(
      'tool calls:',
      r.toolNames.join(', ') || '(none)',
      '| count:',
      r.toolCount,
      '| errors:',
      r.errors,
      '| done:',
      r.done,
    );
  }
  console.log('\npage/workspace-discovery tool calls (read/glob/grep/bash):', discoveryToolCalls);
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
