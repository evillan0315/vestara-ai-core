/**
 * @vestara/media-conference — AudioWorklet global-scope ambient declarations
 *
 * TypeScript's DOM lib covers the main-thread Web Audio API (AudioContext,
 * AudioWorkletNode) but not the AudioWorkletGlobalScope globals
 * (AudioWorkletProcessor, registerProcessor, sampleRate). This shim provides
 * the minimal structural surface used by audio-observer-processor.ts.
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-007 Audio Observation
 */

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: AudioWorkletNodeOptions);
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean | undefined;
}

declare function registerProcessor(
  name: string,
  processorCtor: new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessor,
): void;

declare const sampleRate: number;
declare const currentTime: number;
declare const currentFrame: number;
