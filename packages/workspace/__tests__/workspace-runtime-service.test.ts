import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceRuntimeService } from '../src/workspace-runtime-service';

describe('WorkspaceRuntimeService', () => {
  let testDir: string;
  let runtime: WorkspaceRuntimeService;

  beforeEach(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-runtime-test-'));
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'packages/utils'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'src/index.ts'), 'export const greeting = "hello";\n');
    fs.writeFileSync(path.join(testDir, 'src/utils.ts'), 'export const add = (a: number, b: number) => a + b;\n');
    fs.writeFileSync(
      path.join(testDir, 'package.json'),
      JSON.stringify({ name: 'test-pkg', dependencies: { react: '^19.0.0' } }),
    );
    // Create lockfile so package manager detection works
    fs.writeFileSync(path.join(testDir, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n');

    runtime = new WorkspaceRuntimeService({
      id: 'test-workspace' as any,
      type: 'workspace' as any,
      name: 'Test Workspace',
      rootDir: testDir,
    });
  });

  it('initializes successfully', async () => {
    await runtime.initialize();
    expect(runtime.state).toBe('running');
  });

  it('provides access to filesystem service after init', async () => {
    await runtime.initialize();
    const fs = runtime.filesystem;
    expect(fs.pwd()).toBe(testDir);
  });

  it('provides access to git service after init', async () => {
    await runtime.initialize();
    const git = runtime.git;
    expect(git.isRepository).toBe(false);
  });

  it('provides access to index after init', async () => {
    await runtime.initialize();
    const index = runtime.index;
    expect(index).toBeDefined();
  });

  it('detects project profile on init', async () => {
    await runtime.initialize();
    const profile = runtime.profile;
    expect(profile).toBeDefined();
    expect(profile.name).toBe(path.basename(testDir));
    expect(profile.packageManager).not.toBeNull();
  });

  it('provides context provider after init', async () => {
    await runtime.initialize();
    const context = runtime.contextProvider;
    expect(context).toBeDefined();
    expect(context.currentContext).not.toBeNull();
    expect(context.currentContext!.profile.name).toBe(path.basename(testDir));
  });

  it('provides tool provider after init', async () => {
    await runtime.initialize();
    const tools = runtime.getAllTools();
    expect(tools.length).toBeGreaterThan(0);
    const toolIds = tools.map((t) => t.definition.id);
    expect(toolIds).toContain('workspace.pwd');
    expect(toolIds).toContain('workspace.readFile');
    expect(toolIds).toContain('workspace.writeFile');
    expect(toolIds).toContain('workspace.ls');
    expect(toolIds).toContain('workspace.glob');
    expect(toolIds).toContain('workspace.gitStatus');
  });

  it('starts file watcher after start', async () => {
    await runtime.initialize();
    expect(runtime.watcher).not.toBeNull();
    expect(runtime.watcher!.isWatching).toBe(true);
  });

  it('can scan index on start', async () => {
    await runtime.initialize();
    expect(runtime.index.isIndexed).toBe(true);
    expect(runtime.index.totalFiles).toBeGreaterThan(0);
  });

  it('reports runtime health', async () => {
    await runtime.initialize();
    const health = runtime.getRuntimeHealth();
    expect(health.status).toBe('healthy');
    expect(health.indexedFiles).toBeGreaterThan(0);
    expect(health.watcherActive).toBe(true);
  });

  it('refreshes project profile', async () => {
    await runtime.initialize();
    runtime.refreshProjectProfile();
    const profile = runtime.profile;
    expect(profile).toBeDefined();
    expect(profile.name).toBe(path.basename(testDir));
  });

  it('stops gracefully', async () => {
    await runtime.initialize();
    await runtime.stop();
    expect(runtime.state).toBe('stopped');
  });

  it('handles file read through filesystem service', async () => {
    await runtime.initialize();
    const content = runtime.filesystem.readFile('src/index.ts');
    expect(content.content).toContain('greeting');
  });

  it('handles file write through filesystem service', async () => {
    await runtime.initialize();
    const result = runtime.filesystem.writeFile('src/new.ts', 'export const x = 1;\n');
    expect(result.wasCreated).toBe(true);
    expect(runtime.filesystem.exists('src/new.ts')).toBe(true);
  });
});
