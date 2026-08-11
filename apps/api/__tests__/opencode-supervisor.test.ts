import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { findOpencodeServePid, isProcessAncestor } from '../src/opencode-supervisor';

describe('opencode execution-lease guard', () => {
  it('a process is an ancestor of itself', () => {
    expect(isProcessAncestor(process.pid, process.pid)).toBe(true);
  });

  it('init (pid 1) is an ancestor of every process', () => {
    expect(isProcessAncestor(1, process.pid)).toBe(true);
  });

  it('an unrelated/bogus pid is not an ancestor', () => {
    expect(isProcessAncestor(999_999_999, process.pid)).toBe(false);
  });

  it('an immediate parent is an ancestor of its child', () => {
    const parent = Number(execFileSync('ps', ['-o', 'ppid=', '-p', String(process.pid)], { encoding: 'utf8' }).trim());
    expect(Number.isFinite(parent)).toBe(true);
    expect(isProcessAncestor(parent, process.pid)).toBe(true);
  });

  it('REGRESSION: the opencode serve runtime hosting this test is its ancestor (self-preservation)', () => {
    const servePid = findOpencodeServePid();
    // When this test runs inside an opencode-hosted shell (as in the incident),
    // the serve process must be detected as an ancestor — i.e. the supervisor
    // must refuse to reclaim it.
    if (servePid !== null) {
      expect(isProcessAncestor(servePid, process.pid)).toBe(true);
    }
  });
});
