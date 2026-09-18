/**
 * Telegram Webhook Tunnel — tests
 *
 * Proves the tunnel lifecycle, URL validation, provider output parsing, and
 * webhook registration consent without spawning processes or touching the
 * network.
 */

import { describe, expect, it } from 'vitest';
import {
  buildTelegramWebhookUrl,
  cloudflaredArgs,
  extractTunnelUrl,
  isCommandAvailable,
  isTunnelHost,
  ngrokArgs,
  ProcessTunnelProvider,
  StaticTunnelProvider,
  TelegramTunnelService,
  type TelegramWebhookRegistrar,
  type TunnelProvider,
  TunnelProviderUnavailableError,
  validatePublicUrl,
  waitForHostResolution,
} from '../src/tunnel';

describe('buildTelegramWebhookUrl', () => {
  it('appends the canonical webhook path and normalizes slashes', () => {
    expect(buildTelegramWebhookUrl('https://abc.trycloudflare.com')).toBe(
      'https://abc.trycloudflare.com/api/telegram/webhook',
    );
    expect(buildTelegramWebhookUrl('https://abc.trycloudflare.com/')).toBe(
      'https://abc.trycloudflare.com/api/telegram/webhook',
    );
  });
});

describe('validatePublicUrl', () => {
  it('accepts a public HTTPS URL', () => {
    expect(validatePublicUrl('https://abc.trycloudflare.com').valid).toBe(true);
    expect(validatePublicUrl('https://1a2b.ngrok-free.app').valid).toBe(true);
  });

  it('rejects non-HTTPS URLs', () => {
    expect(validatePublicUrl('http://abc.trycloudflare.com').valid).toBe(false);
  });

  it('rejects loopback and private addresses', () => {
    expect(validatePublicUrl('https://localhost:3001').valid).toBe(false);
    expect(validatePublicUrl('https://127.0.0.1').valid).toBe(false);
    expect(validatePublicUrl('https://192.168.1.10').valid).toBe(false);
    expect(validatePublicUrl('https://10.0.0.5').valid).toBe(false);
    expect(validatePublicUrl('https://172.16.4.4').valid).toBe(false);
  });

  it('rejects empty and malformed values', () => {
    expect(validatePublicUrl('').valid).toBe(false);
    expect(validatePublicUrl(undefined).valid).toBe(false);
    expect(validatePublicUrl('not a url').valid).toBe(false);
  });
});

describe('extractTunnelUrl', () => {
  it('parses a cloudflared quick tunnel URL', () => {
    const output =
      'INF +--------------------------------------------------------------------------------------------+\nINF |  https://random-words-here.trycloudflare.com  |\n';
    expect(extractTunnelUrl(output)).toBe('https://random-words-here.trycloudflare.com');
  });

  it('parses an ngrok URL from JSON logs', () => {
    const output = '{"addr":"http://127.0.0.1:3001","url":"https://1a2b-3c4d.ngrok-free.app"}';
    expect(extractTunnelUrl(output)).toBe('https://1a2b-3c4d.ngrok-free.app');
  });

  it('returns null when no public URL is present', () => {
    expect(extractTunnelUrl('still starting up')).toBeNull();
    expect(extractTunnelUrl('https://localhost:3001')).toBeNull();
  });

  it('ignores non-tunnel links (terms of service) in the banner', () => {
    const banner = [
      'Use of this quick tunnel is subject to the Cloudflare Website Terms of Service (https://www.cloudflare.com/website-terms/).',
      'INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |',
      'INF |  https://random-words-here.trycloudflare.com                                                     |',
    ].join('\n');
    expect(extractTunnelUrl(banner)).toBe('https://random-words-here.trycloudflare.com');
  });

  it('rejects arbitrary public HTTPS URLs that are not tunnel hosts', () => {
    expect(extractTunnelUrl('see https://example.com/tunnel for details')).toBeNull();
  });

  it('identifies known tunnel hosts only', () => {
    expect(isTunnelHost('https://abc.trycloudflare.com')).toBe(true);
    expect(isTunnelHost('https://abc.ngrok-free.app')).toBe(true);
    expect(isTunnelHost('https://www.cloudflare.com')).toBe(false);
    expect(isTunnelHost('not a url')).toBe(false);
  });
});

describe('StaticTunnelProvider', () => {
  it('validates the supplied URL', async () => {
    await expect(new StaticTunnelProvider('manual', 'https://ok.example.com').start()).resolves.toEqual({
      publicUrl: 'https://ok.example.com',
    });
    await expect(new StaticTunnelProvider('manual', 'http://localhost').start()).rejects.toThrow();
  });
});

function fakeProvider(publicUrl: string): TunnelProvider & { stopped: boolean; started: boolean } {
  const provider = {
    kind: 'cloudflared' as const,
    started: false,
    stopped: false,
    async start() {
      provider.started = true;
      return { publicUrl };
    },
    async stop() {
      provider.stopped = true;
    },
  };
  return provider;
}

