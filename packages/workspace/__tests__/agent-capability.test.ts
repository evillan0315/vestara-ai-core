import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { FilesystemRuntime } from '@vestara/filesystem-runtime';
import { migrate } from '@vestara/sqlite-migrations';
import { beforeAll, describe, expect, it } from 'vitest';
import { AgentCapabilityManager } from '../src/agent-capability-manager';
import { PLANS_MANIFEST } from '../src/agent-migrations';
import { AgentRuntime } from '../src/agent-runtime';
import { AgentStorage } from '../src/agent-storage';
import { createFilesystemCapabilityTools } from '../src/capability-tool-provider';
import type { AgentDefinition } from '../src/types';

let db: any;
let developer: AgentDefinition;
let context: AgentDefinition;

beforeAll(async () => {
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  db = new SQL.Database();
  migrate(db, PLANS_MANIFEST, {});
  const storage = new AgentStorage(db);
  developer = (await storage.getAgent('agent-developer'))!;
  context = (await storage.getAgent('agent-context'))!;
});

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-cap-test-'));
}

describe('AgentCapabilityManager', () => {
  let dir: string;
  let manager: AgentCapabilityManager;

  const setup = (opts?: { dryRun?: boolean }) => {
    dir = tmpDir();
    manager = new AgentCapabilityManager({ filesystem: new FilesystemRuntime({ rootDir: dir, ...opts }) });
    return manager;
  };

  it('grants developer agents read and write filesystem capabilities', () => {
    const m = setup();
    const caps = m.getCapabilitiesForAgent(developer).map((c) => c.name);
    expect(caps).toContain('filesystem.read');
    expect(caps).toContain('filesystem.write');
    expect(caps).toContain('filesystem.update');
    expect(caps).toContain('filesystem.delete');
  });

  it('denies read-only agents write capabilities', () => {
    const m = setup();
    const caps = m.getCapabilitiesForAgent(context).map((c) => c.name);
    expect(caps).toContain('filesystem.read');
    expect(caps).not.toContain('filesystem.write');
    expect(caps).not.toContain('filesystem.delete');
  });

  it('reads a file', async () => {
    const m = setup();
    fs.writeFileSync(path.join(dir, 'hello.txt'), 'hello world');
    const result = await m.execute(developer, 'filesystem.read', { path: 'hello.txt' });
    expect(result.ok).toBe(true);
    expect(result.data).toBe('hello world');
    expect(result.observation?.operation).toBe('read');
    expect(result.observation?.status).toBe('success');
  });

  it('writes a file', async () => {
    const m = setup();
    const result = await m.execute(developer, 'filesystem.write', {
      path: 'src/example.ts',
      content: 'export const x = 1;',
      reason: 'test write',
    });
    expect(result.ok).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'src/example.ts'), 'utf-8')).toBe('export const x = 1;');
  });

  it('requires a reason for mutating capabilities', async () => {
    const m = setup();
    const result = await m.execute(developer, 'filesystem.write', {
      path: 'no-reason.ts',
      content: 'x',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/requires a reason/);
  });

  it('updates a file via patch and reports a change summary', async () => {
    const m = setup();
    fs.writeFileSync(path.join(dir, 'doc.ts'), 'const a = 1;\nconst b = 2;\n');
    const result = await m.execute(developer, 'filesystem.update', {
      path: 'doc.ts',
      patch: { replace: [{ search: 'const b = 2;', replace: 'const b = 20;' }] },
      reason: 'test update',
    });
    expect(result.ok).toBe(true);
    expect(result.observation?.changes?.changed).toBe(true);
    expect(result.observation?.changes?.added).toBeGreaterThan(0);
    expect(fs.readFileSync(path.join(dir, 'doc.ts'), 'utf-8')).toContain('const b = 20;');
  });

  it('delete requires confirmation before touching the file', async () => {
    const m = setup();
    fs.writeFileSync(path.join(dir, 'remove.txt'), 'data');
    const result = await m.execute(developer, 'filesystem.delete', { path: 'remove.txt', reason: 'cleanup' });
    expect(result.ok).toBe(false);
    expect(result.approvalId).toBeDefined();
    expect(fs.existsSync(path.join(dir, 'remove.txt'))).toBe(true);

    const approved = m.approve(result.approvalId!);
    expect(approved).toBe(true);

    const finalResult = await m.execute(developer, 'filesystem.delete', {
      path: 'remove.txt',
      reason: 'cleanup',
      approvalId: result.approvalId,
    });
    expect(finalResult.ok).toBe(true);
    expect(fs.existsSync(path.join(dir, 'remove.txt'))).toBe(false);
  });

  it('rejects paths that escape the workspace root', async () => {
    const m = setup();
    const outside = path.join(os.tmpdir(), 'agent-cap-escape.txt');
    fs.writeFileSync(outside, 'secret');
    const result = await m.execute(developer, 'filesystem.read', { path: '../agent-cap-escape.txt' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/escapes workspace root/);
  });

  it('rejects absolute paths outside the workspace', async () => {
    const m = setup();
    const outside = path.join(os.tmpdir(), 'agent-cap-absolute.txt');
    fs.writeFileSync(outside, 'secret');
    const result = await m.execute(developer, 'filesystem.write', { path: outside, content: 'x', reason: 'test' });
    expect(result.ok).toBe(false);
    expect(fs.readFileSync(outside, 'utf-8')).toBe('secret');
  });

  it('blocks agents without modify permission from writing', async () => {
    const m = setup();
    const result = await m.execute(context, 'filesystem.write', {
      path: 'should-not-exist.ts',
      content: 'x',
      reason: 'test',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not permitted/);
    expect(fs.existsSync(path.join(dir, 'should-not-exist.ts'))).toBe(false);
  });

  it('blocks disabled agents entirely', async () => {
    const m = setup();
    const disabled: AgentDefinition = { ...developer, id: 'disabled-agent', status: 'disabled' };
    const result = await m.execute(disabled, 'filesystem.read', { path: 'anything.txt' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/disabled/);
  });

  it('honors dry-run through the capability boundary', async () => {
    const m = setup();
    const result = await m.execute(developer, 'filesystem.write', {
      path: 'dry.txt',
      content: 'x',
      reason: 'test',
      dryRun: true,
    });
    expect(result.ok).toBe(true);
    expect(result.observation?.dryRun).toBe(true);
    expect(fs.existsSync(path.join(dir, 'dry.txt'))).toBe(false);
  });

  it('records operation history through the capability boundary', async () => {
    const m = setup();
    await m.execute(developer, 'filesystem.write', { path: 'h.txt', content: 'data', reason: 'test' });
    const history = m.getOperationHistory();
    expect(history.some((r) => r.type === 'write' && r.status === 'completed')).toBe(true);
  });
});

describe('AgentRuntime capability integration', () => {
  it('executes capabilities through the runtime with a real agent', async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'file.txt'), 'original');
    const manager = new AgentCapabilityManager({ filesystem: new FilesystemRuntime({ rootDir: dir }) });
    const runtime = new AgentRuntime({ storage: new AgentStorage(db), capabilities: manager });

    const readResult = await runtime.executeCapability('agent-developer', 'filesystem.read', { path: 'file.txt' });
    expect(readResult.result.ok).toBe(true);
    expect(readResult.result.data).toBe('original');

    const writeResult = await runtime.executeCapability('agent-developer', 'filesystem.write', {
      path: 'new-file.ts',
      content: 'export const y = 2;',
      reason: 'runtime test',
    });
    expect(writeResult.result.ok).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'new-file.ts'), 'utf-8')).toBe('export const y = 2;');
  });

  it('denies capabilities for agents lacking permission via the runtime', async () => {
    const dir = tmpDir();
    const manager = new AgentCapabilityManager({ filesystem: new FilesystemRuntime({ rootDir: dir }) });
    const runtime = new AgentRuntime({ storage: new AgentStorage(db), capabilities: manager });
    const result = await runtime.executeCapability('agent-context', 'filesystem.write', {
      path: 'x.ts',
      content: 'x',
      reason: 'test',
    });
    expect(result.result.ok).toBe(false);
  });

  it('returns an empty capability list for an unknown agent', async () => {
    const dir = tmpDir();
    const manager = new AgentCapabilityManager({ filesystem: new FilesystemRuntime({ rootDir: dir }) });
    const runtime = new AgentRuntime({ storage: new AgentStorage(db), capabilities: manager });
    const caps = await runtime.getCapabilitiesForAgent('does-not-exist');
    expect(caps).toEqual([]);
  });
});

describe('Filesystem capability tools', () => {
  it('exposes one tool per filesystem capability', () => {
    const dir = tmpDir();
    const manager = new AgentCapabilityManager({ filesystem: new FilesystemRuntime({ rootDir: dir }) });
    const tools = createFilesystemCapabilityTools(manager);
    const ids = tools.map((t) => t.definition.id);
    expect(ids).toContain('filesystem.read');
    expect(ids).toContain('filesystem.write');
    expect(ids).toContain('filesystem.delete');
    expect(tools).toHaveLength(12);
  });

  it('reads through a tool', async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'tool.txt'), 'tool content');
    const manager = new AgentCapabilityManager({ filesystem: new FilesystemRuntime({ rootDir: dir }) });
    const tools = createFilesystemCapabilityTools(manager);
    const readTool = tools.find((t) => t.definition.id === 'filesystem.read')!;
    const result = await readTool.execute({
      toolId: 'filesystem.read',
      parameters: { path: 'tool.txt' },
      context: {},
    });
    expect(result.success).toBe(true);
    expect(result.data).toBe('tool content');
  });
});
