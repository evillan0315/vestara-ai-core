import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ContentAddressedEvidenceStore } from '@vestara/engineering-event-store';
import { PNG } from 'pngjs';
import { afterEach, describe, expect, it } from 'vitest';
import { BaselineStore } from '../src/baseline-store';
import { VisualComparisonEngine } from '../src/visual';
import { type ScreenshotSource, VisualEvidenceCollector } from '../src/visual-collector';

const directories: string[] = [];

function tmpdir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  directories.push(dir);
  return dir;
}

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function solidPng(width: number, height: number, rgba: [number, number, number, number]): Uint8Array {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i += 1) {
    png.data[i * 4] = rgba[0];
    png.data[i * 4 + 1] = rgba[1];
    png.data[i * 4 + 2] = rgba[2];
    png.data[i * 4 + 3] = rgba[3];
  }
  return PNG.sync.write(png);
}

function sourceReturning(image: Uint8Array): ScreenshotSource {
  return {
    name: 'mock-browser',
    captureScreenshot: async () => image,
  };
}

describe('VisualComparisonEngine (PCS-026 §9)', () => {
  it('reports identical screenshots as equal', () => {
    const image = solidPng(4, 4, [10, 20, 30, 255]);
    const engine = new VisualComparisonEngine();
    const result = engine.compare(image, image);
    expect(result.equal).toBe(true);
    expect(result.diffRatio).toBe(0);
    expect(result.withinTolerance).toBe(true);
  });

  it('reports a diff ratio and tolerance for differing screenshots', () => {
    const engine = new VisualComparisonEngine();
    const a = solidPng(4, 4, [10, 20, 30, 255]);
    const b = solidPng(4, 4, [255, 20, 30, 255]);
    const result = engine.compare(a, b);
    expect(result.equal).toBe(false);
    expect(result.diffRatio).toBe(1);
    expect(result.withinTolerance).toBe(false);
    // A small channel change stays within a loose tolerance.
    const close = solidPng(4, 4, [12, 20, 30, 255]);
    expect(engine.compare(a, close, { tolerance: 0.05, channelThreshold: 10 }).withinTolerance).toBe(true);
  });

  it('produces a diff-mask PNG', () => {
    const engine = new VisualComparisonEngine();
    const a = solidPng(4, 4, [10, 20, 30, 255]);
    const b = solidPng(4, 4, [255, 20, 30, 255]);
    const mask = engine.diffMask(a, b);
    const decoded = PNG.sync.read(Buffer.from(mask));
    expect(decoded.width).toBe(4);
    expect(decoded.height).toBe(4);
    // All pixels are diffed → all red + opaque.
    expect(decoded.data[0]).toBe(255);
    expect(decoded.data[3]).toBe(255);
  });
});

describe('BaselineStore governance', () => {
  it('records candidates and only promotes through approve', () => {
    const store = new BaselineStore(tmpdir('baselines-'));
    const key = '/dashboard@1280x800@dark';
    store.recordCandidate(key, 'candidate-digest');
    expect(store.get(key)?.status).toBe('missing');

    store.approve(key, 'approved-digest', 'human-reviewer');
    const approved = store.get(key);
    expect(approved?.status).toBe('approved');
    expect(approved?.artifactDigest).toBe('approved-digest');
    expect(approved?.approvedBy).toBe('human-reviewer');
  });

  it('retains a rejected candidate without promoting it', () => {
    const store = new BaselineStore(tmpdir('baselines-reject-'));
    const key = '/ops@auto@dark';
    store.recordCandidate(key, 'cand-1');
    store.reject(key, 'human-reviewer');
    const record = store.get(key);
    expect(record?.status).toBe('rejected');
    expect(record?.artifactDigest).toBe('');
    expect(record?.candidateDigest).toBe('cand-1');
  });
});

describe('VisualEvidenceCollector', () => {
  it('records a needs-review candidate when no baseline exists', async () => {
    const root = tmpdir('visual-');
    const artifacts = new ContentAddressedEvidenceStore(path.join(root, 'artifacts'));
    const baselines = new BaselineStore(path.join(root, 'baselines'));
    const image = solidPng(4, 4, [10, 20, 30, 255]);
    const collector = new VisualEvidenceCollector({
      source: sourceReturning(image),
      baselines,
      artifacts,
      scenario: { url: '/dashboard', viewport: { width: 1280, height: 800 }, theme: 'dark' },
    });

    const { items } = await collector.collect({
      executionId: 'exec-1',
      workspaceRoot: root,
    });
    expect(items.map((item) => item.kind).sort()).toEqual(['screenshot', 'visual-comparison']);
    const comparison = JSON.parse(String(items[1].content)) as { status: string; reason: string };
    expect(comparison.status).toBe('needs-review');
    expect(comparison.reason).toContain('human review');
    expect(baselines.get('/dashboard@1280x800@dark')?.status).toBe('missing');
  });

  it('compares against an approved baseline and reports pass/fail', async () => {
    const root = tmpdir('visual-pass-');
    const artifacts = new ContentAddressedEvidenceStore(path.join(root, 'artifacts'));
    const baselines = new BaselineStore(path.join(root, 'baselines'));
    const key = '/dashboard@1280x800@dark';

    // Baseline capture → content-address → approve.
    const baselineImage = solidPng(4, 4, [10, 20, 30, 255]);
    const baselineRef = artifacts.put({
      content: baselineImage,
      mediaType: 'image/png',
      kind: 'screenshot',
      summary: 'baseline',
    });
    baselines.approve(key, baselineRef.digest, 'human-reviewer');

    // Identical capture → pass.
    const passing = new VisualEvidenceCollector({
      source: sourceReturning(baselineImage),
      baselines,
      artifacts,
      scenario: { url: '/dashboard', viewport: { width: 1280, height: 800 }, theme: 'dark' },
    });
    let items = (await passing.collect({ executionId: 'exec-2', workspaceRoot: root })).items;
    let comparison = JSON.parse(String(items[1].content)) as { status: string };
    expect(comparison.status).toBe('pass');

    // Changed capture → fail.
    const failing = new VisualEvidenceCollector({
      source: sourceReturning(solidPng(4, 4, [255, 20, 30, 255])),
      baselines,
      artifacts,
      scenario: { url: '/dashboard', viewport: { width: 1280, height: 800 }, theme: 'dark' },
    });
    items = (await failing.collect({ executionId: 'exec-3', workspaceRoot: root })).items;
    comparison = JSON.parse(String(items[1].content)) as { status: string };
    expect(comparison.status).toBe('fail');
  });
});
