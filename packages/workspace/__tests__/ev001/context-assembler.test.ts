import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ContextSource } from '../../src/ev001/context-assembler';
import { ContextAssembler } from '../../src/ev001/context-assembler';

const TEST_DIR = path.join(os.tmpdir(), `vestara-context-test-${Date.now()}`);

class TestSourceA implements ContextSource {
  readonly name = 'source-a';
  async contribute() {
    return { architectureDecisions: ['Decision from A'] };
  }
}

class TestSourceB implements ContextSource {
  readonly name = 'source-b';
  async contribute() {
    return { outstandingWork: ['Task from B'] };
  }
}

class TestSourceSummary implements ContextSource {
  readonly name = 'source-summary';
  async contribute() {
    return { repositorySummary: 'Summary from source' };
  }
}

describe('ContextAssembler', () => {
  it('returns base context with no sources', async () => {
    const assembler = new ContextAssembler();
    const ctx = await assembler.assemble('test', 'ws', '/tmp', 'user');
    expect(ctx.request).toBe('test');
    expect(ctx.architectureDecisions).toEqual([]);
    expect(ctx.repositorySummary).toBe('');
  });

  it('merges contributions from multiple sources', async () => {
    const assembler = new ContextAssembler();
    assembler.add(new TestSourceA());
    assembler.add(new TestSourceB());

    const ctx = await assembler.assemble('request', 'my-project', '/tmp', 'user');
    expect(ctx.architectureDecisions).toContain('Decision from A');
    expect(ctx.outstandingWork).toContain('Task from B');
  });

  it('aggregates contributions from multiple sources of the same type', async () => {
    const assembler = new ContextAssembler();
    assembler.add(new TestSourceA());
    assembler.add(new TestSourceA());
    assembler.add(new TestSourceA());

    const ctx = await assembler.assemble('req', 'ws', '/tmp', 'u');
    expect(ctx.architectureDecisions).toHaveLength(3);
    expect(ctx.architectureDecisions.every((d) => d === 'Decision from A')).toBe(true);
  });

  it('last source wins for singular fields like repositorySummary', async () => {
    const assembler = new ContextAssembler();
    assembler.add(new TestSourceSummary());
    assembler.add(
      new (class implements ContextSource {
        readonly name = 'override';
        async contribute() {
          return { repositorySummary: 'Override' };
        }
      })(),
    );

    const ctx = await assembler.assemble('req', 'ws', '/tmp', 'u');
    expect(ctx.repositorySummary).toBe('Override');
  });

  it('continues when a source throws', async () => {
    const assembler = new ContextAssembler();
    assembler.add(new TestSourceA());
    assembler.add(
      new (class implements ContextSource {
        readonly name = 'failing';
        async contribute(): Promise<never> {
          throw new Error('Source failed');
        }
      })(),
    );

    const ctx = await assembler.assemble('req', 'ws', '/tmp', 'u');
    expect(ctx.architectureDecisions).toContain('Decision from A');
  });

  it('RepositoryContextSource finds files in real directory', async () => {
    const { RepositoryContextSource } = await import('../../src/ev001/repository-context-source');
    const projectDir = path.join(TEST_DIR, 'test-repo');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'test' }));
    fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'src', 'index.ts'), 'export {};');

    const source = new RepositoryContextSource();
    const contrib = await source.contribute('req', 'test-repo', TEST_DIR, 'u');
    expect(contrib.repositorySummary).toContain('Source files');
    fs.rmSync(projectDir, { recursive: true, force: true });
  });
});
