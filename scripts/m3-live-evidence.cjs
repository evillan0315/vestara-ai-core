/**
 * GA-UX-PREMIUM M3 — LIVE evidence capture (OpenCode 1.18.27).
 *
 * NOT part of `pnpm test`. Runs safe operations against the local OpenCode
 * headless server and records the REDACTED event → projection chain:
 *   OpenCode event → adapter interpretation → Vestara structured detail.
 *
 * Redaction: never prints raw tool inputs, provider metadata, reasoning,
 * credentials, or .env values. Evidence is identity + allowlisted fields only.
 *
 * Usage: node --env-file=.env scripts/m3-live-evidence.cjs [scenario]
 */

/* eslint-disable no-console */
const { readFileSync, existsSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const REPO = __dirname.includes('scripts') ? join(__dirname, '..') : process.cwd();
const ENV_PATH = join(REPO, '.env');
if (existsSync(ENV_PATH)) {
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !m[1].startsWith('#')) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { OpenCodeHttpClient } = require(join(REPO, 'packages/opencode-runtime/dist/client/opencode-http-client.js'));
const { resolveOpenCodeConfig } = require(join(REPO, 'packages/opencode-runtime/dist/config.js'));
const projection = require(join(REPO, 'apps/api/dist/assistant-execution-projection.js'));

const config = resolveOpenCodeConfig({ requestTimeoutMs: 60_000 });
const client = new OpenCodeHttpClient(config);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const DIRECTORY = REPO;
const SCENARIOS = {
  read: {
    label: 'read',
    prompt: 'Read package.json and tell me the package name.',
  },
  search: {
    label: 'search',
    prompt: 'Search the packages/shared/src directory for the word normalizeAssistantExecutionDetail.',
  },
  edit: {
    label: 'edit (disposable file)',
    prompt:
      'Create a disposable file at the repository root named m3-live-evidence.txt containing exactly the text M3-live-evidence and nothing else.',
  },
  bash: {
    label: 'bash (harmless)',
    prompt: 'Run the harmless shell command: echo m3-live-evidence',
  },
  task: {
    label: 'task/todo',
    prompt:
      'Create a todo list with exactly two steps: step one Inspect package.json, step two Report the package name.',
  },
  ask: {
    label: 'governed ask',
    prompt: 'List the files in the /etc directory and describe what you find.',
  },
};

const TURN_TIMEOUT_MS = 90_000;
const SAFE_EVENT_FIELDS = new Set([
  'sessionID',
  'assistantMessageID',
  'messageID',
  'callID',
  'requestID',
  'id',
  'timestamp',
  'tool',
  'name',
  'command',
  'file',
  'action',
  'reply',
  'status',
  'sessionId',
]);

/** Redact a raw event to identity + allowlisted fields only. */
function redactEvent(event) {
  const payload = {};
  const raw = event.payload ?? {};
  for (const key of SAFE_EVENT_FIELDS) {
    if (raw[key] !== undefined && typeof raw[key] !== 'object') payload[key] = raw[key];
  }
  if (typeof raw.todos?.length === 'number') payload.todoCount = raw.todos.length;
  if (Array.isArray(raw.resources)) payload.resourceCount = raw.resources.length;
  return { type: event.type, id: event.id, payload };
}

async function captureScenario(name) {
  const scenario = SCENARIOS[name];
  console.log(`\n=== SCENARIO: ${scenario.label} ===`);
  console.log(`prompt: ${scenario.prompt}`);

  const context = { workspaceId: `m3-evidence-${name}`, directory: DIRECTORY };
  const session = await client.createSession({ title: `M3 evidence — ${name}` }, context);
  const sessionId = session.id;
  console.log(`session: ${sessionId}`);

  const queue = [];
  const waiters = [];
  let readerDone = false;
  const wake = () => waiters.splice(0).forEach((w) => w());
  const controller = new AbortController();

  const readerPromise = (async () => {
    try {
      for await (const event of client.openEventStream(context, controller.signal)) {
        const payload = event.payload ?? {};
        if (payload.sessionID === sessionId || payload.sessionId === sessionId) {
          queue.push(event);
          wake();
        }
      }
    } catch {
      /* stream closed */
    } finally {
      readerDone = true;
      wake();
    }
  })();

  try {
    await client.sendMessage(sessionId, { parts: [{ type: 'text', text: scenario.prompt }] }, context);
  } catch (error) {
    console.log(`sendMessage failed: ${error instanceof Error ? error.message : String(error)}`);
    controller.abort();
    await readerPromise.catch(() => undefined);
    return;
  }

  const events = [];
  const deadline = Date.now() + TURN_TIMEOUT_MS;
  let turnDone = false;
  while (!turnDone && Date.now() < deadline) {
    while (queue.length === 0 && !readerDone && !turnDone) {
      if (Date.now() >= deadline) break;
      await new Promise((resolve) => waiters.push(resolve));
    }
    const event = queue.shift();
    if (!event) break;
    events.push(event);
    const payload = event.payload ?? {};
    if (event.type === 'session.status') {
      const status = payload.status;
      if (status && typeof status === 'object' && status.type === 'idle') turnDone = true;
    }
    if (event.type === 'session.error') turnDone = true;
  }
  controller.abort();
  await readerPromise.catch(() => undefined);

  const projected = events
    .map((event) => {
      // Interpret via the individual projection functions (adapter interpretation).
      const d =
        projection.projectToolStarted(event) ??
        projection.projectToolCompleted(event) ??
        projection.projectToolFailed(event) ??
        projection.projectTerminalStarted(event) ??
        projection.projectTerminalCompleted(event) ??
        projection.projectPermissionRequested(event) ??
        projection.projectPermissionResolved(event) ??
        projection.projectTodoSnapshot(event) ??
        projection.projectEditStarted(event) ??
        projection.projectMessagePartUpdated(event);
      return d ? { type: event.type, detail: d } : undefined;
    })
    .filter(Boolean);

  const summary = {
    scenario: name,
    eventCount: events.length,
    eventTypes: [...new Set(events.map((e) => e.type))],
    redactedEvents: events.slice(0, 40).map(redactEvent),
    projections: projected.map((entry) => ({
      sourceType: entry.type,
      detail: entry.detail,
    })),
    explicitAbsences: {
      permission: events.some((e) => e.type.startsWith('permission.')) ? 'observed' : 'not observed in this turn',
      todo: events.some((e) => e.type.startsWith('todo.')) ? 'observed' : 'not observed in this turn',
      verification: 'unavailable (no verification events in the 1.18.27 contract)',
    },
  };
  return summary;
}

async function main() {
  const requested = process.argv[2];
  const names = requested ? [requested] : Object.keys(SCENARIOS);
  const results = [];
  for (const name of names) {
    // Space scenarios out — the local server handles one turn at a time
    // comfortably; burst churn caused request timeouts.
    await sleep(3000);
    let summary;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        summary = await captureScenario(name);
        break;
      } catch (error) {
        console.log(`→ ${name}: attempt ${attempt} FAILED ${error instanceof Error ? error.message : String(error)}`);
        if (error instanceof Error && error.stack) console.log(error.stack.split('\n').slice(0, 6).join('\n'));
        if (attempt === 1) await sleep(5000);
      }
    }
    if (summary) {
      results.push(summary);
      console.log(`→ ${summary.scenario}: ${summary.eventCount} events [${summary.eventTypes.join(', ')}]`);
      if (summary.eventCount === 0) console.log('  (no session events observed)');
    } else {
      console.log(`→ ${name}: FAILED (both attempts)`);
    }
  }
  const outPath = join(REPO, 'docs', 'blueprint', 'GA-UX-PREMIUM-M3-live-evidence.json');
  writeFileSync(outPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
  console.log(`\nEvidence written to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
