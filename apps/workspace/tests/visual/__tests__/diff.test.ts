// @vitest-environment node
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PNG } from 'pngjs';
import { afterEach, describe, expect, it } from 'vitest';
import { DiffGenerator } from '../diff/generator';

let tmp: string;

function makePng(width: number, height: number, fill: (x: number, y: number) => number): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const v = fill(x, y);
      const idx = (width * y + x) << 2;
      png.data[idx] = v;
      png.data[idx + 1] = v;
      png.data[idx + 2] = v;
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

function dir(): string {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-'));
  return tmp;
}

afterEach(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

describe('DiffGenerator', () => {
  it('passes identical images with 0% diff', () => {
    const d = dir();
    const a = path.join(d, 'a.png');
    const c = path.join(d, 'c.png');
    const diff = path.join(d, 'diff.png');
    fs.writeFileSync(
      a,
      makePng(20, 20, () => 128),
    );
    fs.writeFileSync(
      c,
      makePng(20, 20, () => 128),
    );
    const result = new DiffGenerator().compare(a, c, diff);
    expect(result.pass).toBe(true);
    expect(result.diffPercent).toBe(0);
    expect(result.sameDimensions).toBe(true);
    expect(fs.existsSync(diff)).toBe(true);
  });

  it('detects a single-pixel change', () => {
    const d = dir();
    const a = path.join(d, 'a.png');
    const c = path.join(d, 'c.png');
    const diff = path.join(d, 'diff.png');
    fs.writeFileSync(
      a,
      makePng(10, 10, () => 0),
    );
    fs.writeFileSync(
      c,
      makePng(10, 10, (x, y) => (x === 0 && y === 0 ? 255 : 0)),
    );
    const result = new DiffGenerator({ tolerance: 0.1, maxDiffPercent: 2 }).compare(a, c, diff);
    expect(result.pass).toBe(true); // 1/100 = 1% < 2% tolerance
    expect(result.diffPixels).toBe(1);
    expect(result.diffPercent).toBeGreaterThan(0);
  });

  it('fails when diff exceeds maxDiffPercent', () => {
    const d = dir();
    const a = path.join(d, 'a.png');
    const c = path.join(d, 'c.png');
    const diff = path.join(d, 'diff.png');
    fs.writeFileSync(
      a,
      makePng(10, 10, () => 0),
    );
    fs.writeFileSync(
      c,
      makePng(10, 10, (x) => (x < 5 ? 255 : 0)),
    );
    const result = new DiffGenerator({ tolerance: 0.1, maxDiffPercent: 1 }).compare(a, c, diff);
    expect(result.pass).toBe(false);
    expect(result.diffPercent).toBe(50);
  });

  it('flags dimension mismatches as hard failures', () => {
    const d = dir();
    const a = path.join(d, 'a.png');
    const c = path.join(d, 'c.png');
    const diff = path.join(d, 'diff.png');
    fs.writeFileSync(
      a,
      makePng(10, 10, () => 0),
    );
    fs.writeFileSync(
      c,
      makePng(20, 20, () => 0),
    );
    const result = new DiffGenerator().compare(a, c, diff);
    expect(result.pass).toBe(false);
    expect(result.sameDimensions).toBe(false);
    expect(result.message).toContain('dimension mismatch');
  });

  it('reports missing files', () => {
    const result = new DiffGenerator().compare('/nope/a.png', '/nope/c.png', '/nope/d.png');
    expect(result.pass).toBe(false);
    expect(result.message).toContain('missing');
  });
});
