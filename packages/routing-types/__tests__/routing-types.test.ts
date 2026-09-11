import { describe, expect, it } from 'vitest';
import type { ProviderModelRef } from '../src/index.js';
import { isRoutingCapability, modelId, providerId, ROUTING_CAPABILITIES } from '../src/index.js';

describe('RoutingCapability', () => {
  it('has exactly 14 values', () => {
    expect(ROUTING_CAPABILITIES).toHaveLength(14);
  });

  it('is closed and deterministic', () => {
    const unique = new Set(ROUTING_CAPABILITIES);
    expect(unique.size).toBe(ROUTING_CAPABILITIES.length);
  });

  it('isRoutingCapability accepts all canonical values', () => {
    for (const cap of ROUTING_CAPABILITIES) {
      expect(isRoutingCapability(cap)).toBe(true);
    }
  });

  it('isRoutingCapability rejects unknown values', () => {
    expect(isRoutingCapability('architecture-analysis')).toBe(false);
    expect(isRoutingCapability('filesystem.read')).toBe(false);
    expect(isRoutingCapability('unknown')).toBe(false);
  });

  it('does NOT overlap with AgentCapability vocabulary', () => {
    // RoutingCapability and AgentCapability are distinct concepts.
    // Verify no accidental overlap in naming.
    const agentCaps = [
      'architecture-analysis',
      'code-generation',
      'testing',
      'documentation',
      'security-analysis',
      'refactoring',
    ];
    for (const cap of agentCaps) {
      expect(isRoutingCapability(cap)).toBe(false);
    }
  });
});

describe('ProviderModelRef', () => {
  it('creates branded ProviderId', () => {
    const pid = providerId('openai');
    expect(pid).toBe('openai');
    // Brand check is compile-time only; runtime value is the string
  });

  it('creates branded ModelId', () => {
    const mid = modelId('gpt-4');
    expect(mid).toBe('gpt-4');
  });

  it('constructs a valid ProviderModelRef', () => {
    const ref: ProviderModelRef = {
      providerId: providerId('anthropic'),
      modelId: modelId('claude-3'),
    };
    expect(ref.providerId).toBe('anthropic');
    expect(ref.modelId).toBe('claude-3');
  });

  it('accepts optional modelRevision', () => {
    const ref: ProviderModelRef = {
      providerId: providerId('openai'),
      modelId: modelId('gpt-4'),
      modelRevision: '2024-01',
    };
    expect(ref.modelRevision).toBe('2024-01');
  });
});
