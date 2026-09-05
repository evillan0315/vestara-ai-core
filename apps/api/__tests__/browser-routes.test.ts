import { BrowserRuntimeService } from '@vestara/browser-runtime';
import type {
  BrowserDriver,
  BrowserNavigationResult,
  BrowserObserveResult,
  BrowserPoint,
  BrowserScreenshotResult,
  BrowserSnapshotResult,
} from '@vestara/tools-browser';
import { describe, expect, it } from 'vitest';
import { createServer } from '../src/server';

const BASE = 'http://app.local:5173';

class FakeBrowserDriver implements BrowserDriver {
  readonly id = 'fake';
  navigations: string[] = [];

  async navigate(url: string): Promise<BrowserNavigationResult> {
    this.navigations.push(url);
    return { url, title: 'Fake Page' };
  }

  async snapshot(): Promise<BrowserSnapshotResult> {
    return { url: BASE, title: 'Fake Page', text: 'hello world' };
  }

  async screenshot(): Promise<BrowserScreenshotResult> {
    return { url: BASE, width: 640, height: 480, bytes: new Uint8Array([1, 2, 3, 4]) };
  }

  async observe(): Promise<BrowserObserveResult> {
    return { url: BASE, title: 'Fake Page', observationId: 'obs', elements: [] };
  }

  async click(_selector: string, _point: BrowserPoint | undefined): Promise<void> {}
  async clickRef(_ref: string): Promise<void> {}
  async type(_selector: string, _text: string, _submit: boolean): Promise<void> {}
  async typeRef(_ref: string, _text: string, _submit: boolean): Promise<void> {}
  async scroll(): Promise<void> {}
  async back(): Promise<void> {}
  async forward(): Promise<void> {}
  async reload(): Promise<void> {}
  async waitForNavigation(): Promise<BrowserNavigationResult> {
    return { url: BASE, title: 'Fake Page' };
  }
  async close(): Promise<void> {}
}

async function boot(): Promise<ReturnType<typeof createServer>> {
  const browserRuntime = new BrowserRuntimeService({
    workspaceId: 'test',
    driverFactory: () => new FakeBrowserDriver(),
  });
  await browserRuntime.start();
  const ctx = {
    repoPath: '/test',
    workspaceDir: '/test/.vestara',
    runtime: { currentStatus: 'ready' },
    orchestrator: null,
    browserRuntime,
  };
  const server = createServer(ctx as never, 0);
  await server.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { server, port };
}

async function postJson(port: number, path: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as unknown;
  return { status: res.status, body: data };
}

