import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
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
      onPendingApproval: (op) => { pendingCalled = true; expect(op.type).toBe('delete'); },
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
});
