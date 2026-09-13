/**
 * @vestara/terminal-runtime — registry + redaction tests.
 *
 * Real `bash` processes (node env, no mocks for spawn): create → write →
 * output → exit, cwd containment, targeted kill, secret redaction.
 */

// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { redactSecrets } from '../src/redact';
import { resolveSessionCwd, TerminalSessionRegistry } from '../src/registry';
import { createTerminalStreamState, flushTerminalStream, processTerminalChunk } from '../src/stream';

const US = String.fromCharCode(0x1f);
const RS = String.fromCharCode(0x1e);
const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);
const marker = (pwd: string): string => `${US}CWD:${pwd}${RS}\n`;

describe('processTerminalChunk', () => {
  it('strips the PID-variant startup noise (reported leak)', () => {
    const state = createTerminalStreamState();
    const { forward } = processTerminalChunk(
      state,
      'bash: cannot set terminal process group (235489): Inappropriate ioctl for device\nbash: no job control in this shell\n$ ',
    );
    expect(forward).toBe('$ ');
  });

  it('projects cwd markers and forwards nothing for them', () => {
    const state = createTerminalStreamState();
    const { forward, cwd } = processTerminalChunk(
      state,
      `$ ${marker('/home/user/projects/vestara/vestara-ai-core')}$ `,
    );
    expect(cwd).toBe('/home/user/projects/vestara/vestara-ai-core');
    expect(forward).toBe('$ \n$ ');
    expect(forward).not.toContain('CWD:');
  });

  it('reassembles markers fragmented across chunks', () => {
    const state = createTerminalStreamState();
    const full = marker('/repo/sub');
    const cut = Math.floor(full.length / 2);
    const first = processTerminalChunk(state, `out\n${full.slice(0, cut)}`);
    expect(first.forward).toBe('out\n');
    expect(first.cwd).toBeUndefined();
    const second = processTerminalChunk(state, `${full.slice(cut)}$ `);
    expect(second.cwd).toBe('/repo/sub');
    expect(second.forward).toBe('\n$ ');
  });

  it('forwards prompts immediately (no hold without marker evidence)', () => {
    const state = createTerminalStreamState();
    expect(processTerminalChunk(state, '$ ').forward).toBe('$ ');
    expect(processTerminalChunk(state, 'echo hi\n').forward).toBe('echo hi\n');
  });

  it('never strips late noise that looks like startup text', () => {
    const state = createTerminalStreamState();
    for (let i = 0; i < 10; i++) processTerminalChunk(state, `line ${i}\n`);
    const { forward } = processTerminalChunk(state, 'bash: no job control in this shell\n');
    expect(forward).toBe('bash: no job control in this shell\n');
  });

  it('passes stray unit-separator bytes through instead of swallowing', () => {
    const state = createTerminalStreamState();
    expect(processTerminalChunk(state, `a${US}b`).forward).toBe(`a${US}b`);
  });

  it('flushes held tails verbatim on exit', () => {
    const state = createTerminalStreamState();
    processTerminalChunk(state, `out\n${US}CWD:/par`);
    expect(flushTerminalStream(state)).toBe(`${US}CWD:/par`);
  });

  it('strips OSC title sequences but preserves CSI colors', () => {
    const state = createTerminalStreamState();
    const { forward } = processTerminalChunk(state, `${ESC}]0;mytitle${BEL}hello ${ESC}[31mred${ESC}[0m`);
    expect(forward).toBe(`hello ${ESC}[31mred${ESC}[0m`);
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (predicate()) return;
    if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting for condition');
    await sleep(50);
  }
}

describe('resolveSessionCwd', () => {
  it('defaults to the workspace root', () => {
    expect(resolveSessionCwd('/repo')).toBe('/repo');
    expect(resolveSessionCwd('/repo', '~')).toBe('/repo');
    expect(resolveSessionCwd('/repo', undefined)).toBe('/repo');
  });

  it('resolves root-relative subdirectories', () => {
    expect(resolveSessionCwd('/repo', 'packages/api')).toBe('/repo/packages/api');
  });

  it('rejects escape', () => {
    expect(() => resolveSessionCwd('/repo', '..')).toThrow(/escapes workspace/);
    expect(() => resolveSessionCwd('/repo', '../other')).toThrow(/escapes workspace/);
    expect(() => resolveSessionCwd('/repo', '/etc')).toThrow(/escapes workspace/);
  });
});

describe('redactSecrets', () => {
  it('redacts token shapes but keeps scaffolding readable', () => {
    expect(redactSecrets('token=AKIAIOSFODNN7EXAMPLE')).toBe('token=[redacted]');
    expect(redactSecrets('export GH_TOKEN=ghp_abcdefghij1234567890')).toBe('export GH_TOKEN=[redacted]');
    expect(redactSecrets('Authorization: Bearer abcdefghijklmnop')).toBe('Authorization: Bearer [redacted]');
    expect(redactSecrets('nothing secret here')).toBe('nothing secret here');
  });
});

describe('TerminalSessionRegistry', () => {
  it('runs a command and reports output + exit', async () => {
    const registry = new TerminalSessionRegistry({ workspaceRoot: process.cwd() });
    const info = registry.create({});
    expect(info.state).toBe('running');

    const output: string[] = [];
    // Interactive prompts print to stderr; command output to stdout.
    registry.attach(info.id, {
      onStdout: (_id, text) => output.push(text),
      onStderr: (_id, text) => output.push(text),
    });
    // Wait for the interactive prompt, then run a command.
    await waitFor(() => output.join('').includes('$'));
    registry.write(info.id, 'echo hello-terminal\n');
    await waitFor(() => output.join('').includes('hello-terminal'));
    expect(registry.transcript(info.id)).toContain('hello-terminal');
    // --noediting: input is never echoed by the shell (no double typing).
    const occurrences = output.join('').split('echo hello-terminal').length - 1;
    expect(occurrences).toBe(0);

    registry.write(info.id, 'exit 42\n');
    await waitFor(() => registry.get(info.id)?.state === 'exited');
    expect(registry.get(info.id)?.exitCode).toBe(42);
    await registry.dispose();
  });

  it('runs a pty session with in-kernel echo when requested', async () => {
    const registry = new TerminalSessionRegistry({ workspaceRoot: process.cwd(), driver: 'pty' });
    const info = registry.create({});
    expect(info.driver).toBe('pty');
    expect(info.state).toBe('running');

    const output: string[] = [];
    registry.attach(info.id, {
      onStdout: (_id, text) => output.push(text),
      onStderr: (_id, text) => output.push(text),
    });
    await waitFor(() => output.join('').includes('$'));
    // Pty echoes input in-kernel: raw write, no line discipline needed.
    registry.write(info.id, 'echo pty-marker-42\r');
    await waitFor(() => output.join('').includes('pty-marker-42'));
    registry.write(info.id, 'exit 7\r');
    await waitFor(() => registry.get(info.id)?.state === 'exited');
    expect(registry.get(info.id)?.exitCode).toBe(7);
    await registry.dispose();
  });

  it('rejects cwd escape at create', () => {
    const registry = new TerminalSessionRegistry({ workspaceRoot: process.cwd() });
    expect(() => registry.create({ cwd: '/etc' })).toThrow(/escapes workspace/);
    void registry.dispose();
  });

  it('enforces the session cap', async () => {
    const registry = new TerminalSessionRegistry({ workspaceRoot: process.cwd(), maxSessions: 1 });
    registry.create({});
    expect(() => registry.create({})).toThrow(/limit reached/);
    await registry.dispose();
  });

  it('kills a session on demand', async () => {
    const registry = new TerminalSessionRegistry({ workspaceRoot: process.cwd() });
    const events: string[] = [];
    registry.onEvent((event) => events.push(`${event.type}:${event.sessionId}`));
    const info = registry.create({});
    expect(await registry.kill(info.id)).toBe(true);
    expect(await registry.kill(info.id)).toBe(false);
    expect(events).toContain(`killed:${info.id}`);
    await registry.dispose();
  });

  it('reaps idle sessions', async () => {
    const registry = new TerminalSessionRegistry({
      workspaceRoot: process.cwd(),
      idleTimeoutMs: 100,
      maxLifetimeMs: 60_000,
    });
    const events: string[] = [];
    registry.onEvent((event) => {
      if (event.type === 'killed') events.push(event.reason);
    });
    registry.start();
    const info = registry.create({});
    // No listeners + no activity → idle reap on the next sweep tick.
    await waitFor(() => events.includes('idle'), 60_000);
    expect(registry.get(info.id)).toBeUndefined();
    await registry.dispose();
  }, 70_000);
});
