/**
 * GA-UX-PREMIUM M3.1 — LIVE proof: runtime diff hunks survive OpenCode →
 * assistant.execution.v1 → browser-visible structured execution payload.
 *
 * Creates a disposable file, asks the governed assistant to modify it, then
 * records (redacted):
 *   upstream OpenCodeDiffFile.hunks:N
 *        ↓
 *   assistant.execution.v1 edit hunks:N
 *        ↓
 *   browser-visible event.execution hunks:N
 * and compares one hunk's line metadata + content (preserved, not reconstructed).
 *
 * NOT part of `pnpm test`. Cleans up the disposable file afterward.
 */

/* eslint-disable no-console */
const { readFileSync, existsSync, writeFileSync, rmSync } = require('node:fs');
const { join } = require('node:path');

const REPO = join(__dirname, '..');
const ENV_PATH = join(REPO, '.env');
if (existsSync(ENV_PATH)) {
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !m[1].startsWith('#')) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { OpenCodeHttpClient } = require(join(REPO, 'packages/opencode-runtime/dist/client/opencode-http-client.js'));
const { resolveOpenCodeConfig } = require(join(REPO, 'packages/opencode-runtime/dist/config.js'));
const { normalizeAssistantExecutionDetail } = require(join(REPO, 'packages/shared/dist/assistant-execution.js'));

const client = new OpenCodeHttpClient(resolveOpenCodeConfig({ requestTimeoutMs: 60_000 }));
const DISPOSABLE = '.vestara-m3.1-demo.ts';
const FILE_PATH = join(REPO, DISPOSABLE);
const TURN_TIMEOUT_MS = 120_000;

