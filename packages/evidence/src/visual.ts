/**
 * PCS-026 §9 — visual comparison (pixel diff) with tolerance.
 *
 * Pure-JS PNG decoding via pngjs; compares RGBA pixels within a channel
 * tolerance and reports a diff ratio against a configured threshold.
 */

import { PNG } from 'pngjs';

export interface VisualComparisonOptions {
  /** Max diff ratio before the comparison fails (default 0.001 = 0.1%). */
  readonly tolerance?: number;
  /** Per-channel difference threshold before a pixel counts as changed (default 10). */
  readonly channelThreshold?: number;
}

export interface VisualComparisonResult {
  readonly width: number;
  readonly height: number;
  readonly diffPixels: number;
  readonly totalPixels: number;
  readonly diffRatio: number;
  readonly equal: boolean;
  readonly withinTolerance: boolean;
  readonly tolerance: number;
}

export class VisualComparisonEngine {
  compare(actual: Uint8Array, baseline: Uint8Array, options: VisualComparisonOptions = {}): VisualComparisonResult {
    const left = PNG.sync.read(Buffer.from(actual));
    const right = PNG.sync.read(Buffer.from(baseline));
    const tolerance = options.tolerance ?? 0.001;
    const channelThreshold = options.channelThreshold ?? 10;

    const width = Math.min(left.width, right.width);
    const height = Math.min(left.height, right.height);
    let diffPixels = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        if (channelsDiffer(left.data, right.data, index, channelThreshold)) diffPixels += 1;
      }
    }
    const totalPixels = width * height;
    const diffRatio = totalPixels > 0 ? diffPixels / totalPixels : 0;
    return {
      width,
      height,
      diffPixels,
      totalPixels,
      diffRatio: Math.round(diffRatio * 1_000_000) / 1_000_000,
      equal: diffPixels === 0,
      withinTolerance: diffRatio <= tolerance,
      tolerance,
    };
  }

  /** Produce a diff-mask PNG (changed pixels red, unchanged transparent). */
  diffMask(actual: Uint8Array, baseline: Uint8Array, options: VisualComparisonOptions = {}): Uint8Array {
    const left = PNG.sync.read(Buffer.from(actual));
    const right = PNG.sync.read(Buffer.from(baseline));
    const channelThreshold = options.channelThreshold ?? 10;
    const width = Math.min(left.width, right.width);
    const height = Math.min(left.height, right.height);
    const mask = new PNG({ width, height });
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const changed = channelsDiffer(left.data, right.data, index, channelThreshold);
        mask.data[index] = changed ? 255 : 0;
        mask.data[index + 1] = 0;
        mask.data[index + 2] = changed ? 0 : 0;
        mask.data[index + 3] = changed ? 255 : 0;
      }
    }
    return PNG.sync.write(mask);
  }
}

function channelsDiffer(left: Buffer, right: Buffer, index: number, threshold: number): boolean {
  for (let channel = 0; channel < 4; channel += 1) {
    if (Math.abs(left[index + channel] - right[index + channel]) > threshold) return true;
  }
  return false;
}
