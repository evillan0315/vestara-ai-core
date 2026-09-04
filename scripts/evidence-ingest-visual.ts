#!/usr/bin/env tsx
/**
 * EVIDENCE-UX-002 M1 — generic read-only visual evidence ingestion.
 *
 * Reads explicitly listed image files, inspects their content (magic bytes +
 * intrinsic dimensions — never extension), and COPIES the bytes into a
 * ContentAddressedEvidenceStore. The store is authoritative after ingestion.
 *
 * This script knows nothing about GA-UX-PREMIUM, M4A, AssistantCodeEdit, or
 * /m4a-demo. Those are caller-supplied provenance/summary context. It takes
 * an explicit file list only: no recursion, no directory scan, no crawler.
 *
 * Requires a build first (imports resolve @vestara/* from dist/):
 *   pnpm build
 *   pnpm evidence:ingest-visual --workspace-root . --store-dir /tmp/ev \\
 *     --producer playwright --execution-id ingest-1 --operation "context" file.png [...]
 */

/* eslint-disable no-console */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ContentAddressedEvidenceStore } from '@vestara/engineering-event-store';
import { ingestVisualFile, VisualIngestError } from '@vestara/evidence';

interface IngestArgs {
  readonly workspaceRoot: string;
  readonly storeDir: string;
  readonly producer: string;
  readonly executionId: string;
  readonly operation?: string;
  readonly environment?: string;
  readonly summaryPrefix?: string;
  readonly files: readonly string[];
}

function usage(): string {
  return [
    'Usage: pnpm evidence:ingest-visual --workspace-root <dir> --store-dir <dir>',
    '  --producer <name> --execution-id <id> [--operation <ctx>]',
    '  [--environment <env>] [--summary-prefix <prefix>] <file> [<file> ...]',
    '',
    'Files are explicit paths resolved inside --workspace-root (containment enforced).',
  ].join('\n');
}

function flagValue(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new VisualIngestError('missing-file', `${flag} requires a value`);
  return value;
}

function parseArgs(argv: readonly string[]): IngestArgs {
  const workspaceRoot = flagValue(argv, '--workspace-root');
  const storeDir = flagValue(argv, '--store-dir');
  const producer = flagValue(argv, '--producer');
  const executionId = flagValue(argv, '--execution-id');
  if (!workspaceRoot || !storeDir || !producer || !executionId) throw new Error(usage());
  const known = new Set([
    '--workspace-root',
    '--store-dir',
    '--producer',
    '--execution-id',
    '--operation',
    '--environment',
    '--summary-prefix',
  ]);
  const files: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (known.has(arg)) {
      i += 1;
      continue;
    }
    if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}\n${usage()}`);
    files.push(arg);
  }
  if (files.length === 0) throw new Error(`No source files listed.\n${usage()}`);
  return {
    workspaceRoot,
    storeDir,
    producer,
    executionId,
    operation: flagValue(argv, '--operation'),
    environment: flagValue(argv, '--environment'),
    summaryPrefix: flagValue(argv, '--summary-prefix'),
    files,
  };
}

function main(): void {
  let parsed: IngestArgs;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
    return;
  }
  if (!fs.existsSync(path.resolve(parsed.workspaceRoot))) {
    console.error(`Workspace root does not exist: ${parsed.workspaceRoot}`);
    process.exitCode = 2;
    return;
  }
  const artifacts = new ContentAddressedEvidenceStore(parsed.storeDir);
  const ingested = parsed.files.map((file) => {
    const result = ingestVisualFile({
      artifacts,
      sourceFile: file,
      workspaceRoot: parsed.workspaceRoot,
      summary: parsed.summaryPrefix ? `${parsed.summaryPrefix}${file}` : undefined,
      producer: parsed.producer,
      executionId: parsed.executionId,
      operation: parsed.operation,
      environment: parsed.environment,
    });
    return {
      sourceFile: file,
      repositoryRelativePath: result.repositoryRelativePath,
      digest: result.ref.digest,
      mediaType: result.inspection.mediaType,
      width: result.inspection.width,
      height: result.inspection.height,
      size: result.ref.size,
      summary: result.reference.summary,
    };
  });
  console.log(JSON.stringify({ ingested }, null, 2));
}

try {
  main();
} catch (error) {
  if (error instanceof VisualIngestError) {
    console.error(JSON.stringify({ error: error.code, message: error.message }));
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exitCode = 1;
}
