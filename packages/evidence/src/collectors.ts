/**
 * Slice-1 evidence collectors (PCS-026 §4): command output, filesystem change
 * set, and source diff. Browser/screenshot/visual collectors are slice 2.
 */

import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EvidenceCollectionRequest, EvidenceCollector, EvidenceItem } from './types';

// ─── Command output collector ─────────────────────────────────

export interface CommandEvidenceCollectorOptions {
  /** Command and args to execute (e.g. `['pnpm', ['test', '--', path]]`). */
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly summary?: string;
  readonly operation?: string;
}

export class CommandEvidenceCollector implements EvidenceCollector {
  readonly kind = 'command' as const;

  constructor(private readonly options: CommandEvidenceCollectorOptions) {}

  async collect(request: EvidenceCollectionRequest) {
    const { stdout, stderr } = await runCommand(this.options.command, this.options.args ?? [], {
      cwd: this.options.cwd ?? request.workspaceRoot,
    });
    const item: EvidenceItem = {
      kind: 'command',
      mediaType: 'text/plain',
      content: `${stdout}${stderr ? `\n--- stderr ---\n${stderr}` : ''}`,
      summary: this.options.summary ?? `command: ${this.options.command} ${this.options.args?.join(' ') ?? ''}`.trim(),
      operation: this.options.operation ?? this.options.command,
    };
    return { items: [item] };
  }
}

// ─── Filesystem change set collector ──────────────────────────

export class FilesystemChangeCollector implements EvidenceCollector {
  readonly kind = 'filesystem-change' as const;

  async collect(request: EvidenceCollectionRequest) {
    const items: EvidenceItem[] = [];
    for (const relative of request.changedFiles ?? []) {
      const absolute = path.resolve(request.workspaceRoot, relative);
      let content: string;
      try {
        content = fs.readFileSync(absolute, 'utf8');
      } catch {
        content = `<unreadable or deleted: ${relative}>`;
      }
      items.push({
        kind: 'filesystem-change',
        mediaType: 'text/plain',
        content,
        summary: `changed file: ${relative}`,
        operation: 'filesystem-change',
      });
    }
    return { items };
  }
}

// ─── Source diff collector ────────────────────────────────────

export class SourceDiffCollector implements EvidenceCollector {
  readonly kind = 'source-diff' as const;

  constructor(private readonly options?: { readonly base?: string }) {}

  async collect(request: EvidenceCollectionRequest) {
    const base = this.options?.base ?? 'HEAD';
    const { stdout, exitCode } = await runCommand('git', ['diff', base, '--', ...(request.changedFiles ?? [])], {
      cwd: request.workspaceRoot,
      allowFailure: true,
    });
    const items: EvidenceItem[] = [
      {
        kind: 'source-diff',
        mediaType: 'text/plain',
        content: stdout,
        summary: `git diff ${base} (exit ${exitCode ?? 0})`,
        operation: `git diff ${base}`,
      },
    ];
    return { items };
  }
}

// ─── helpers ──────────────────────────────────────────────────

export interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}

export function runCommand(
  command: string,
  args: readonly string[],
  options: { readonly cwd?: string; readonly allowFailure?: boolean } = {},
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    execFile(command, [...args], { cwd: options.cwd, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error && !options.allowFailure) {
        reject(error);
        return;
      }
      const code =
        error && typeof (error as { code?: unknown }).code === 'number' ? (error as { code: number }).code : null;
      resolve({ stdout: String(stdout), stderr: String(stderr), exitCode: code });
    });
  });
}
