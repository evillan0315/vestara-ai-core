import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type AgentBrowserCliClient,
  type AgentBrowserCliInvocation,
  AgentBrowserDriver,
  type AgentBrowserDriverOptions,
  resolveAgentBrowserBinary,
  SpawnAgentBrowserCli,
} from '../src/index';

const BASE = 'http://app.local:5173';

interface StubEntry {
  readonly command: string[];
  readonly result: Record<string, unknown> | null;
  readonly error: string | null;
  readonly success: boolean;
}

function ok(command: string[], result: Record<string, unknown>): StubEntry {
  return { command, result, error: null, success: true };
}

function fail(command: string[], error: string): StubEntry {
  return { command, result: null, error, success: false };
}

function batchOutput(entries: StubEntry[]): { stdout: string; stderr: string } {
  return { stdout: JSON.stringify(entries), stderr: '' };
}

/** Minimal PNG header (signature + IHDR) — enough for pngDimensions. */
function pngHeader(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(24);
  bytes.writeUInt32BE(0x89504e47, 0);
  bytes.writeUInt32BE(0x0d0a1a0a, 4);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

class FakeCli implements AgentBrowserCliClient {
  readonly invocations: AgentBrowserCliInvocation[] = [];
  private readonly responses: Array<() => { stdout: string; stderr: string }> = [];

  onNext(response: () => { stdout: string; stderr: string }): void {
    this.responses.push(response);
  }

  async run(invocation: AgentBrowserCliInvocation): Promise<{ stdout: string; stderr: string }> {
    this.invocations.push(invocation);
    const next = this.responses.shift();
    if (!next) throw new Error('FakeCli: no response queued');
    return next();
  }
}

function makeDriver(fake: FakeCli, options: Partial<AgentBrowserDriverOptions> = {}): AgentBrowserDriver {
  return new AgentBrowserDriver({
    baseUrl: BASE,
    allowedOrigins: ['*'],
    stabilityDelayMs: 0,
    cli: fake,
    ...options,
  });
}

function stdinOf(invocation: AgentBrowserCliInvocation): string[][] {
  return JSON.parse(invocation.stdin ?? '[]') as string[][];
}

/** Snapshot payload mimicking a live agent-browser run (example.com-like shape). */
function observePayload(): { stdout: string; stderr: string } {
  return batchOutput([
    ok(['get', 'title'], { title: 'Form Page' }),
    ok(['snapshot', '-i'], {
      origin: `${BASE}/index.html`,
      refs: {
        e1: { name: 'Form Page', role: 'heading' },
        e2: { name: 'Target Link', role: 'link' },
        e3: { name: 'Query', role: 'textbox' },
      },
      snapshot:
        '- heading "Form Page" [level=1, ref=e1]\n' +
        '- link "Target Link" [ref=e2]\n' +
        '- textbox "Query" [ref=e3]: hello world',
    }),
  ]);
}

describe('AgentBrowserDriver — command construction', () => {
  it('navigate sends a single open batch op with the raw session key (no colon sanitization)', async () => {
    const fake = new FakeCli();
    fake.onNext(() =>
      batchOutput([ok(['open', 'https://example.com/a'], { url: 'https://example.com/a', title: 'A' })]),
    );
    const driver = makeDriver(fake);

    const result = await driver.navigate('https://example.com/a', 'alice:live', new AbortController().signal);

    expect(result).toEqual({ url: 'https://example.com/a', title: 'A' });
    expect(fake.invocations).toHaveLength(1);
    const inv = fake.invocations[0];
    expect(inv.args).toEqual(['--session', 'alice:live', '--json', 'batch']);
    expect(stdinOf(inv)).toEqual([['open', 'https://example.com/a']]);
  });

  it('navigate falls back to the requested URL and surfaces daemon navigation errors', async () => {
    const fake = new FakeCli();
    fake.onNext(() => batchOutput([fail(['open', 'https://x.invalid'], 'net::ERR_NAME_NOT_RESOLVED')]));
    const driver = makeDriver(fake);

    let caught: Error | undefined;
    try {
      await driver.navigate('https://x.invalid', 'k', undefined);
    } catch (error) {
      caught = error as Error;
    }
    expect(caught?.message).toContain('net::ERR_NAME_NOT_RESOLVED');
  });

  it('snapshot builds title/url/text from a three-op batch, with origin fallback for url', async () => {
    const fake = new FakeCli();
    fake.onNext(() =>
      batchOutput([
        ok(['snapshot', '-c'], { origin: 'https://s/1', refs: {}, snapshot: '- heading "T" [ref=e1]' }),
        ok(['get', 'title'], { title: 'T' }),
        fail(['get', 'url'], 'temporarily unavailable'),
      ]),
    );
    const driver = makeDriver(fake);
    const snap = await driver.snapshot('k', undefined);
    expect(snap).toEqual({ url: 'https://s/1', title: 'T', text: '- heading "T" [ref=e1]' });
    expect(stdinOf(fake.invocations[0])).toEqual([
      ['snapshot', '-c'],
      ['get', 'title'],
      ['get', 'url'],
    ]);
  });

  it('observe maps eN refs to driver refs and records per-key agent refs for clickRef/typeRef', async () => {
    const fake = new FakeCli();
    fake.onNext(() => observePayload());
    fake.onNext(() => batchOutput([ok(['click', '@e3'], {})]));
    fake.onNext(() => batchOutput([ok(['fill', '@e1', 'x'], {}), ok(['press', 'Enter'], {})]));
    fake.onNext(() =>
      batchOutput([
        ok(['snapshot', '-c'], { origin: `${BASE}/other`, refs: {}, snapshot: '' }),
        ok(['get', 'title'], { title: 'O' }),
        ok(['get', 'url'], { url: `${BASE}/other` }),
      ]),
    );
    const driver = makeDriver(fake);

    const obs = await driver.observe('k', undefined);
    expect(obs.title).toBe('Form Page');
    expect(obs.url).toBe(`${BASE}/index.html`);
    expect(obs.elements).toEqual([
      { ref: 'ref-0', role: 'heading', name: 'Form Page', level: 1 },
      { ref: 'ref-1', role: 'link', name: 'Target Link' },
      { ref: 'ref-2', role: 'textbox', name: 'Query', value: 'hello world' },
    ]);

    await driver.clickRef('ref-2', 'k', undefined);
    expect(stdinOf(fake.invocations[1])).toEqual([['click', '@e3']]);

    await driver.typeRef('ref-0', 'x', true, 'k', undefined);
    expect(stdinOf(fake.invocations[2])).toEqual([
      ['fill', '@e1', 'x'],
      ['press', 'Enter'],
    ]);

    // clickRef/typeRef on the SAME session resolve via the per-key map; after a
    // navigation the map for that key is cleared, so a ref from before is stale.
    fake.onNext(() =>
      batchOutput([ok(['open', 'https://example.com/new'], { url: 'https://example.com/new', title: 'N' })]),
    );
    await driver.navigate('https://example.com/new', 'k', undefined);
    let stale: Error | undefined;
    try {
      await driver.clickRef('ref-2', 'k', undefined);
    } catch (error) {
      stale = error as Error;
    }
    expect(stale?.name).toBe('StaleElementReferenceError');
    expect(fake.invocations).toHaveLength(4); // no CLI call for the stale click
  });

  it('extracts stateful element attributes from the text snapshot', async () => {
    const fake = new FakeCli();
    fake.onNext(() =>
      batchOutput([
        ok(['get', 'title'], { title: 'P' }),
        ok(['snapshot', '-i'], {
          origin: `${BASE}/p`,
          refs: {
            e1: { name: 'C', role: 'combobox' },
            e2: { name: 'E', role: 'checkbox' },
            e3: { name: 'N', role: 'spinbutton' },
            e4: { name: 'S', role: 'slider' },
            e5: { name: 'F', role: 'searchbox' },
            e6: { name: 'B', role: 'button' },
          },
          snapshot:
            '- combobox "C" [expanded=false, ref=e1]: Berlin\n' +
            '- checkbox "E" [checked=true, disabled, ref=e2]\n' +
            '- spinbutton "N" [ref=e3]: 42\n' +
            '- slider "S" [ref=e4]: 50\n' +
            '- searchbox "F" [ref=e5]: needle\n' +
            '- button "B" [ref=e6]',
        }),
      ]),
    );
    const driver = makeDriver(fake);
    const obs = await driver.observe('k', undefined);

    expect(obs.elements[0]).toMatchObject({ role: 'combobox', value: 'Berlin', expanded: false });
    expect(obs.elements[1]).toMatchObject({ role: 'checkbox', checked: true, disabled: true });
    expect(obs.elements[2]).toMatchObject({ role: 'spinbutton', value: '42' });
    expect(obs.elements[3]).toMatchObject({ role: 'slider', value: '50' });
    expect(obs.elements[4]).toMatchObject({ role: 'searchbox', value: 'needle' });
    expect(obs.elements[5]).toEqual({ ref: 'ref-5', role: 'button', name: 'B' });
  });

  it('screenshot requests --full by default, parses PNG dimensions, and cleans the temp file', async () => {
    const fake = new FakeCli();
    fake.onNext(() => {
      const commands = stdinOf(fake.invocations[0]);
      const path = commands[1][commands[1].length - 1];
      writeFileSync(path, pngHeader(119, 37));
      return batchOutput([ok(['get', 'url'], { url: `${BASE}/shot` }), ok(['screenshot', '--full', path], { path })]);
    });
    const driver = makeDriver(fake);

    const shot = await driver.screenshot('k', undefined);

    expect(shot).toMatchObject({ url: `${BASE}/shot`, width: 119, height: 37 });
    expect(stdinOf(fake.invocations[0])[1]).toEqual(['screenshot', '--full', expect.any(String)]);
    // Temp file removed after parsing.
    const path = stdinOf(fake.invocations[0])[1][2];
    expect(existsSync(path)).toBe(false);
  });

  it('screenshot omits --full when fullPage is false and errors when the file is missing', async () => {
    const fake = new FakeCli();
    fake.onNext(() =>
      batchOutput([
        ok(['get', 'url'], { url: `${BASE}/shot` }),
        ok(['screenshot', 'shot.png'], { path: 'nowhere.png' }),
      ]),
    );
    const driver = makeDriver(fake);
    let caught: Error | undefined;
    try {
      await driver.screenshot('k', undefined, { fullPage: false });
    } catch (error) {
      caught = error as Error;
    }
    expect(stdinOf(fake.invocations[0])[1]).toEqual(['screenshot', expect.any(String)]);
    expect(caught?.message).toContain('screenshot file was not produced');
  });

  it('click sends selector or three-op mouse sequence; type sends fill+optional Enter', async () => {
    const fake = new FakeCli();
    fake.onNext(() => batchOutput([ok(['click', '#btn'], {})]));
    fake.onNext(() =>
      batchOutput([ok(['mouse', 'move', '10', '20'], {}), ok(['mouse', 'down'], {}), ok(['mouse', 'up'], {})]),
    );
    fake.onNext(() => batchOutput([ok(['fill', '#q', 'hi'], {})]));
    fake.onNext(() => batchOutput([ok(['fill', '#q2', 'hi'], {}), ok(['press', 'Enter'], {})]));
    fake.onNext(() => batchOutput([ok(['scroll', 'down', '300'], {})]));
    const driver = makeDriver(fake);

    await driver.click('#btn', undefined, 'k', undefined);
    await driver.click('', { x: 10, y: 20 }, 'k', undefined);
    await driver.type('#q', 'hi', false, 'k', undefined);
    await driver.type('#q2', 'hi', true, 'k', undefined);
    await driver.scroll('down', 300, 'k', undefined);

    expect(stdinOf(fake.invocations[0])).toEqual([['click', '#btn']]);
    expect(stdinOf(fake.invocations[1])).toEqual([
      ['mouse', 'move', '10', '20'],
      ['mouse', 'down'],
      ['mouse', 'up'],
    ]);
    expect(stdinOf(fake.invocations[2])).toEqual([['fill', '#q', 'hi']]);
    expect(stdinOf(fake.invocations[3])).toEqual([
      ['fill', '#q2', 'hi'],
      ['press', 'Enter'],
    ]);
    expect(stdinOf(fake.invocations[4])).toEqual([['scroll', 'down', '300']]);
  });

  it('back/forward send direction+wait batches', async () => {
    const fake = new FakeCli();
    fake.onNext(() => batchOutput([ok(['back'], {}), ok(['wait', '--load', 'load'], {})]));
    fake.onNext(() => batchOutput([ok(['forward'], {}), ok(['wait', '--load', 'load'], {})]));
    const driver = makeDriver(fake);

    await driver.back('k', undefined);
    await driver.forward('k', undefined);

    expect(stdinOf(fake.invocations[0])).toEqual([['back'], ['wait', '--load', 'load']]);
    expect(stdinOf(fake.invocations[1])).toEqual([['forward'], ['wait', '--load', 'load']]);
  });

  it('close(key) sends a close batch per key; close() sends close --all', async () => {
    const fake = new FakeCli();
    fake.onNext(() => batchOutput([ok(['close'], {})]));
    const driver = makeDriver(fake);

    await driver.close('k', undefined);
    await driver.close();

    expect(stdinOf(fake.invocations[0])).toEqual([['close']]);
    expect(fake.invocations[1].args).toEqual(['close', '--all']);
  });
});

describe('AgentBrowserDriver — navigation settle (bfcache-aware waits)', () => {
  it('back: settled wait resolves without extra verification', async () => {
    const fake = new FakeCli();
    fake.onNext(() => batchOutput([ok(['back'], {}), ok(['wait', '--load', 'load'], {})]));
    const driver = makeDriver(fake);
    await expect(driver.back('k', undefined)).resolves.toBeUndefined();
    expect(fake.invocations).toHaveLength(1);
  });

  it('back: wait timeout after commit (bfcache) resolves after URL verification', async () => {
    const fake = new FakeCli();
    fake.onNext(() =>
      batchOutput([
        ok(['back'], {}),
        fail(['wait', '--load', 'load'], 'Operation timed out. The page may still be loading'),
      ]),
    );
    fake.onNext(() => batchOutput([ok(['get', 'url'], { url: `${BASE}/prev` }), ok(['get', 'title'], { title: 'P' })]));
    const driver = makeDriver(fake);

    await expect(driver.back('k', undefined)).resolves.toBeUndefined();
    expect(stdinOf(fake.invocations[1])).toEqual([
      ['get', 'url'],
      ['get', 'title'],
    ]);
  });

  it('back: transient CDP race on the wait entry resolves after verification', async () => {
    const fake = new FakeCli();
    fake.onNext(() =>
      batchOutput([
        ok(['back'], {}),
        fail(['wait', '--load', 'load'], 'CDP error (Runtime.evaluate): Inspected target navigated or closed'),
      ]),
    );
    fake.onNext(() => batchOutput([ok(['get', 'url'], { url: `${BASE}/prev` }), ok(['get', 'title'], { title: 'P' })]));
    const driver = makeDriver(fake);
    await expect(driver.back('k', undefined)).resolves.toBeUndefined();
    expect(fake.invocations).toHaveLength(2);
  });

  it('back: hard wait failure still throws', async () => {
    const fake = new FakeCli();
    fake.onNext(() =>
      batchOutput([ok(['back'], {}), fail(['wait', '--load', 'load'], 'Element not found. Verify selector')]),
    );
    const driver = makeDriver(fake);
    await expect(driver.back('k', undefined)).rejects.toThrow('Element not found');
  });

  it('back: transient error on the navigation entry itself resolves after verification', async () => {
    const fake = new FakeCli();
    fake.onNext(() =>
      batchOutput([fail(['back'], 'CDP error (Runtime.evaluate): no target'), fail(['wait', '--load', 'load'], 'x')]),
    );
    fake.onNext(() => batchOutput([ok(['get', 'url'], { url: `${BASE}/prev` }), ok(['get', 'title'], { title: 'P' })]));
    const driver = makeDriver(fake);
    await expect(driver.back('k', undefined)).resolves.toBeUndefined();
    expect(fake.invocations).toHaveLength(2);
  });

  it('reload: wait timeout resolves after verification, hard failure throws', async () => {
    const fake = new FakeCli();
    fake.onNext(() => batchOutput([ok(['reload'], {}), fail(['wait', '--load', 'load'], 'Operation timed out')]));
    fake.onNext(() => batchOutput([ok(['get', 'url'], { url: `${BASE}/r` }), ok(['get', 'title'], { title: 'R' })]));
    const driver = makeDriver(fake);
    await expect(driver.reload('k', undefined)).resolves.toBeUndefined();
    expect(stdinOf(fake.invocations[1])).toEqual([
      ['get', 'url'],
      ['get', 'title'],
    ]);

    const fake2 = new FakeCli();
    fake2.onNext(() => batchOutput([ok(['reload'], {}), fail(['wait', '--load', 'load'], 'Element not found')]));
    const driver2 = makeDriver(fake2);
    await expect(driver2.reload('k', undefined)).rejects.toThrow('Element not found');
  });

  it('waitForNavigation returns URL/title even when the load event is suppressed (bfcache)', async () => {
    const fake = new FakeCli();
    fake.onNext(() =>
      batchOutput([
        fail(['wait', '--load', 'load'], 'Operation timed out. The page may still be loading'),
        ok(['get', 'url'], { url: `${BASE}/landed` }),
        ok(['get', 'title'], { title: 'Landed' }),
      ]),
    );
    const driver = makeDriver(fake);
    const result = await driver.waitForNavigation('k', undefined);
    expect(result).toEqual({ url: `${BASE}/landed`, title: 'Landed' });
    expect(stdinOf(fake.invocations[0])).toEqual([
      ['wait', '--load', 'load'],
      ['get', 'url'],
      ['get', 'title'],
    ]);
  });

  it('waitForNavigation throws on hard wait failures', async () => {
    const fake = new FakeCli();
    fake.onNext(() =>
      batchOutput([
        fail(['wait', '--load', 'load'], 'Element not found. Verify the selector is correct'),
        ok(['get', 'url'], { url: `${BASE}/landed` }),
        ok(['get', 'title'], { title: 'Landed' }),
      ]),
    );
    const driver = makeDriver(fake);
    await expect(driver.waitForNavigation('k', undefined)).rejects.toMatchObject({ name: 'NoSuchElementError' });
  });
});

describe('AgentBrowserDriver — error mapping', () => {
  it('clickRef before observe throws StaleElementReferenceError without any CLI call', async () => {
    const fake = new FakeCli();
    const driver = makeDriver(fake);
    await expect(driver.clickRef('ref-0', 'k', undefined)).rejects.toMatchObject({
      name: 'StaleElementReferenceError',
    });
    expect(fake.invocations).toHaveLength(0);
  });

  it('maps daemon "Unknown ref" to StaleElementReferenceError and "Element not found" to NoSuchElementError', async () => {
    const fake = new FakeCli();
    fake.onNext(() => observePayload());
    fake.onNext(() => batchOutput([fail(['click', '@e3'], 'Unknown ref: e3')]));
    fake.onNext(() => batchOutput([fail(['click', '#missing'], 'Element not found. Verify the selector is correct.')]));
    const driver = makeDriver(fake);

    await driver.observe('k', undefined);
    await expect(driver.clickRef('ref-2', 'k', undefined)).rejects.toMatchObject({
      name: 'StaleElementReferenceError',
    });
    await expect(driver.click('#missing', undefined, 'k', undefined)).rejects.toMatchObject({
      name: 'NoSuchElementError',
    });
  });

  it('a pre-aborted signal rejects with AbortError and makes no CLI call', async () => {
    const fake = new FakeCli();
    const driver = makeDriver(fake);
    const controller = new AbortController();
    controller.abort();
    await expect(driver.navigate('https://example.com', 'k', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fake.invocations).toHaveLength(0);
  });

  it('explicit binaryPath wins in resolveAgentBrowserBinary', () => {
    expect(resolveAgentBrowserBinary('/custom/agent-browser')).toBe('/custom/agent-browser');
  });
});

describe('SpawnAgentBrowserCli — process-level timeout/abort/launch errors', () => {
  it('kills the child and rejects on process timeout', async () => {
    const cli = new SpawnAgentBrowserCli(process.execPath);
    await expect(cli.run({ args: ['-e', 'setTimeout(() => {}, 60_000)'], timeoutMs: 50 })).rejects.toThrow(
      'CLI timed out after 50ms',
    );
  });

  it('rejects with AbortError when the signal is already aborted', async () => {
    const cli = new SpawnAgentBrowserCli(process.execPath);
    const controller = new AbortController();
    controller.abort();
    await expect(
      cli.run({ args: ['-e', 'setTimeout(() => {}, 60_000)'], signal: controller.signal, timeoutMs: 10_000 }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('surfaces a helpful error when the binary cannot be spawned', async () => {
    const cli = new SpawnAgentBrowserCli(join(tmpdir(), 'does-not-exist-vestara-agb'));
    await expect(cli.run({ args: ['--version'], timeoutMs: 2_000 })).rejects.toThrow(
      "install it with 'pnpm add agent-browser'",
    );
  });

  it('rejects with the exit code when the process fails before producing stdout', async () => {
    const cli = new SpawnAgentBrowserCli(process.execPath);
    await expect(cli.run({ args: ['-e', 'console.error("boom"); process.exit(3)'], timeoutMs: 5_000 })).rejects.toThrow(
      'command failed (exit 3): boom',
    );
  });

  it('parses stdout correctly on non-empty output', async () => {
    const cli = new SpawnAgentBrowserCli(process.execPath);
    const out = await cli.run({ args: ['-e', 'console.log(JSON.stringify([{ success: true }]))'], timeoutMs: 5_000 });
    expect(out.stdout).toContain('"success":true');
  });
});
