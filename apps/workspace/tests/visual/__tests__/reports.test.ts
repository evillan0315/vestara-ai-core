// @vitest-environment node
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ShotResult } from '../reports/generator';
import { ReportGenerator, summarize } from '../reports/generator';

let tmp: string | null = null;

function withRoot(fn: (root: string) => void): void {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'report-'));
  const prev = process.env.SCREENSHOT_ROOT;
  process.env.SCREENSHOT_ROOT = tmp;
  try {
    fn(tmp);
  } finally {
    if (prev === undefined) delete process.env.SCREENSHOT_ROOT;
    else process.env.SCREENSHOT_ROOT = prev;
  }
}

afterEach(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  tmp = null;
});

const results: ShotResult[] = [
  {
    key: 'a',
    routeId: 'dashboard',
    routeTitle: 'Dashboard',
    viewportId: 'desktop-1920',
    viewportName: 'Desktop',
    themeId: 'dark',
    status: 'pass',
    diffPercent: 0,
    durationMs: 100,
    timestamp: '2026-01-01T00:00:00Z',
  },
  {
    key: 'b',
    routeId: 'dashboard',
    routeTitle: 'Dashboard',
    viewportId: 'mobile-iphone-15',
    viewportName: 'iPhone 15',
    themeId: 'dark',
    status: 'fail',
    diffPercent: 3.2,
    durationMs: 120,
    timestamp: '2026-01-01T00:00:01Z',
  },
  {
    key: 'c',
    routeId: 'settings',
    routeTitle: 'Settings',
    viewportId: 'desktop-1920',
    viewportName: 'Desktop',
    themeId: 'dark',
    status: 'missing',
    diffPercent: 0,
    durationMs: 90,
    timestamp: '2026-01-01T00:00:02Z',
  },
  {
    key: 'd',
    routeId: 'graph',
    routeTitle: 'Graph',
    viewportId: 'desktop-1920',
    viewportName: 'Desktop',
    themeId: 'light',
    status: 'new',
    diffPercent: 0,
    durationMs: 80,
    timestamp: '2026-01-01T00:00:03Z',
  },
];

describe('summarize', () => {
  it('computes totals, failures, and pass rate', () => {
    const s = summarize(results);
    expect(s.total).toBe(4);
    expect(s.passed).toBe(1);
    expect(s.failed).toBe(1);
    expect(s.missing).toBe(1);
    expect(s.fresh).toBe(1);
    expect(s.passRate).toBe(25);
  });
});

describe('ReportGenerator', () => {
  it('writes JSON, Markdown, and HTML reports', () => {
    withRoot(() => {
      const generator = new ReportGenerator();
      const files = generator.generate(results);
      for (const file of [files.json, files.markdown, files.html]) {
        expect(fs.existsSync(file)).toBe(true);
      }
      const payload = JSON.parse(fs.readFileSync(files.json, 'utf8'));
      expect(payload.summary.total).toBe(4);
      expect(payload.results).toHaveLength(4);
    });
  });

  it('renders a markdown summary grouped by viewport', () => {
    withRoot(() => {
      const generator = new ReportGenerator();
      const files = generator.generate(results);
      const md = fs.readFileSync(files.markdown, 'utf8');
      expect(md).toContain('# Visual Regression Report');
      expect(md).toContain('✔ Dashboard');
      expect(md).toContain('✖ Dashboard');
      expect(md.toLowerCase()).toContain('mobile');
    });
  });

  it('embeds diff images in the HTML report', () => {
    withRoot(() => {
      const withDiff: ShotResult[] = [{ ...results[1], diffImage: '../diff/x.png' }];
      const generator = new ReportGenerator();
      const files = generator.generate(withDiff);
      const html = fs.readFileSync(files.html, 'utf8');
      expect(html).toContain('x.png');
    });
  });
});
