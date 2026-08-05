// Pinned OpenCode schema loader — reads the version-pinned OpenAPI document
// and its deterministic checksum from the package's openapi/ directory. The
// pinned schema is the exact contract the runtime was verified against.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface OpenCodePinnedSchema {
  readonly document: Record<string, unknown>;
  readonly checksum: string;
  readonly source: string;
}

const PINNED_DOC_PATH = resolve(__dirname, '..', '..', 'openapi', 'opencode.openapi.json');
const PINNED_SHA_PATH = resolve(__dirname, '..', '..', 'openapi', 'opencode.openapi.sha256');

let cached: OpenCodePinnedSchema | undefined;

/** Load the pinned OpenCode schema. Throws if it is not present. */
export function loadPinnedSchema(): OpenCodePinnedSchema {
  if (cached) return cached;
  const document = JSON.parse(readFileSync(PINNED_DOC_PATH, 'utf8')) as Record<string, unknown>;
  const checksum = readFileSync(PINNED_SHA_PATH, 'utf8').trim();
  cached = { document, checksum, source: PINNED_DOC_PATH };
  return cached;
}

/** Return whether a pinned schema is available (missing only in test fixtures). */
export function hasPinnedSchema(): boolean {
  try {
    loadPinnedSchema();
    return true;
  } catch {
    return false;
  }
}
