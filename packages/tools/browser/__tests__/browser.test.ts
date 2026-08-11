import type { ToolExecutionContext } from '@vestara/tool-runtime';
import type { AgentEnvironment } from '@vestara/types';
import { describe, expect, it } from 'vitest';
import {
  abortError,
  BrowserClickTool,
  BrowserCloseTool,
  type BrowserDriver,
  BrowserNavigateTool,
  type BrowserNavigationResult,
  type BrowserScreenshotResult,
  BrowserScreenshotTool,
  BrowserSession,
  type BrowserSnapshotResult,
  BrowserSnapshotTool,
  BrowserTypeTool,
  redactText,
  resolveBrowserUrl,
} from '../src/index';

const BASE = 'http://app.local:5173';

function context(): ToolExecutionContext {
  return {
    agentId: 'test-agent',
    taskId: 'task-1',
    environment: { workspaceRoot: '/repo' } as unknown as AgentEnvironment,
    signal: new AbortController().signal,
  };
}

class FakeBrowserDriver implements BrowserDriver {
  readonly id = 'fake';
  navigations: Array<{ key: string; url: string }> = [];
  closedKeys: string[] = [];
  abortOnNavigate = false;
  clickLog: Array<{ selector: string; point?: { x: number; y: number }; key: string }> = [];
  typeLog: Array<{ selector: string; text: string; submit: boolean; key: string }> = [];

  async navigate(url: string, key: string): Promise<BrowserNavigationResult> {
    if (this.abortOnNavigate) throw abortError();
    this.navigations.push({ key, url });
    return { url, title: 'Fake Page' };
  }

  async snapshot(key: string): Promise<BrowserSnapshotResult> {
    const last = this.navigations.findLast((entry) => entry.key === key);
    return { url: last?.url ?? BASE, title: 'Fake Page', text: 'lorem ipsum dolor sit amet' };
  }

  async screenshot(): Promise<BrowserScreenshotResult> {
    return { url: BASE, width: 640, height: 480, bytes: new Uint8Array([1, 2, 3, 4]) };
  }

  async click(selector: string, point: { x: number; y: number } | undefined, key: string): Promise<void> {
    this.clickLog.push({ selector, point, key });
  }

  async type(selector: string, text: string, submit: boolean, key: string): Promise<void> {
    this.typeLog.push({ selector, text, submit, key });
  }

  async close(key?: string): Promise<void> {
    if (key) this.closedKeys.push(key);
  }
}

function session(driver: FakeBrowserDriver, options: Record<string, unknown> = {}) {
  return new BrowserSession(driver, { baseUrl: BASE, ...options });
}

describe('resolveBrowserUrl policy', () => {
  it('resolves relative paths against the base URL', () => {
    expect(resolveBrowserUrl(BASE, undefined, '/dashboard')).toBe('http://app.local:5173/dashboard');
  });

  it('allows absolute URLs on the base origin', () => {
    expect(resolveBrowserUrl(BASE, undefined, `${BASE}/evidence`)).toBe(`${BASE}/evidence`);
  });

  it('blocks a foreign origin by default', () => {
    expect(() => resolveBrowserUrl(BASE, undefined, 'https://evil.example/')).toThrow(/origin not allowed/);
  });

  it('allows an explicit allowed origin and a wildcard', () => {
    expect(resolveBrowserUrl(BASE, ['https://docs.example.com'], 'https://docs.example.com/guide')).toBe(
      'https://docs.example.com/guide',
    );
    expect(resolveBrowserUrl(BASE, ['*'], 'https://docs.example.com/guide')).toBe('https://docs.example.com/guide');
  });

  it('normalizes bare hostnames into origins', () => {
    expect(resolveBrowserUrl(BASE, ['docs.example.com'], 'https://docs.example.com/guide')).toBe(
      'https://docs.example.com/guide',
    );
  });

  it('rejects data: and javascript: targets', () => {
    expect(() => resolveBrowserUrl(BASE, ['*'], 'javascript:alert(1)')).toThrow(/not allowed/);
    expect(() => resolveBrowserUrl(BASE, ['*'], 'data:text/html,<h1>x</h1>')).toThrow(/not allowed/);
  });

  it('rejects empty or malformed targets', () => {
    expect(() => resolveBrowserUrl(BASE, ['*'], '   ')).toThrow(/must not be empty/);
    expect(() => resolveBrowserUrl(BASE, ['*'], 'not-a-url')).toThrow(/must be an http\(s\) URL or a path/);
  });
});