function fakeRegistrar(): TelegramWebhookRegistrar & { registered: string[]; unregistered: number } {
  const registrar = {
    registered: [] as string[],
    unregistered: 0,
    async register(url: string) {
      registrar.registered.push(url);
      return { ok: true };
    },
    async unregister() {
      registrar.unregistered += 1;
      return { ok: true };
    },
  };
  return registrar;
}

describe('TelegramTunnelService', () => {
  it('enables the manual provider and registers the webhook', async () => {
    const registrar = fakeRegistrar();
    const service = new TelegramTunnelService({
      config: { provider: 'manual', publicUrl: 'https://abc.trycloudflare.com' },
      registrar,
      now: () => new Date('2026-09-16T10:00:00.000Z'),
    });

    const state = await service.enable();
    expect(state.status).toBe('active');
    expect(state.publicUrl).toBe('https://abc.trycloudflare.com');
    expect(state.webhookUrl).toBe('https://abc.trycloudflare.com/api/telegram/webhook');
    expect(state.webhookRegistered).toBe(true);
    expect(registrar.registered).toEqual(['https://abc.trycloudflare.com/api/telegram/webhook']);
  });

  it('fails closed when the manual URL is missing or invalid', async () => {
    const service = new TelegramTunnelService({ config: { provider: 'manual' } });
    const state = await service.enable();
    expect(state.status).toBe('error');
    expect(state.lastError).toBeTruthy();

    const invalid = new TelegramTunnelService({
      config: { provider: 'manual', publicUrl: 'http://127.0.0.1:3001' },
    });
    expect((await invalid.enable()).status).toBe('error');
  });

  it('fails when no process provider is available for the selected kind', async () => {
    const service = new TelegramTunnelService({
      config: { provider: 'cloudflared' },
      providerFactory: () => null,
    });
    const state = await service.enable();
    expect(state.status).toBe('error');
    expect(state.lastError).toContain('cloudflared');
  });

  it('starts a process provider and stops it on disable', async () => {
    const provider = fakeProvider('https://proc.trycloudflare.com');
    const registrar = fakeRegistrar();
    const service = new TelegramTunnelService({
      config: { provider: 'cloudflared', localPort: 3001 },
      providerFactory: () => provider,
      registrar,
    });

    const enabled = await service.enable();
    expect(enabled.status).toBe('active');
    expect(provider.started).toBe(true);
    expect(service.buildLocalUrl()).toBe('http://127.0.0.1:3001');

    const disabled = await service.disable();
    expect(disabled.status).toBe('disabled');
    expect(provider.stopped).toBe(true);
    expect(registrar.unregistered).toBe(1);
    expect(disabled.publicUrl).toBeUndefined();
  });

  it('keeps the tunnel active when webhook registration fails', async () => {
    const service = new TelegramTunnelService({
      config: { provider: 'manual', publicUrl: 'https://abc.trycloudflare.com' },
      registrar: {
        register: async () => ({ ok: false, error: 'Unauthorized' }),
        unregister: async () => ({ ok: true }),
      },
    });

    const state = await service.enable();
    expect(state.status).toBe('active');
    expect(state.webhookRegistered).toBe(false);
    expect(state.lastError).toBe('Unauthorized');
  });

  it('rejects an invalid URL returned by a provider', async () => {
    const provider = fakeProvider('http://localhost:3001');
    const service = new TelegramTunnelService({
      config: { provider: 'ngrok' },
      providerFactory: () => provider,
    });
    const state = await service.enable();
    expect(state.status).toBe('error');
    expect(provider.stopped).toBe(true);
  });

  it('stops the active tunnel when the provider or port changes', async () => {
    const provider = fakeProvider('https://proc.trycloudflare.com');
    const service = new TelegramTunnelService({
      config: { provider: 'cloudflared' },
      providerFactory: () => provider,
    });
    await service.enable();
    expect(service.getState().status).toBe('active');

    const state = await service.configure({ localPort: 4001 });
    expect(state.status).toBe('disabled');
    expect(provider.stopped).toBe(true);
    expect(service.getConfig().localPort).toBe(4001);
  });

  it('keeps runtime state out of configuration', async () => {
    const service = new TelegramTunnelService({ config: { provider: 'manual', publicUrl: 'https://x.example.com' } });
    await service.enable();
    // Configuration never carries lifecycle; only runtime state does.
    expect(service.getConfig().provider).toBe('manual');
    expect(service.getState().status).toBe('active');
  });

  it('is idempotent when enabling an already-active tunnel', async () => {
    const registrar = fakeRegistrar();
    const service = new TelegramTunnelService({
      config: { provider: 'manual', publicUrl: 'https://abc.trycloudflare.com' },
      registrar,
    });
    await service.enable();
    await service.enable();
    expect(registrar.registered).toHaveLength(1);
  });
});

