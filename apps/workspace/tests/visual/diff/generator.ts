/**
 * DiffGenerator — pixel-level screenshot comparison.
 *
 * Uses pixelmatch + pngjs. Produces a diff image, the raw diff pixel count,
 * and a percentage. Dimension mismatches are reported as hard failures.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export interface DiffResult {
  diffPixels: number;
  diffPercent: number;
  pass: boolean;
  sameDimensions: boolean;
  message?: string;
}

export interface DiffOptions {
  /** pixelmatch threshold 0..1 (per-pixel). */
  tolerance?: number;
  /** Maximum acceptable diff percentage before the shot fails. */
  maxDiffPercent?: number;
}

export class DiffGenerator {
  constructor(private readonly options: DiffOptions = {}) {}

  private decode(file: string): PNG {
    const png = PNG.sync.read(fs.readFileSync(file));
    return png;
  }

  /**
   * Compare a baseline image against a current image, writing the diff image.
   * Returns pass/fail and the diff percentage.
   */
  compare(baselineFile: string, currentFile: string, diffFile: string): DiffResult {
    if (!fs.existsSync(baselineFile) || !fs.existsSync(currentFile)) {
      return {
        diffPixels: 0,
        diffPercent: 0,
        pass: false,
        sameDimensions: false,
        message: 'baseline or current image missing',
      };
    }

    const baseline = this.decode(baselineFile);
    const current = this.decode(currentFile);

    if (baseline.width !== current.width || baseline.height !== current.height) {
      return {
        diffPixels: 0,
        diffPercent: 0,
        pass: false,
        sameDimensions: false,
        message: `dimension mismatch: baseline ${baseline.width}x${baseline.height}, current ${current.width}x${current.height}`,
      };
    }

    const diff = new PNG({ width: baseline.width, height: baseline.height });
    const diffPixels = pixelmatch(baseline.data, current.data, diff.data, baseline.width, baseline.height, {
      threshold: this.options.tolerance ?? 0.1,
      includeAA: true,
    });

    fs.mkdirSync(path.dirname(diffFile), { recursive: true });
    fs.writeFileSync(diffFile, PNG.sync.write(diff));

    const totalPixels = baseline.width * baseline.height;
    const diffPercent = totalPixels > 0 ? (diffPixels / totalPixels) * 100 : 0;
    const pass = diffPercent <= (this.options.maxDiffPercent ?? 0.5);

    return { diffPixels, diffPercent: Number(diffPercent.toFixed(3)), pass, sameDimensions: true };
  }
}