describe('BrowserNavigateTool', () => {
  it('resolves the target through the session policy and navigates', async () => {
    const driver = new FakeBrowserDriver();
    const tool = new BrowserNavigateTool(session(driver));
    const result = await tool.execute({ url: '/dashboard' }, context());
    expect(result.status).toBe('completed');
    expect(result.output).toEqual({ url: `${BASE}/dashboard`, title: 'Fake Page' });
    expect(driver.navigations).toEqual([{ key: 'test-agent:task-1', url: `${BASE}/dashboard` }]);
    expect(result.evidence[0]?.kind).toBe('custom');
  });

  it('retains information-governance metadata on the evidence artifact (ENG-007)', async () => {
    const tool = new BrowserNavigateTool(session(new FakeBrowserDriver()));
    const result = await tool.execute({ url: '/dashboard' }, context());
    const governance = (result.evidence[0]!.metadata as { governance: unknown }).governance;
    expect(governance).toEqual({
      origin: 'http://app.local:5173',
      route: '/dashboard',
      classification: 'internal',
      informationRisk: 'medium',
      redactionStatus: 'unredacted',
      retentionPolicy: 'workspace-default',
      requestingAgent: 'test-agent',
    });
  });

  it('records a configured confidential classification as high information risk', async () => {
    const driver = new FakeBrowserDriver();
    const tool = new BrowserNavigateTool(
      new BrowserSession(driver, { baseUrl: BASE, classification: 'confidential', retentionPolicy: 'pci-30' }),
    );
    const result = await tool.execute({ url: '/billing' }, context());
    const governance = (result.evidence[0]!.metadata as { governance: Record<string, unknown> }).governance;
    expect(governance.classification).toBe('confidential');
    expect(governance.informationRisk).toBe('high');
    expect(governance.retentionPolicy).toBe('pci-30');
  });

  it('fails when the target is outside the allowed origins', async () => {
    const driver = new FakeBrowserDriver();
    const tool = new BrowserNavigateTool(session(driver));
    const result = await tool.execute({ url: 'https://evil.example/' }, context());
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/origin not allowed/);
    expect(driver.navigations).toEqual([]);
  });
});

describe('BrowserSnapshotTool', () => {
  it('returns the visible text truncated to maxChars', async () => {
    const tool = new BrowserSnapshotTool(session(new FakeBrowserDriver()));
    const result = await tool.execute({ maxChars: 5 }, context());
    expect(result.status).toBe('completed');
    expect(result.output?.text).toBe('lorem…');
  });
});

