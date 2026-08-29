#!/usr/bin/env tsx
/**
 * Fetch the OpenCode OpenAPI document from the local headless server and write
 * a normalized candidate schema + deterministic checksum.
 *
 *   pnpm opencode:spec:fetch [--out <dir>]
 *
 * Defaults to the running server at OPENCODE_SERVER_HOST/OPENCODE_SERVER_PORT
 * (127.0.0.1:4096) with Basic auth from the environment. Writes:
 *   - <out>/candidate.openapi.json        (normalized candidate)
 *   - <out>/candidate.openapi.sha256      (deterministic checksum)
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hashNormalizedDocument, normalizeOpenApiDocument } from '../src/compatibility/compatibility-engine';

const root = resolve(__dirname, '..');
const outDir = resolve(
  root,
  process.argv.includes('--out') ? (process.argv[process.argv.indexOf('--out') + 1] ?? 'openapi') : 'openapi',
);

async function main(): Promise<void> {
  const host = process.env.OPENCODE_SERVER_HOST ?? '127.0.0.1';
  const port = process.env.OPENCODE_SERVER_PORT ?? '4096';
  const password = process.env.OPENCODE_SERVER_PASSWORD;
  const username = process.env.OPENCODE_SERVER_USERNAME ?? 'vestara';
  const base = `http://${host}:${port}`;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (password) headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  const response = await fetch(`${base}/doc`, { headers, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    throw new Error(`Failed to fetch OpenAPI doc: ${response.status} ${response.statusText}`);
  }
  const document = (await response.json()) as Record<string, unknown>;
  const normalized = normalizeOpenApiDocument(document);
  const checksum = await hashNormalizedDocument(normalized);

  writeFileSync(resolve(outDir, 'candidate.openapi.json'), `${JSON.stringify(normalized, null, 2)}\n`);
  writeFileSync(resolve(outDir, 'candidate.openapi.sha256'), `${checksum}\n`);
  console.log(
    `Wrote normalized candidate schema (${Object.keys(normalized.paths ?? {}).length} paths) to ${outDir}/candidate.openapi.json`,
  );
  console.log(`Checksum: sha256:${checksum}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
