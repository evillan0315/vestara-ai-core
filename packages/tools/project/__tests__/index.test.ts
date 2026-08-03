import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ProjectAnalyzeTool } from '../src/index';

const CONTEXT = {
  agentId: 'agent-1',
  taskId: 'task-1',
  environment: {
    id: 'env-1',
    kind: 'local',
    workspaceRoot: '/repo',
    networkPolicy: 'restricted',
    filesystemPolicy: 'workspace-write',
    processPolicy: 'restricted',
  },
  signal: new AbortController().signal,
} as const;

const directories: string[] = [];
function temp(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `vestara-tools-project-${name}-`));
  directories.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of directories.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function seedRepo(root: string): void {
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"demo","version":"1.0.0"}\n');
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":3}\n');
  fs.writeFileSync(path.join(root, 'src', 'index.ts'), 'export const x = 1;\n');
}

describe('ProjectAnalyzeTool', () => {
  it('detects a repository structure', async () => {
    const root = temp('detect');
    seedRepo(root);
    const tool = new ProjectAnalyzeTool();
    const result = await tool.execute({ rootDir: root }, CONTEXT);
    expect(result.status).toBe('completed');
    expect(result.output?.type).toBe('node');
    expect(result.output?.fileCount).toBeGreaterThan(0);
    expect(result.output?.packageManager).toBe('npm');
  });

  it('validates required rootDir input', () => {
    const tool = new ProjectAnalyzeTool();
    expect(() => tool.inputSchema.parse({})).toThrow(/rootDir/);
  });
});