describe('BrowserScreenshotTool', () => {
  it('returns a PNG data URL and records a screenshot evidence artifact', async () => {
    const tool = new BrowserScreenshotTool(session(new FakeBrowserDriver()));
    const result = await tool.execute({}, context());
    expect(result.status).toBe('completed');
    expect(result.output?.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(result.output?.size).toBe(4);
    expect(result.evidence[0]?.kind).toBe('screenshot');
  });
});

describe('BrowserClickTool', () => {
  it('clicks by selector', async () => {
    const driver = new FakeBrowserDriver();
    const tool = new BrowserClickTool(session(driver));
    const result = await tool.execute({ selector: '#submit' }, context());
    expect(result.status).toBe('completed');
    expect(driver.clickLog).toEqual([{ selector: '#submit', point: undefined, key: 'test-agent:task-1' }]);
  });

  it('clicks by coordinates', async () => {
    const driver = new FakeBrowserDriver();
    const tool = new BrowserClickTool(session(driver));
    await tool.execute({ x: 10, y: 20 }, context());
    expect(driver.clickLog).toEqual([{ selector: 'body', point: { x: 10, y: 20 }, key: 'test-agent:task-1' }]);
  });

  it('rejects selector combined with coordinates or neither', () => {
    const tool = new BrowserClickTool(session(new FakeBrowserDriver()));
    expect(() => tool.inputSchema.parse({ selector: '#a', x: 1, y: 2 })).toThrow(/selector or coordinates, not both/);
    expect(() => tool.inputSchema.parse({ x: 1 })).toThrow(/requires a selector or both/);
    expect(() => tool.inputSchema.parse({})).toThrow(/requires a selector or both/);
  });
});

describe('BrowserTypeTool', () => {
  it('fills a field and optionally submits', async () => {
    const driver = new FakeBrowserDriver();
    const tool = new BrowserTypeTool(session(driver));
    await tool.execute({ selector: '#q', text: 'hello', submit: true }, context());
    expect(driver.typeLog).toEqual([{ selector: '#q', text: 'hello', submit: true, key: 'test-agent:task-1' }]);
  });
});

describe('BrowserCloseTool', () => {
  it("closes the calling agent's isolated page", async () => {
    const driver = new FakeBrowserDriver();
    const tool = new BrowserCloseTool(session(driver));
    const result = await tool.execute({}, context());
    expect(result.status).toBe('completed');
    expect(result.output).toEqual({ closed: true });
    expect(driver.closedKeys).toEqual(['test-agent:task-1']);
  });
});

describe('session isolation (per agent:task)', () => {
  it('scopes browser state to the requesting agent:task key', async () => {
    const driver = new FakeBrowserDriver();
    const tool = new BrowserNavigateTool(session(driver));
    const first = context();
    const second = context();
    second.agentId = 'other-agent';
    second.taskId = 'task-2';
    await tool.execute({ url: '/dashboard' }, first);
    await tool.execute({ url: '/billing' }, second);
    expect(driver.navigations).toEqual([
      { key: 'test-agent:task-1', url: `${BASE}/dashboard` },
      { key: 'other-agent:task-2', url: `${BASE}/billing` },
    ]);
  });
});

describe('per-origin information policy (ENG-007 enforcement)', () => {
  it('derives classification, retention, and redaction from the target origin policy', () => {
    const sess = session(new FakeBrowserDriver(), {
      originPolicies: [
        {
          origin: 'billing.app.local',
          classification: 'confidential',
          retentionPolicy: 'pci-30',
          redaction: 'secrets',
        },
      ],
    });
    const policy = sess.policyFor('http://billing.app.local/invoices');
    expect(policy).toMatchObject({
      origin: 'http://billing.app.local',
      route: '/invoices',
      classification: 'confidential',
      informationRisk: 'high',
      retentionPolicy: 'pci-30',
      redaction: 'secrets',
    });
    expect(sess.policyFor('http://app.local:5173/dashboard')).toMatchObject({
      classification: 'internal',
      redaction: 'off',
      retentionPolicy: 'workspace-default',
    });
  });

  it('allows navigation to an origin that carries a policy entry', async () => {
    const driver = new FakeBrowserDriver();
    const sess = session(driver, {
      originPolicies: [{ origin: 'https://billing.app.local' }],
    });
    await sess.navigate('https://billing.app.local/invoices', 'agent-1:task-9');
    expect(driver.navigations).toEqual([{ key: 'agent-1:task-9', url: 'https://billing.app.local/invoices' }]);
  });
});

describe('sensitive-content redaction', () => {
  it('redacts secret-looking tokens from snapshot text under a secrets policy', async () => {
    const driver = new FakeBrowserDriver();
    const textWithSecret =
      'Bearer abc123tokenvalue and token=sk_live_abcdefghijklmnop longhex 0123456789abcdef0123456789abcdef0123456789';
    const sess = new BrowserSession(driver, {
      baseUrl: BASE,
      redaction: 'secrets',
    });
    const redacted = sess.redactSnapshot(textWithSecret, BASE);
    expect(redacted.redactionStatus).toBe('redacted');
    expect(redacted.text).not.toContain('sk_live_');
    expect(redacted.text).not.toContain('abc123tokenvalue');
    expect(redacted.text).toContain('[REDACTED]');
  });

  it('replaces snapshot text entirely under a full redaction policy', () => {
    const sess = session(new FakeBrowserDriver(), { redaction: 'full' });
    const redacted = sess.redactSnapshot('sensitive body text', BASE);
    expect(redacted.text).toBe('[REDACTED — full redaction policy]');
    expect(redacted.redactionStatus).toBe('redacted');
  });

  it('refuses to return screenshot pixels when the origin policy requires redaction', async () => {
    const sess = session(new FakeBrowserDriver(), {
      originPolicies: [{ origin: BASE, redaction: 'secrets' }],
    });
    const tool = new BrowserScreenshotTool(sess);
    const result = await tool.execute({}, context());
    expect(result.status).toBe('completed');
    expect(result.output?.dataUrl).toBeUndefined();
    expect(result.output?.redacted).toBe(true);
    expect(result.evidence[0]?.metadata).toMatchObject({ redacted: true });
  });

  it('returns pixels when no redaction policy applies', async () => {
    const tool = new BrowserScreenshotTool(session(new FakeBrowserDriver()));
    const result = await tool.execute({}, context());
    expect(result.output?.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(result.output?.redacted).toBeUndefined();
  });
});

describe('observable cancel behavior', () => {
  it('maps an abort to a cancelled result instead of a failure', async () => {
    const driver = new FakeBrowserDriver();
    driver.abortOnNavigate = true;
    const tool = new BrowserNavigateTool(session(driver));
    const result = await tool.execute({ url: '/dashboard' }, context());
    expect(result.status).toBe('cancelled');
    expect(result.evidence).toEqual([]);
  });
});

describe('redactText', () => {
  it('masks credential patterns and leaves plain text intact', () => {
    expect(redactText('plain text remains')).toBe('plain text remains');
    expect(redactText('Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456')).not.toContain(
      'abcdefghijklmnopqrstuvwxyz123456',
    );
    expect(redactText('key=ghp_abcdefghijklmnopqrstuvwxyz1234567890')).toContain('[REDACTED]');
    expect(
      redactText('jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.4STU4G9Rqk1r0N0k4Rqk1r0N0k4Rqk'),
    ).not.toContain('eyJhbGci');
  });
});

describe('action replay trace (ENG-008)', () => {
  it('records an ordered interaction trace per session key', async () => {
    const sess = session(new FakeBrowserDriver());
    const key = 'agent-1:task-1';
    await sess.navigate('/dashboard', key);
    await sess.click('#submit', undefined, key);
    await sess.type('#q', 'hello', false, key);
    expect(sess.traceFor(key)).toEqual([
      { type: 'run-scenario', target: `${BASE}/dashboard`, command: 'navigate /dashboard' },
      { type: 'run-scenario', target: `${BASE}/dashboard`, command: 'click #submit' },
      { type: 'run-scenario', target: `${BASE}/dashboard`, command: 'type #q' },
    ]);
  });

  it('keeps traces isolated per session key', async () => {
    const sess = session(new FakeBrowserDriver());
    await sess.navigate('/dashboard', 'a:1');
    await sess.navigate('/billing', 'b:2');
    expect(sess.traceFor('a:1')).toHaveLength(1);
    expect(sess.traceFor('b:2')).toHaveLength(1);
  });

  it('builds an execution-mode replay descriptor claiming only the Chromium runtime', async () => {
    const sess = session(new FakeBrowserDriver());
    const key = 'agent-1:task-1';
    await sess.navigate('/dashboard', key);
    await sess.click('#submit', undefined, key);
    expect(sess.replayDescriptor(key)).toEqual({
      mode: 'execution',
      steps: sess.traceFor(key),
      requires: { runtime: 'playwright-chromium' },
    });
  });

  it('clears the trace when the session closes', async () => {
    const sess = session(new FakeBrowserDriver());
    await sess.navigate('/dashboard', 'a:1');
    await sess.close('a:1');
    expect(sess.traceFor('a:1')).toEqual([]);
  });

  it('attaches the replay descriptor to evidence artifact metadata', async () => {
    const tool = new BrowserNavigateTool(session(new FakeBrowserDriver()));
    const result = await tool.execute({ url: '/dashboard' }, context());
    const metadata = result.evidence[0]!.metadata as {
      replay: { mode: string; steps: unknown[]; requires: { runtime: string } };
    };
    expect(metadata.replay.mode).toBe('execution');
    expect(metadata.replay.steps).toHaveLength(1);
    expect(metadata.replay.requires.runtime).toBe('playwright-chromium');
  });
});
