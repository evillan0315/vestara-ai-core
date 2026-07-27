import { describe, expect, it } from 'vitest';

describe('@vestara/stt', () => {
  it('exports VestaraSTTService', () => {
    const mod = require('../dist/index.js');
    expect(mod.VestaraSTTService).toBeDefined();
    expect(typeof mod.VestaraSTTService).toBe('function');
  });

  it('exports WhisperSTTProvider', () => {
    const mod = require('../dist/index.js');
    expect(mod.WhisperSTTProvider).toBeDefined();
    expect(typeof mod.WhisperSTTProvider).toBe('function');
  });

  it('STT service starts unavailable without provider', () => {
    const mod = require('../dist/index.js');
    const svc = new mod.VestaraSTTService();
    expect(svc.status).toBe('unavailable');
  });

  it('STT service reports provider after registration', () => {
    const mod = require('../dist/index.js');
    const svc = new mod.VestaraSTTService();
    const provider = new mod.WhisperSTTProvider();
    svc.registerProvider(provider);
    expect(svc.status).toBe('degraded');
    expect(svc.providerName).toBe('Whisper.cpp');
  });

  it('STT transcribe fails without provider', async () => {
    const mod = require('../dist/index.js');
    const svc = new mod.VestaraSTTService();
    await expect(svc.transcribe(new ArrayBuffer(0))).rejects.toThrow('No STT provider registered');
  });
});
