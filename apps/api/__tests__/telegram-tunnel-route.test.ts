/**
 * Telegram webhook tunnel route — tests
 *
 * Exercises the Settings-facing tunnel endpoints with no process spawn and no
 * network: the manual provider is used and the bot token is removed so no
 * webhook registrar is constructed.
 */

import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it } from 'vitest';
import { handleTelegramRoute } from '../src/routes/telegram';

function mockReq(body: unknown): any {
  const req = new EventEmitter() as any;
  req.headers = {};
  req.pause = () => {};
  setImmediate(() => {
    if (body !== undefined) {
      req.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
    }
    req.emit('end');
  });
  return req;
}

function mockRes(): any {
  return {
    writableEnded: false,
    headersSent: false,
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    writeHead(status: number, headers: Record<string, string>) {
      this.statusCode = status;
      this.headers = headers;
    },
    setHeader() {},
    end(data?: string) {
      if (data) this.body += data;
      this.writableEnded = true;
    },
  };
}

async function call(method: string, path: string, body: unknown) {
  const res = mockRes();
  await handleTelegramRoute(method, path, mockReq(body), res, {} as any, 0, new URL(`http://localhost${path}`));
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : undefined };
}

beforeEach(() => {
  delete process.env.TELEGRAM_BOT_TOKEN;
});

describe('/api/telegram/tunnel', () => {
  it('reports a disabled tunnel by default', async () => {
    const { status, body } = await call('GET', '/api/telegram/tunnel', undefined);
    expect(status).toBe(200);
    expect(body.config.provider).toBe('manual');
    expect(body.state.status).toBe('disabled');
    expect(body.state.webhookUrl).toBeUndefined();
    // Availability is always reported; `manual` never depends on a local binary.
    expect(body.availability.manual).toBe(true);
    expect(typeof body.availability.cloudflared).toBe('boolean');
    expect(typeof body.availability.ngrok).toBe('boolean');
  });

  it('fails closed when enabling the manual provider without a URL', async () => {
    await call('PUT', '/api/telegram/tunnel', { provider: 'manual', publicUrl: '', enabled: true });
    const { body } = await call('GET', '/api/telegram/tunnel', undefined);
    expect(body.state.status).toBe('error');
    expect(body.state.lastError).toBeTruthy();
  });

  it('enables the tunnel with a valid public URL and derives the webhook URL', async () => {
    const enabled = await call('PUT', '/api/telegram/tunnel', {
      provider: 'manual',
      publicUrl: 'https://abc.trycloudflare.com',
      enabled: true,
    });
    expect(enabled.status).toBe(200);
    expect(enabled.body.state.status).toBe('active');
    expect(enabled.body.state.publicUrl).toBe('https://abc.trycloudflare.com');
    expect(enabled.body.state.webhookUrl).toBe('https://abc.trycloudflare.com/api/telegram/webhook');
    // No bot token configured → registration is not attempted.
    expect(enabled.body.state.webhookRegistered).toBe(false);
  });

  it('disables an active tunnel', async () => {
    await call('PUT', '/api/telegram/tunnel', {
      provider: 'manual',
      publicUrl: 'https://abc.trycloudflare.com',
      enabled: true,
    });
    const disabled = await call('PUT', '/api/telegram/tunnel', { enabled: false });
    expect(disabled.body.state.status).toBe('disabled');
    expect(disabled.body.state.publicUrl).toBeUndefined();
  });

  it('ignores an unknown provider value', async () => {
    const { body } = await call('PUT', '/api/telegram/tunnel', { provider: 'evil-provider' });
    expect(body.config.provider).toBe('manual');
  });

  it('persists the tunnel configuration in the settings read model', async () => {
    await call('PUT', '/api/telegram/tunnel', {
      provider: 'manual',
      publicUrl: 'https://abc.trycloudflare.com',
      localPort: 4242,
    });
    const { body } = await call('GET', '/api/telegram/settings', undefined);
    expect(body.tunnel.config.localPort).toBe(4242);
    expect(body.tunnel.config.publicUrl).toBe('https://abc.trycloudflare.com');
  });
});