async function main() {
  // 1. Create the disposable file.
  writeFileSync(FILE_PATH, 'export const greeting = "Hello";\n', 'utf8');
  console.log(`disposable file created: ${DISPOSABLE}`);

  const context = { workspaceId: 'm3.1-proof', directory: REPO };
  const session = await client.createSession({ title: 'M3.1 hunk live proof' }, context);

  // Session-scoped event reader (queue) before sending the message.
  const queue = [];
  const waiters = [];
  let readerDone = false;
  const wake = () => waiters.splice(0).forEach((w) => w());
  const controller = new AbortController();
  const readerPromise = (async () => {
    try {
      for await (const event of client.openEventStream(context, controller.signal)) {
        const payload = event.payload ?? {};
        if (payload.sessionID === session.id) {
          queue.push(event);
          wake();
        }
      }
    } catch {
      /* closed */
    } finally {
      readerDone = true;
      wake();
    }
  })();

  await client.sendMessage(
    session.id,
    {
      parts: [
        {
          type: 'text',
          text: `Modify ${DISPOSABLE}: change the greeting value to "Hello Vestara" AND add a second export line "export const version = 1;". Report what you changed.`,
        },
      ],
    },
    context,
  );

  // 2. Wait for turn completion (idle).
  let turnDone = false;
  const deadline = Date.now() + TURN_TIMEOUT_MS;
  while (!turnDone && Date.now() < deadline) {
    while (queue.length === 0 && !readerDone && !turnDone) {
      if (Date.now() >= deadline) break;
      await new Promise((resolve) => waiters.push(resolve));
    }
    const event = queue.shift();
    if (!event) break;
    const payload = event.payload ?? {};
    if (event.type === 'session.status') {
      const status = payload.status;
      if (status && typeof status === 'object' && status.type === 'idle') turnDone = true;
    }
  }
  controller.abort();
  await readerPromise.catch(() => undefined);

  // 3. Upstream evidence: session diff (OpenCodeDiffFile with hunks).
  const diffFiles = await client.getSessionDiff(session.id, context);
  const upstream = diffFiles
    .map((f) => ({
      path: f.path,
      operation: f.operation,
      additions: f.additions,
      deletions: f.deletions,
      hunks: (f.hunks ?? []).map((h) => ({
        oldStart: h.oldStart,
        oldLines: h.oldLines,
        newStart: h.newStart,
        newLines: h.newLines,
        content: h.content.slice(0, 120), // redacted preview for the report
        contentLength: h.content.length,
      })),
    }))
    .filter((f) => f.path.endsWith(DISPOSABLE) || f.path.endsWith('demo.ts'));

  // 4. Vestara projection: same hunks through the v1 normalizer (the adapter's
  //    turn-end enrichment path — allowlisted + bounded).
  const projection = normalizeAssistantExecutionDetail({
    contract: 'assistant.execution.v1',
    version: 1,
    operationId: `edit:${session.id}:${DISPOSABLE}`,
    kind: 'edit',
    state: 'completed',
    file: DISPOSABLE,
    operation: upstream[0]?.operation,
    additions: upstream[0]?.additions,
    deletions: upstream[0]?.deletions,
    diffProvenance: 'runtime-provided',
    hunks: diffFiles.find((f) => f.path.endsWith(DISPOSABLE) || f.path.endsWith('demo.ts'))?.hunks,
    timestamp: Date.now(),
  });

  // 5. Browser-visible payload = the JSON-serialized detail riding event.execution.
  const browserPayload = JSON.parse(JSON.stringify(projection));

  const proof = {
    scenario: 'disposable edit (M3.1 live proof)',
    result:
      upstream[0]?.hunks.length > 0
        ? 'hunks present — comparison below'
        : 'session diff EMPTY — the 1.18.27 runtime provides no structured hunks in this environment (see docs/blueprint/GA-UX-PREMIUM-M3.1-live-evidence.json)',
    upstream: {
      file: DISPOSABLE,
      operation: upstream[0]?.operation,
      additions: upstream[0]?.additions,
      deletions: upstream[0]?.deletions,
      hunks: upstream.map((f) => ({ count: f.hunks.length, sample: f.hunks[0] })),
    },
    projection: {
      contract: browserPayload.contract,
      version: browserPayload.version,
      kind: browserPayload.kind,
      file: browserPayload.file,
      operation: browserPayload.operation,
      additions: browserPayload.additions,
      deletions: browserPayload.deletions,
      diffProvenance: browserPayload.diffProvenance,
      beforeAfterProvenance: browserPayload.beforeAfterProvenance,
      hunks: (browserPayload.hunks ?? []).map((h) => ({
        oldStart: h.oldStart,
        oldLines: h.oldLines,
        newStart: h.newStart,
        newLines: h.newLines,
        content: h.content.slice(0, 120),
        contentLength: h.content.length,
      })),
      hunksTruncated: browserPayload.hunksTruncated,
    },
    comparison: (() => {
      const up = upstream[0]?.hunks[0];
      const down = browserPayload.hunks?.[0];
      return {
        hunksUpstream: upstream[0]?.hunks.length ?? 0,
        hunksBrowser: browserPayload.hunks?.length ?? 0,
        lineMetadataPreserved:
          up &&
          down &&
          up.oldStart === down.oldStart &&
          up.oldLines === down.oldLines &&
          up.newStart === down.newStart &&
          up.newLines === down.newLines,
        contentPreserved: up && down ? up.content === down.content : false,
      };
    })(),
    actualResultFile: (() => {
      try {
        return readFileSync(FILE_PATH, 'utf8');
      } catch {
        return '(missing)';
      }
    })(),
  };

  console.log(`\nhunks upstream=${proof.upstream.hunks[0]?.count ?? 0} → browser=${proof.comparison.hunksBrowser}`);
  console.log(proof.result);
  if (proof.comparison.hunksUpstream > 0) {
    console.log('line metadata preserved:', proof.comparison.lineMetadataPreserved);
    console.log('content preserved:', proof.comparison.contentPreserved);
  }
  console.log('resulting file:\n' + proof.actualResultFile);

  const outPath = join(REPO, 'docs', 'blueprint', 'GA-UX-PREMIUM-M3.1-live-evidence.json');
  writeFileSync(outPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
  console.log(`Evidence written to ${outPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      rmSync(FILE_PATH, { force: true });
      console.log(`disposable file cleaned up: ${DISPOSABLE}`);
    } catch {
      /* already gone */
    }
  });
