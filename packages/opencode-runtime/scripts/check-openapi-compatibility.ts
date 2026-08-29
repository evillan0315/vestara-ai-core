#!/usr/bin/env tsx
/**
 * Compare the candidate/live OpenCode schema with the pinned contract.
 *
 *   pnpm opencode:spec:check [--candidate <path>] [--pinned <path>] [--live]
 *
 * `--live` fetches the running server's document (same as spec:fetch). Without
 * it, the candidate defaults to the most recent fetched candidate schema.
 *
 * Exit codes:
 *   0  compatible (checksum may differ but no breaking structural change)
 *   1  breaking changes detected OR no pinned schema present
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  checkOpenApiCompatibility,
  hashNormalizedDocument,
  normalizeOpenApiDocument,
} from '../src/compatibility/compatibility-engine';

const root = resolve(__dirname, '..');
const pinnedPath = resolve(
  root,
  process.argv.includes('--pinned')
    ? (process.argv[process.argv.indexOf('--pinned') + 1] ?? 'openapi/opencode.openapi.json')
    : 'openapi/opencode.openapi.json',
);
const candidatePath = resolve(
  root,
  process.argv.includes('--candidate')
    ? (process.argv[process.argv.indexOf('--candidate') + 1] ?? 'openapi/candidate.openapi.json')
    : 'openapi/candidate.openapi.json',
);

function printInline(document: Record<string, unknown>, label: string): string {
  return `[${label} openapi ${String(document.openapi ?? '?')} | ${Object.keys((document.paths ?? {}) as Record<string, unknown>).length} paths]`;
}

async function main(): Promise<void> {
  if (!existsSync(pinnedPath)) {
    console.error(`No pinned schema at ${pinnedPath}. Run pnpm opencode:spec:update first.`);
    process.exitCode = 1;
    return;
  }
  const pinned = JSON.parse(readFileSync(pinnedPath, 'utf8')) as Record<string, unknown>;

  let candidate: Record<string, unknown>;
  if (process.argv.includes('--live')) {
    const host = process.env.OPENCODE_SERVER_HOST ?? '127.0.0.1';
    const port = process.env.OPENCODE_SERVER_PORT ?? '4096';
    const password = process.env.OPENCODE_SERVER_PASSWORD;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (password) {
      const username = process.env.OPENCODE_SERVER_USERNAME ?? 'vestara';
      headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    }
    const response = await fetch(`http://${host}:${port}/doc`, { headers, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Failed to fetch live doc: ${response.status}`);
    candidate = normalizeOpenApiDocument((await response.json()) as Record<string, unknown>);
    console.log(`Fetched live schema ${printInline(candidate, 'live')}`);
  } else {
    if (!existsSync(candidatePath)) {
      console.error(`No candidate schema at ${candidatePath}. Run pnpm opencode:spec:fetch or pass --live.`);
      process.exitCode = 1;
      return;
    }
    candidate = JSON.parse(readFileSync(candidatePath, 'utf8')) as Record<string, unknown>;
    console.log(`Loaded candidate schema ${printInline(candidate, 'candidate')}`);
  }

  const pinnedChecksum = await hashNormalizedDocument(pinned);
  const result = await checkOpenApiCompatibility({ pinned, candidate });

  console.log(`\nPinned schema    ${printInline(pinned, 'pinned')}`);
  console.log(`Pinned checksum: sha256:${pinnedChecksum}`);
  console.log(`Candidate checksum: sha256:${result.candidateSchemaChecksum}`);
  console.log(`Checksum matches: ${result.checksumMatches}`);
  console.log(`Result: ${result.compatible ? 'COMPATIBLE' : 'BREAKING'}`);
  console.log(
    `Change count: ${result.changeCount} (${result.breakingChanges.length} breaking, ${result.potentiallyBreaking.length} potentially breaking, ${result.warnings.length} compatible)`,
  );

  for (const change of result.breakingChanges) {
    console.log(`  [BREAKING] ${change.summary}`);
  }
  for (const change of result.potentiallyBreaking) {
    console.log(`  [POTENTIALLY BREAKING] ${change.summary}`);
  }
  for (const change of result.warnings) {
    console.log(`  [compatible] ${change.summary}`);
  }

  if (!result.compatible) {
    console.error('\nBreaking contract changes detected — CI fails.');
    process.exitCode = 1;
  } else if (result.checksumMatches) {
    console.log('\nSchema is in sync with the pinned contract.');
  } else {
    console.log('\nChecksum differs but no breaking structural change — review warnings.');
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
