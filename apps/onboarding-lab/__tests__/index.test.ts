import { describe, expect, it } from 'vitest';

describe('@vestara/onboarding-lab', () => {
  it('module loads without error', () => {
    expect(() => require('../dist/index.js')).not.toThrow();
  });

  it('module has expected structure', () => {
    const mod = require('../dist/index.js');
    expect(mod).toBeDefined();
    expect(typeof mod).toBe('object');
  });

  it('can import dependencies', async () => {
    const dep = await import('@vestara/conversation-runtime');
    expect(dep).toBeDefined();
    expect(dep.DefaultConversationEngine).toBeDefined();
  });

  it('can import audio dependencies', async () => {
    const dep = await import('@vestara/audio');
    expect(dep.VestaraAudioService).toBeDefined();
    expect(dep.DefaultMicrophoneProvider).toBeDefined();
  });

  it('can import provider dependencies', async () => {
    const dep = await import('@vestara/conversation-runtime');
    expect(dep.LocalProvider).toBeDefined();
    expect(dep.OpenCodeCloudProvider).toBeDefined();
  });
});