describe('provider argument builders', () => {
  it('embed the URL placeholder that the process provider replaces', () => {
    expect(cloudflaredArgs()).toContain('{{url}}');
    expect(ngrokArgs()).toContain('{{url}}');
  });
});

describe('isCommandAvailable', () => {
  it('detects an installed command', async () => {
    await expect(isCommandAvailable('node')).resolves.toBe(true);
  });

  it('reports a missing command as unavailable', async () => {
    await expect(isCommandAvailable('vestara-definitely-not-installed')).resolves.toBe(false);
  });

  it('rejects empty command names', async () => {
    await expect(isCommandAvailable('')).resolves.toBe(false);
  });
});

describe('ProcessTunnelProvider error mapping', () => {
  it('translates ENOENT into an actionable unavailable error', async () => {
    const provider = new ProcessTunnelProvider('cloudflared', {
      kind: 'cloudflared',
      command: 'vestara-definitely-not-installed',
      args: ['tunnel', '--url', '{{url}}'],
      startTimeoutMs: 5000,
    });

    await expect(provider.start('http://127.0.0.1:3001')).rejects.toBeInstanceOf(TunnelProviderUnavailableError);
    await expect(provider.start('http://127.0.0.1:3001')).rejects.toThrow(/not found on PATH/);
  });

  it('surfaces the actionable error through the service state', async () => {
    const provider = new ProcessTunnelProvider('cloudflared', {
      kind: 'cloudflared',
      command: 'vestara-definitely-not-installed',
      args: ['tunnel', '--url', '{{url}}'],
      startTimeoutMs: 5000,
    });
    const service = new TelegramTunnelService({
      config: { provider: 'cloudflared' },
      providerFactory: () => provider,
    });

    const state = await service.enable();
    expect(state.status).toBe('error');
    expect(state.lastError).toContain('not found on PATH');
  });
});

describe('TelegramTunnelService with injected clock', () => {
  it('records the transition time', async () => {
    const service = new TelegramTunnelService({
      config: { provider: 'manual', publicUrl: 'https://abc.trycloudflare.com' },
      now: () => new Date('2026-09-16T10:00:00.000Z'),
    });
    const state = await service.enable();
    expect(state.changedAt).toBe('2026-09-16T10:00:00.000Z');
  });
});

describe('webhook registration readiness', () => {
  it('does not register until the host resolves, then registers on retry', async () => {
    const registrar = fakeRegistrar();
    let ready = false;
    const service = new TelegramTunnelService({
      config: { provider: 'manual', publicUrl: 'https://abc.trycloudflare.com' },
      registrar,
      readinessProbe: async () => ready,
    });

    const first = await service.enable();
    expect(first.status).toBe('active');
    expect(first.webhookRegistered).toBe(false);
    expect(first.lastError).toContain('not yet resolvable');
    expect(registrar.registered).toHaveLength(0);

    ready = true;
    const retried = await service.enable();
    expect(retried.webhookRegistered).toBe(true);
    expect(retried.lastError).toBeUndefined();
    expect(registrar.registered).toEqual(['https://abc.trycloudflare.com/api/telegram/webhook']);
  });

  it('retries a failed registration while the tunnel stays active', async () => {
    let ok = false;
    const calls: string[] = [];
    const service = new TelegramTunnelService({
      config: { provider: 'manual', publicUrl: 'https://abc.trycloudflare.com' },
      registrar: {
        register: async (url: string) => {
          calls.push(url);
          return ok ? { ok: true } : { ok: false, error: 'Failed to resolve host' };
        },
        unregister: async () => ({ ok: true }),
      },
      readinessProbe: async () => true,
    });

    const first = await service.enable();
    expect(first.webhookRegistered).toBe(false);
    expect(first.lastError).toContain('Failed to resolve host');

    ok = true;
    const second = await service.enable();
    expect(second.status).toBe('active');
    expect(second.webhookRegistered).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it('is a no-op when the webhook is already registered', async () => {
    const registrar = fakeRegistrar();
    const service = new TelegramTunnelService({
      config: { provider: 'manual', publicUrl: 'https://abc.trycloudflare.com' },
      registrar,
      readinessProbe: async () => true,
    });
    await service.enable();
    await service.enable();
    expect(registrar.registered).toHaveLength(1);
  });
});

describe('waitForHostResolution', () => {
  it('resolves a known host', async () => {
    await expect(waitForHostResolution('localhost', { timeoutMs: 2000, intervalMs: 100 })).resolves.toBe(true);
  });

  it('times out for an unresolvable host', async () => {
    await expect(
      waitForHostResolution('definitely-not-a-real-vestara-host.invalid', { timeoutMs: 600, intervalMs: 150 }),
    ).resolves.toBe(false);
  });
});
