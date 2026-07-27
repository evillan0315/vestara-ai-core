import { describe, expect, it } from 'vitest';

describe('@vestara/audio', () => {
  it('exports VestaraAudioService', () => {
    const mod = require('../dist/index.js');
    expect(mod.VestaraAudioService).toBeDefined();
    expect(typeof mod.VestaraAudioService).toBe('function');
  });

  it('exports DefaultMicrophoneProvider', () => {
    const mod = require('../dist/index.js');
    expect(mod.DefaultMicrophoneProvider).toBeDefined();
    expect(typeof mod.DefaultMicrophoneProvider).toBe('function');
  });

  it('exports DefaultSpeakerProvider', () => {
    const mod = require('../dist/index.js');
    expect(mod.DefaultSpeakerProvider).toBeDefined();
    expect(typeof mod.DefaultSpeakerProvider).toBe('function');
  });

  it('exports SileroVADProvider', () => {
    const mod = require('../dist/index.js');
    expect(mod.SileroVADProvider).toBeDefined();
    expect(typeof mod.SileroVADProvider).toBe('function');
  });

  it('MicrophoneProvider reports health', async () => {
    const mod = require('../dist/index.js');
    const mic = new mod.DefaultMicrophoneProvider();
    const health = await mic.healthCheck();
    expect(health).toHaveProperty('status');
    expect(health).toHaveProperty('latency');
  });

  it('SpeakerProvider reports health', async () => {
    const mod = require('../dist/index.js');
    const speaker = new mod.DefaultSpeakerProvider();
    const health = await speaker.healthCheck();
    expect(health).toHaveProperty('status');
    expect(health).toHaveProperty('latency');
  });

  it('SileroVADProvider manages listening state', async () => {
    const mod = require('../dist/index.js');
    const vad = new mod.SileroVADProvider();
    expect(vad.status).toBe('idle');

    await vad.startListening();
    expect(vad.status).toBe('listening');

    await vad.stopListening();
    expect(vad.status).toBe('idle');
  });

  it('VestaraAudioService diagnose works without providers', async () => {
    const mod = require('../dist/index.js');
    const svc = new mod.VestaraAudioService();
    const diag = await svc.diagnose();
    expect(diag).toHaveProperty('microphone');
    expect(diag).toHaveProperty('speakers');
    expect(diag).toHaveProperty('vad');
    expect(diag).toHaveProperty('stt');
    expect(diag).toHaveProperty('tts');
  });

  it('VestaraAudioService startCapture fails without mic', async () => {
    const mod = require('../dist/index.js');
    const svc = new mod.VestaraAudioService();
    await expect(svc.startCapture()).rejects.toThrow('No microphone provider registered');
  });
});
