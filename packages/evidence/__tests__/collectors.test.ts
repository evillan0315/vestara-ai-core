import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { BuildEvidenceCollector, TestEvidenceCollector } from '../src/collectors';
import type { EvidenceCollectionRequest } from '../src/types';

const directories: string[] = [];
function temp(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `vestara-evidence-${name}-`));
  directories.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of directories.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const REQUEST: EvidenceCollectionRequest = {
  executionId: 'exec-1',
  workspaceRoot: process.cwd(),
};

describe('TestEvidenceCollector (PCS-026 §4 slice-1)', () => {
  it('emits test evidence with the test kind', async () => {
    const collector = new TestEvidenceCollector({ command: 'echo', args: ['ok'] });
    const result = await collector.collect(REQUEST);
    expect(result.items[0]?.kind).toBe('test');
    expect(result.items[0]?.summary).toContain('test: echo');
  });
});

describe('BuildEvidenceCollector (PCS-026 §4 slice-1)', () => {
  it('emits build evidence with the build kind', async () => {
    const collector = new BuildEvidenceCollector({ command: 'echo', args: ['ok'] });
    const result = await collector.collect(REQUEST);
    expect(result.items[0]?.kind).toBe('build');
    expect(result.items[0]?.summary).toContain('build: echo');
  });
});