describe('/api/browser routes', () => {
  it('creates a session', async () => {
    const { server, port } = await boot();
    try {
      const { status, body } = await postJson(port, '/api/browser/session', { ownerId: 'web', taskId: 'live' });
      expect(status).toBe(200);
      expect(body).toMatchObject({ sessionId: 'web:live', status: 'active' });
    } finally {
      server.close();
    }
  });

  it('navigates through a session', async () => {
    const { server, port } = await boot();
    try {
      await postJson(port, '/api/browser/session', { ownerId: 'web', taskId: 'live' });
      const { status, body } = await postJson(port, '/api/browser/navigate', {
        sessionId: 'web:live',
        url: 'http://example.com',
      });
      expect(status).toBe(200);
      expect(body).toMatchObject({ url: 'http://example.com/' });
    } finally {
      server.close();
    }
  });

  it('returns a screenshot data URL', async () => {
    const { server, port } = await boot();
    try {
      await postJson(port, '/api/browser/session', { ownerId: 'web', taskId: 'live' });
      const { status, body } = await postJson(port, '/api/browser/screenshot', { sessionId: 'web:live' });
      expect(status).toBe(200);
      expect(body).toMatchObject({ dataUrl: expect.stringContaining('data:image/png;base64,') });
    } finally {
      server.close();
    }
  });

  it('takes and returns control', async () => {
    const { server, port } = await boot();
    try {
      await postJson(port, '/api/browser/session', { ownerId: 'web', taskId: 'live' });
      const taken = await postJson(port, '/api/browser/take-control', { sessionId: 'web:live' });
      expect(taken.body).toMatchObject({ controlMode: 'human' });
      const returned = await postJson(port, '/api/browser/return-control', { sessionId: 'web:live' });
      expect(returned.body).toMatchObject({ controlMode: 'agent' });
    } finally {
      server.close();
    }
  });

  it('blocks agent actions while a human controls the session', async () => {
    const { server, port } = await boot();
    try {
      await postJson(port, '/api/browser/session', { ownerId: 'web', taskId: 'live' });
      await postJson(port, '/api/browser/take-control', { sessionId: 'web:live' });
      const { status, body } = await postJson(port, '/api/browser/navigate', {
        sessionId: 'web:live',
        url: 'http://example.com',
      });
      expect(status).toBe(400);
      expect(body).toMatchObject({ error: expect.stringMatching(/human controls/i) });
    } finally {
      server.close();
    }
  });

  it('returns 400 when the browser runtime is not configured', async () => {
    const server = createServer(
      {
        repoPath: '/test',
        workspaceDir: '/test/.vestara',
        runtime: { currentStatus: 'ready' },
        orchestrator: null,
      } as never,
      0,
    );
    await server.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    try {
      const { status, body } = await postJson(port, '/api/browser/session', {});
      expect(status).toBe(400);
      expect(body).toMatchObject({ error: expect.stringContaining('not configured') });
    } finally {
      server.close();
    }
  });

  it('runs a multi-step login instruction as a browser task', async () => {
    const { server, port } = await boot();
    try {
      await postJson(port, '/api/browser/session', { ownerId: 'web', taskId: 'live' });
      const { status, body } = await postJson(port, '/api/browser/instruction', {
        sessionId: 'web:live',
        text: 'log in to http://example.com as alice with s3cret',
      });
      expect(status).toBe(200);
      const task = body as { task: { steps: Array<{ action: string; status: string }> }; summary: { status: string } };
      expect(task.summary.status).toBe('completed');
      expect(task.task.steps.map((s) => s.action)).toEqual(['navigate', 'type', 'type', 'click']);
      expect(task.task.steps.every((s) => s.status === 'completed')).toBe(true);
    } finally {
      server.close();
    }
  });

  it('runs a search instruction to completion', async () => {
    const { server, port } = await boot();
    try {
      await postJson(port, '/api/browser/session', { ownerId: 'web', taskId: 'live' });
      const { status, body } = await postJson(port, '/api/browser/instruction', {
        sessionId: 'web:live',
        text: 'search for monitors on http://example.com',
      });
      expect(status).toBe(200);
      const task = body as { task: { steps: Array<{ action: string }> }; summary: { status: string } };
      expect(task.summary.status).toBe('completed');
      expect(task.task.steps.map((s) => s.action)).toEqual(['navigate', 'type']);
    } finally {
      server.close();
    }
  });

  it('returns 400 for an instruction without text', async () => {
    const { server, port } = await boot();
    try {
      await postJson(port, '/api/browser/session', { ownerId: 'web', taskId: 'live' });
      const { status, body } = await postJson(port, '/api/browser/instruction', { sessionId: 'web:live' });
      expect(status).toBe(400);
      expect(body).toMatchObject({ error: expect.stringContaining('requires sessionId and text') });
    } finally {
      server.close();
    }
  });

  it('returns 400 for an unparseable instruction', async () => {
    const { server, port } = await boot();
    try {
      await postJson(port, '/api/browser/session', { ownerId: 'web', taskId: 'live' });
      const { status, body } = await postJson(port, '/api/browser/instruction', {
        sessionId: 'web:live',
        text: 'quantum banana',
      });
      expect(status).toBe(400);
      expect(body).toMatchObject({ error: expect.stringContaining('Could not understand the instruction') });
    } finally {
      server.close();
    }
  });
});

describe('/api/voice routes', () => {
  it('converts a navigate command into a browser action', async () => {
    const { server, port } = await boot();
    try {
      const { status, body } = await postJson(port, '/api/voice/intent', {
        text: 'go to http://example.com',
      });
      expect(status).toBe(200);
      expect(body).toMatchObject({
        intent: { type: 'navigate_url' },
        action: { type: 'navigate' },
      });
    } finally {
      server.close();
    }
  });

  it('converts a screenshot command', async () => {
    const { server, port } = await boot();
    try {
      const { status, body } = await postJson(port, '/api/voice/intent', {
        text: 'take a screenshot',
      });
      expect(status).toBe(200);
      expect(body).toMatchObject({
        intent: { type: 'take_screenshot' },
        action: { type: 'screenshot' },
      });
    } finally {
      server.close();
    }
  });

  it('falls back to a search intent for unrecognized commands', async () => {
    const { server, port } = await boot();
    try {
      const { status, body } = await postJson(port, '/api/voice/intent', {
        text: 'banana muffin circus',
      });
      expect(status).toBe(200);
      expect(body).toMatchObject({
        intent: { type: 'navigate_search' },
        action: { type: 'navigate' },
      });
    } finally {
      server.close();
    }
  });

  it('returns 400 for missing text', async () => {
    const { server, port } = await boot();
    try {
      const { status, body } = await postJson(port, '/api/voice/intent', {});
      expect(status).toBe(400);
      expect(body).toMatchObject({ error: expect.stringContaining('requires text') });
    } finally {
      server.close();
    }
  });
});
