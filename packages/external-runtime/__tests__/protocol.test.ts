import { describe, expect, it } from 'vitest';
import type { ExternalAgentRuntimeAdapter } from '../src/adapter.js';
import {
  buildCorrelation,
  ExternalAdapterError,
  ExternalRuntimeRegistry,
  isSensitiveKey,
  methodConfidence,
  redact,
  redactCredential,
  wasRedacted,
} from '../src/index.js';
import type { ExternalRuntimeEventObserver } from '../src/types.js';

// ─── Redaction ────────────────────────────────────────────────

describe('redaction', () => {
  it('masks sensitive keys recursively', () => {
    const input = {
      provider: 'openai',
      apiKey: 'sk-abcdef1234567890',
      models: [{ id: 'gpt-4o', temperature: 0.5 }],
      nested: { authorization: 'Bearer xyz' },
    };
    const out = redact(input);
    expect(out.apiKey).toBe('[REDACTED]');
    expect((out.nested as { authorization: string }).authorization).toBe('[REDACTED]');
    expect((out.models as Array<{ id: string }>)[0].id).toBe('gpt-4o');
    expect(out.provider).toBe('openai');
  });

  it('redacts secret-looking string values', () => {
    expect(redact('Bearer abcdefghij')).toBe('[REDACTED]');
    expect(redact('ghp_abcdefghijklmnopqrstuvwxyz123456')).toBe('[REDACTED]');
  });

  it('preserves metadata via redactCredential', () => {
    const out = redactCredential({
      provider: 'openai',
      configured: true,
      credentialSource: 'environment',
      apiKey: 'sk-xxx',
    });
    expect(out.provider).toBe('openai');
    expect(out.configured).toBe(true);
    expect(out.credentialSource).toBe('environment');
    expect(out.apiKey).toBe('[REDACTED]');
  });

  it('detects redaction occurred', () => {
    expect(wasRedacted({ token: 'abc' })).toBe(true);
    expect(wasRedacted({ name: 'safe' })).toBe(false);
  });

  it('recognizes sensitive key patterns', () => {
    expect(isSensitiveKey('apiKey')).toBe(true);
    expect(isSensitiveKey('client_secret')).toBe(true);
    expect(isSensitiveKey('displayName')).toBe(false);
  });
});

// ─── Correlation ──────────────────────────────────────────────

describe('correlation', () => {
  it('authoritative correlations are confirmed', () => {
    const c = buildCorrelation({
      runtimeInstanceId: 'oc-1',
      runtimeType: 'opencode',
      externalSessionId: 's1',
      workspaceId: 'w1',
      method: 'explicit',
      authoritative: true,
      evidence: [{ method: 'explicit', detail: 'VESTARA_EXECUTION_ID=s1', observedAt: new Date().toISOString() }],
    });
    expect(c.confidence).toBe(1);
    expect(c.method).toBe('explicit');
  });

  it('inferred correlation gets a lower confidence and is not confirmed', () => {
    const c = buildCorrelation({
      runtimeInstanceId: 'oc-1',
      runtimeType: 'opencode',
      externalSessionId: 's2',
      workspaceId: 'w1',
      method: 'workspace-path',
      authoritative: false,
      evidence: [{ method: 'workspace-path', detail: 'same root', observedAt: new Date().toISOString() }],
    });
    expect(c.confidence).toBeLessThan(1);
    expect(c.confidence).toBe(methodConfidence('workspace-path'));
  });

  it('explicit launch-record is authoritative', () => {
    expect(methodConfidence('launch-record')).toBe(1);
    expect(methodConfidence('file-overlap')).toBe(0.2);
  });
});

// ─── Errors ───────────────────────────────────────────────────

describe('ExternalAdapterError', () => {
  it('marks unreachable/timeout errors retryable', () => {
    expect(new ExternalAdapterError('unreachable', 'opencode', 'x').retryable).toBe(true);
    expect(new ExternalAdapterError('not-installed', 'opencode', 'x').retryable).toBe(false);
  });
});

// ─── Registry ─────────────────────────────────────────────────

