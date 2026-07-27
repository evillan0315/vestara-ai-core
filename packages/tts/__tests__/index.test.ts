import { describe, expect, it } from 'vitest';

describe('@vestara/tts', () => {
  it('exports VestaraTTSService', () => {
    const mod = require('../dist/index.js');
    expect(mod.VestaraTTSService).toBeDefined();
    expect(typeof mod.VestaraTTSService).toBe('function');
  });

  it('exports PiperTTSProvider', () => {
    const mod = require('../dist/index.js');
    expect(mod.PiperTTSProvider).toBeDefined();
    expect(typeof mod.PiperTTSProvider).toBe('function');
  });

  it('TTS service starts unavailable without provider', () => {
    const mod = require('../dist/index.js');
    const svc = new mod.VestaraTTSService();
    expect(svc.status).toBe('unavailable');
  });

  it('TTS service reports provider after registration', () => {
    const mod = require('../dist/index.js');
    const svc = new mod.VestaraTTSService();
    const provider = new mod.PiperTTSProvider();
    svc.registerProvider(provider);
    expect(svc.status).toBe('degraded');
    expect(svc.providerName).toBe('Piper TTS');
  });

  it('TTS synthesize fails without provider', async () => {
    const mod = require('../dist/index.js');
    const svc = new mod.VestaraTTSService();
    await expect(svc.synthesize('hello')).rejects.toThrow('No TTS provider registered');
  });
});
