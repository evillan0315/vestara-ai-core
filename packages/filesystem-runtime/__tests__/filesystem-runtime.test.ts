import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FilesystemRuntime } from '../src/index.js';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fs-runtime-test-'));
}

describe('FilesystemRuntime', () => {
  it('reads a file', async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'test.txt'), 'hello');
    const rt = new FilesystemRuntime({ rootDir: dir });
    const result = await rt.read('test.txt');
    expect(result.ok).toBe(true);
    expect(result.data).toBe('hello');
    expect(result.operation.type).toBe('read');
  });

  it('writes a file', async () => {
    const dir = tmpDir();
    const rt = new FilesystemRuntime({ rootDir: dir });
    const result = await rt.write('output.txt', 'content');
    expect(result.ok).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'output.txt'), 'utf-8')).toBe('content');
  });

  it('creates nested directories on write', async () => {
    const dir = tmpDir();
    const rt = new FilesystemRuntime({ rootDir: dir });
    await rt.write('nested/deep/file.txt', 'deep');
    expect(fs.existsSync(path.join(dir, 'nested/deep/file.txt'))).toBe(true);
  });

  it('deletes a file after approval', async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'delete-me.txt'), 'bye');
    const rt = new FilesystemRuntime({ rootDir: dir });
    const result = await rt.delete('delete-me.txt');
    expect(result.requiresApproval).toBe(true);
    rt.approve(result.approvalId!);
    const finalResult = await rt.delete('delete-me.txt', { approvalId: result.approvalId });
    expect(finalResult.ok).toBe(true);
    expect(fs.existsSync(path.join(dir, 'delete-me.txt'))).toBe(false);
  });

  it('deletes a directory recursively after approval', async () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'subdir'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'subdir', 'a.txt'), 'a');
    const rt = new FilesystemRuntime({ rootDir: dir });
    const result = await rt.delete('subdir');
    expect(result.requiresApproval).toBe(true);
    rt.approve(result.approvalId!);
    const finalResult = await rt.delete('subdir', { approvalId: result.approvalId });
    expect(finalResult.ok).toBe(true);
    expect(fs.existsSync(path.join(dir, 'subdir'))).toBe(false);
  });

  it('lists directory contents', async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'a.txt'), '');
    fs.writeFileSync(path.join(dir, 'b.txt'), '');
    const rt = new FilesystemRuntime({ rootDir: dir });
    const result = await rt.list('.');
    expect(result.ok).toBe(true);
    expect(result.data!.sort()).toEqual(['a.txt', 'b.txt']);
  });

  it('checks file existence', async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'here.txt'), '');
    const rt = new FilesystemRuntime({ rootDir: dir });
    expect((await rt.exists('here.txt')).data).toBe(true);
    expect((await rt.exists('missing.txt')).data).toBe(false);
  });

  it('renames a file', async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'old.txt'), 'rename me');
    const rt = new FilesystemRuntime({ rootDir: dir });
    const result = await rt.rename('old.txt', 'new.txt');
    expect(result.ok).toBe(true);
    expect(fs.existsSync(path.join(dir, 'old.txt'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'new.txt'))).toBe(true);
  });

  it('read of missing file returns error', async () => {
    const dir = tmpDir();
    const rt = new FilesystemRuntime({ rootDir: dir });
    const result = await rt.read('does-not-exist.txt');
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('calls onPendingApproval for delete', async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'target.txt'), 'data');
    let pendingCalled = false;
    const rt = new FilesystemRuntime({
      rootDir: dir,
      onPendingApproval: (op) => {
        pendingCalled = true;
        expect(op.type).toBe('delete');
      },
    });
    const result = await rt.delete('target.txt');
    expect(result.requiresApproval).toBe(true);
    expect(result.approvalId).toBeDefined();
    expect(pendingCalled).toBe(true);
    // File should NOT be deleted — pending approval
    expect(fs.existsSync(path.join(dir, 'target.txt'))).toBe(true);
  });

  it('approve resolves a pending operation', async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'approve-me.txt'), 'data');
    const rt = new FilesystemRuntime({ rootDir: dir });
    const result = await rt.delete('approve-me.txt');
    expect(result.requiresApproval).toBe(true);

    const approved = rt.approve(result.approvalId!);
    expect(approved).toBe(true);
    expect(rt.getPendingApprovals()).toHaveLength(0);
  });

  it('reject marks a pending operation as rejected', async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'reject-me.txt'), 'data');
    const rt = new FilesystemRuntime({ rootDir: dir });
    const result = await rt.delete('reject-me.txt');
    expect(result.requiresApproval).toBe(true);

    const rejected = rt.reject(result.approvalId!);
    expect(rejected).toBe(true);
    expect(fs.existsSync(path.join(dir, 'reject-me.txt'))).toBe(true);
  });

  it('returns pending approvals', async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'f1.txt'), '');
    fs.writeFileSync(path.join(dir, 'f2.txt'), '');
    const rt = new FilesystemRuntime({ rootDir: dir });
    await rt.delete('f1.txt');
    await rt.delete('f2.txt');
    expect(rt.getPendingApprovals()).toHaveLength(2);
  });

  it('rejects path traversal via ..', async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'secret.txt'), 'secret');
    const rt = new FilesystemRuntime({ rootDir: dir });
    const result = await rt.read('../secret.txt');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/escapes workspace root/);
  });

  it('rejects absolute paths outside the root', async () => {
    const dir = tmpDir();
    const rt = new FilesystemRuntime({ rootDir: dir });
    const outside = path.join(os.tmpdir(), 'fs-runtime-outside.txt');
    fs.writeFileSync(outside, 'x');
    const result = await rt.read(outside);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/escapes workspace root/);
  });

  it('rejects writes to denied files', async () => {
    const dir = tmpDir();
    const rt = new FilesystemRuntime({ rootDir: dir });
    const result = await rt.write('.env', 'SECRET=1');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/denied file/);
  });

  it('rejects absolute paths via write', async () => {
    const dir = tmpDir();
    const rt = new FilesystemRuntime({ rootDir: dir });
    const outside = path.join(os.tmpdir(), 'fs-runtime-escaped.txt');
    const result = await rt.write(outside, 'pwned');
    expect(result.ok).toBe(false);
    expect(fs.existsSync(outside)).toBe(false);
  });

  it('updates a file via replace patch and returns a change summary', async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'doc.ts'), 'const a = 1;\nconst b = 2;\n');
    const rt = new FilesystemRuntime({ rootDir: dir });
    const result = await rt.update('doc.ts', { replace: [{ search: 'const b = 2;', replace: 'const b = 20;' }] });
    expect(result.ok).toBe(true);
    expect(result.data!.summary.changed).toBe(true);
    expect(result.data!.summary.added).toBeGreaterThan(0);
    expect(result.data!.summary.removed).toBeGreaterThan(0);
    expect(fs.readFileSync(path.join(dir, 'doc.ts'), 'utf-8')).toContain('const b = 20;');
  });

  it('inserts and removes lines via patch', async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'lines.txt'), 'one\ntwo\nthree\n');
    const rt = new FilesystemRuntime({ rootDir: dir });
    const result = await rt.update('lines.txt', {
      insert: [{ atLine: 3, content: 'inserted' }],
      removeLines: [{ startLine: 1, endLine: 1 }],
    });
    expect(result.ok).toBe(true);
    const content = fs.readFileSync(path.join(dir, 'lines.txt'), 'utf-8');
    expect(content).toContain('inserted');
    expect(content).not.toContain('one');
  });

  it('returns metadata via stat', async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'meta.txt'), 'hello');
    const rt = new FilesystemRuntime({ rootDir: dir });
    const result = await rt.stat('meta.txt');
    expect(result.ok).toBe(true);
    expect(result.data!.isFile).toBe(true);
    expect(result.data!.size).toBe(5);
  });

  it('copies a file', async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'src.txt'), 'copy me');
    const rt = new FilesystemRuntime({ rootDir: dir });
    const result = await rt.copy('src.txt', 'nested/dst.txt');
    expect(result.ok).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'nested/dst.txt'), 'utf-8')).toBe('copy me');
  });

  it('honors dry-run mode without touching the disk', async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'target.txt'), 'original');
    const rt = new FilesystemRuntime({ rootDir: dir, dryRun: true });
    const result = await rt.update('target.txt', { replace: [{ search: 'original', replace: 'changed' }] });
    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'target.txt'), 'utf-8')).toBe('original');
  });

  it('honors per-call dry-run override', async () => {
    const dir = tmpDir();
    const rt = new FilesystemRuntime({ rootDir: dir });
    const result = await rt.write('out.txt', 'content', { dryRun: true });
    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(fs.existsSync(path.join(dir, 'out.txt'))).toBe(false);
  });

  it('records operation history', async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'h.txt'), 'data');
    const rt = new FilesystemRuntime({ rootDir: dir });
    await rt.write('w.txt', 'x');
    await rt.update('h.txt', { replace: [{ search: 'data', replace: 'DATA' }] });
    const history = rt.getHistory();
    expect(history.some((r) => r.type === 'write' && r.status === 'completed')).toBe(true);
    expect(history.some((r) => r.type === 'update' && r.status === 'completed')).toBe(true);
  });

  it('fires onOperation for mutations', async () => {
    const dir = tmpDir();
    const seen: string[] = [];
    const rt = new FilesystemRuntime({ rootDir: dir, onOperation: (r) => seen.push(r.type) });
    await rt.write('o.txt', 'data');
    expect(seen).toContain('write');
  });
});
