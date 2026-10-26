import { describe, expect, it } from 'vitest';
import { ContextIntelligenceEngine } from '../src/engine';

describe('ContextIntelligenceEngine contract', () => {
  it('returns empty retrieval when no sources are registered', async () => {
    const engine = new ContextIntelligenceEngine();
    const result = await engine.retrieveContext({ query: 'deploy checklist' });
    expect(result.sourcesQueried).toEqual([]);
    expect(result.results).toEqual([]);
  });

  it('fans out to registered adapters and assembles within budget', async () => {
    const engine = new ContextIntelligenceEngine({ budget: { totalTokens: 100 } });
    engine.registerSource({
      sourceType: 'memory',
      retrieve: async () => [{ content: 'dark mode', tokens: 3 }],
    } as never);
    const result = await engine.retrieveContext({ query: 'preferences' });
    expect(result.sourcesQueried).toContain('memory');
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.totalTokens).toBeLessThanOrEqual(100);
    engine.unregisterSource('memory');
    const after = await engine.retrieveContext({ query: 'preferences' });
    expect(after.sourcesQueried).toEqual([]);
  });
});