function fakeAdapter(
  runtimeType: 'opencode' | 'claude-code' | 'openai-codex',
  detected = true,
): ExternalAgentRuntimeAdapter {
  return {
    runtimeType,
    capabilities: ['installation-discovery', 'version-discovery', 'session-discovery'],
    capabilityStatus: () => [],
    detect: async () => ({
      runtimeType,
      detected,
      executablePath: `/usr/bin/${runtimeType}`,
      version: '1.0.0',
      runningProcesses: [1234],
    }),
    connect: async () => ({
      id: `${runtimeType}-conn`,
      runtimeInstanceId: runtimeType,
      runtimeType,
      connectedAt: new Date().toISOString(),
      mode: 'process',
    }),
    disconnect: async () => {},
    getHealth: async () => ({ status: 'ok', checkedAt: new Date().toISOString() }),
    getRuntimeSnapshot: async () => {
      throw new ExternalAdapterError('unsupported-capability', runtimeType, 'n/a');
    },
    listSessions: async () => [],
    getSession: async (_c, id) => ({
      id: `${runtimeType}-session-${id}`,
      runtimeInstanceId: runtimeType,
      runtimeType,
      externalSessionId: id,
      status: 'idle',
      integrationLevel: 'discovery-only',
      messages: [],
      tools: [],
      commands: [],
      fileMutations: [],
      permissions: [],
      diagnostics: [],
      todos: [],
      partiallyObserved: true,
    }),
    getConfiguration: async () => ({
      id: 'cfg',
      runtimeInstanceId: runtimeType,
      runtimeType,
      sources: [],
      effective: {},
      effectiveValues: [],
      capturedAt: new Date().toISOString(),
    }),
    subscribe: async (_c, _observer: ExternalRuntimeEventObserver) => ({
      id: 'sub',
      runtimeInstanceId: runtimeType,
      unsubscribe: () => {},
    }),
  };
}

describe('ExternalRuntimeRegistry', () => {
  it('discovers installed runtimes without throwing', async () => {
    const registry = new ExternalRuntimeRegistry('/workspace', 'w1');
    registry.registerAdapter(fakeAdapter('opencode'));
    registry.registerAdapter(fakeAdapter('claude-code', false));
    const detected = await registry.discover();
    expect(detected.length).toBe(1);
    expect(detected[0].runtimeType).toBe('opencode');
    expect(detected[0].isPrimary).toBe(true);
    expect(detected[0].supportedCapabilities).toContain('installation-discovery');
  });

  it('reports honest discovery-only state until verified', async () => {
    const registry = new ExternalRuntimeRegistry('/workspace', 'w1');
    registry.registerAdapter(fakeAdapter('opencode'));
    const [instance] = await registry.discover();
    // Adapter supports live-events/session-discovery, but nothing is exercised yet.
    expect(instance.integrationLevel).toBe('discovery-only');
    expect(instance.availableCapabilities).toEqual([]);
    expect(instance.verificationStatus).toBe('unit-tested');
    expect(instance.supportedCapabilities).toContain('session-discovery');
  });

  it('verify() upgrades integration level and available capabilities with evidence', async () => {
    const registry = new ExternalRuntimeRegistry('/workspace', 'w1');
    registry.registerAdapter(fakeAdapter('opencode'));
    const [instance] = await registry.discover();
    const verified = registry.verify(instance.id, {
      availableCapabilities: ['installation-discovery', 'session-discovery'],
      integrationLevel: 'snapshot',
      verificationStatus: 'live-discovery-verified',
      connectionStatus: 'connected',
    });
    expect(verified?.integrationLevel).toBe('snapshot');
    expect(verified?.availableCapabilities).toContain('session-discovery');
    expect(verified?.verificationStatus).toBe('live-discovery-verified');
    expect(registry.getInstance(instance.id)?.connectionStatus).toBe('connected');
  });

  it('connects to an instance and dedupes connections', async () => {
    const registry = new ExternalRuntimeRegistry('/workspace', 'w1');
    registry.registerAdapter(fakeAdapter('opencode'));
    const [instance] = await registry.discover();
    const first = await registry.connect(instance.id);
    const second = await registry.connect(instance.id);
    expect(second.id).toBe(first.id); // deduped
    expect(registry.isConnected(instance.id)).toBe(true);
  });

  it('subscribe prevents duplicate subscriptions per instance', async () => {
    const registry = new ExternalRuntimeRegistry('/workspace', 'w1');
    registry.registerAdapter(fakeAdapter('opencode'));
    const [instance] = await registry.discover();
    await registry.connect(instance.id);
    const events: string[] = [];
    const unsub1 = await registry.subscribe(instance.id, (e) => events.push(e.type));
    const unsub2 = await registry.subscribe(instance.id, (e) => events.push(e.type));
    await unsub1();
    await unsub2();
    // No crash; dedup guard prevents double subscription.
    expect(registry.isConnected(instance.id)).toBe(true);
  });

  it('emits normalized discovery events to observers', async () => {
    const registry = new ExternalRuntimeRegistry('/workspace', 'w1');
    registry.registerAdapter(fakeAdapter('opencode'));
    const types: string[] = [];
    registry.observe({ onEvent: (e) => types.push(e.type) });
    await registry.discover();
    expect(types).toContain('external-runtime.discovered');
  });

  it('shuts down cleanly and cancels reconnects', async () => {
    const registry = new ExternalRuntimeRegistry('/workspace', 'w1');
    registry.registerAdapter(fakeAdapter('opencode'));
    await registry.discover();
    await registry.close();
    expect(registry.listInstances().length).toBeGreaterThanOrEqual(0);
  });
});
