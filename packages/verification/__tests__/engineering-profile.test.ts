import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EngineeringVerificationProfiles } from '../src/engineering-profile.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function workspace(scripts: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-verification-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'index.ts'), 'export const value = 1;');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture-package', scripts }));
  return root;
}

describe('EngineeringVerificationProfiles', () => {
  it('selects and runs deterministic build and test checks for changed files', async () => {
    const root = workspace({
      build: 'node -e "process.stdout.write(\'built\')"',
      test: 'node -e "process.stdout.write(\'tested\')"',
    });
    const progress: string[] = [];
    const result = await new EngineeringVerificationProfiles().verify({
      workspaceRoot: root,
      changedFiles: ['src/index.ts'],
      profile: 'standard',
      onProgress: (event) => progress.push(`${event.phase}:${event.content}`),
    });
    expect(result.status).toBe('passed');
    expect(result.checks).toHaveLength(2);
    expect(result.evidence).toHaveLength(2);
    expect(progress.join('\n')).toContain('built');
  });

  it('fails completion when a mandatory check fails', async () => {
    const root = workspace({ build: 'node -e "process.stderr.write(\'broken\'); process.exit(2)"' });
    const result = await new EngineeringVerificationProfiles().verify({
      workspaceRoot: root,
      changedFiles: ['src/index.ts'],
    });
    expect(result.status).toBe('failed');
    expect(result.checks[0]).toMatchObject({ status: 'failed', summary: expect.stringContaining('broken') });
    expect(result.uncoveredRisks).toContain('At least one mandatory verification check failed');
  });

  it('reports an inconclusive result when changed files have no verification scripts', async () => {
    const root = workspace({});
    const result = await new EngineeringVerificationProfiles().verify({
      workspaceRoot: root,
      changedFiles: ['src/index.ts'],
    });
    expect(result.status).toBe('inconclusive');
  });

  it('does not claim verified reality for uncommitted implementation changes', async () => {
    const root = workspace({ build: 'node -e "process.exit(0)"' });
    execFileSync('git', ['init'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'test@vestara.local'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'Vestara Test'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['commit', '-m', 'baseline'], { cwd: root });
    fs.writeFileSync(path.join(root, 'src', 'index.ts'), 'export const value = 2;');
    const profiles = new EngineeringVerificationProfiles();
    const uncommitted = await profiles.verify({ workspaceRoot: root, changedFiles: ['src/index.ts'] });
    expect(uncommitted.status).toBe('inconclusive');
    expect(uncommitted.uncoveredRisks.join(' ')).toContain('not committed');
    execFileSync('git', ['add', 'src/index.ts'], { cwd: root });
    execFileSync('git', ['commit', '-m', 'verified change'], { cwd: root });
    await expect(profiles.verify({ workspaceRoot: root, changedFiles: ['src/index.ts'] })).resolves.toMatchObject({
      status: 'passed',
    });
  });
});
