/**
 * @vestara/media-conference — AudioObserver Processor
 *
 * AudioWorkletProcessor that extracts PCM audio frames from an
 * incoming MediaStream's audio track and posts them to the
 * main thread via MessagePort.
 *
 * This processor is non-destructive: it taps into the audio stream
 * without consuming it. The default playback path is unaffected.
 *
 * Message protocol:
 *   main → processor: { type: 'start' } (implicit on creation)
 *   processor → main: { type: 'frame', data: Float32Array, sampleRate: number, channels: number, peak: number }
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-007 Audio Observation
 */

class VestaraAudioObserverProcessor extends AudioWorkletProcessor {
  private _running = true;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent) => {
      if (event.data?.type === 'stop') {
        this._running = false;
      }
    };
  }

  process(inputs: Float32Array[][]): boolean {
    if (!this._running) return false;

    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channelData = input[0]; // mono — channel 0
    if (!channelData || channelData.length === 0) return true;

    // Compute peak amplitude
    let peak = 0;
    for (let i = 0; i < channelData.length; i++) {
      const abs = Math.abs(channelData[i]);
      if (abs > peak) peak = abs;
    }

    // Copy channel data to avoid retention of the AudioWorklet buffer
    const data = new Float32Array(channelData.length);
    data.set(channelData);

    // Post frame to main thread
    this.port.postMessage({
      type: 'frame',
      data,
      sampleRate: sampleRate, // global AudioWorklet sampleRate
      channels: input.length,
      peak,
    });

    return true; // keep processor alive
  }
}

registerProcessor('vestara-audio-observer', VestaraAudioObserverProcessor);
