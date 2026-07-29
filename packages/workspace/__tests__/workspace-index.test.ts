import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceIndex } from '../src/workspace-index';

describe('WorkspaceIndex', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-index-test-'));
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'src/components'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'packages/utils'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'src/index.ts'), 'export const greeting = "hello";\n');
    fs.writeFileSync(path.join(testDir, 'src/components/button.tsx'), 'export const Button = () => null;\n');
    fs.writeFileSync(path.join(testDir, 'src/utils.ts'), 'export const add = (a: number, b: number) => a + b;\n');
    fs.writeFileSync(path.join(testDir, 'packages/utils/helpers.ts'), 'export const help = () => "help";\n');
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
    fs.writeFileSync(path.join(testDir, 'README.md'), '# Test\n');
    // node_modules should be ignored
    fs.writeFileSync(path.join(testDir, 'node_modules/lodash.js'), 'module.exports = {};\n');
  });

  it('scans directory and indexes files', async () => {
    const index = new WorkspaceIndex({ rootDir: testDir });
    await index.scan();

    expect(index.isIndexed).toBe(true);
    expect(index.totalFiles).toBeGreaterThanOrEqual(5);
  });

  it('ignores node_modules directory', async () => {
    const index = new WorkspaceIndex({ rootDir: testDir });
    await index.scan();

    const hasNodeModules = index.searchByName('lodash').length > 0;
    expect(hasNodeModules).toBe(false);
  });

  it('finds files by extension', async () => {
    const index = new WorkspaceIndex({ rootDir: testDir });
    await index.scan();

    const tsFiles = index.findByExtension('.ts');
    expect(tsFiles.length).toBeGreaterThanOrEqual(3);

    const tsxFiles = index.findByExtension('.tsx');
    expect(tsxFiles.length).toBeGreaterThanOrEqual(1);
  });

  it('searches files by name', async () => {
    const index = new WorkspaceIndex({ rootDir: testDir });
    await index.scan();

    const results = index.searchByName('button');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].name).toBe('button.tsx');
  });

  it('finds files by directory', async () => {
    const index = new WorkspaceIndex({ rootDir: testDir });
    await index.scan();

    const srcFiles = index.findByDirectory('src');
    expect(srcFiles.length).toBeGreaterThanOrEqual(3);
  });

  it('checks entry existence', async () => {
    const index = new WorkspaceIndex({ rootDir: testDir });
    await index.scan();

    expect(index.hasEntry('src/index.ts')).toBe(true);
    expect(index.hasEntry('nonexistent.ts')).toBe(false);
  });

  it('gets specific entry', async () => {
    const index = new WorkspaceIndex({ rootDir: testDir });
    await index.scan();

    const entry = index.getEntry('src/index.ts');
    expect(entry).toBeDefined();
    expect(entry!.name).toBe('index.ts');
    expect(entry!.extension).toBe('.ts');
    expect(entry!.isDirectory).toBe(false);
  });

  it('adds and removes entries dynamically', async () => {
    const index = new WorkspaceIndex({ rootDir: testDir });
    await index.scan();

    const newFile = path.join(testDir, 'src/new.ts');
    fs.writeFileSync(newFile, '// new');
    const relPath = 'src/new.ts';
    index.addEntry(relPath);

    expect(index.hasEntry(relPath)).toBe(true);
    expect(index.totalFiles).toBeGreaterThanOrEqual(6);

    index.removeEntry(relPath);
    expect(index.hasEntry(relPath)).toBe(false);
  });

  it('builds directory tree', async () => {
    const index = new WorkspaceIndex({ rootDir: testDir });
    await index.scan();

    const tree = index.getDirectoryTree(2);
    expect(tree.name).toBe(path.basename(testDir));
    expect(tree.type).toBe('directory');
    expect(tree.children.length).toBeGreaterThan(0);
  });

  it('finds files by regex pattern', async () => {
    const index = new WorkspaceIndex({ rootDir: testDir });
    await index.scan();

    const tsxFiles = index.getFilesByPattern(/\.tsx$/);
    expect(tsxFiles.length).toBeGreaterThanOrEqual(1);
  });

  it('returns accurate directory count', async () => {
    const index = new WorkspaceIndex({ rootDir: testDir });
    await index.scan();

    expect(index.totalDirectories).toBeGreaterThanOrEqual(3);
  });
});
