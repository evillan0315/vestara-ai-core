/**
 * ReportGenerator — HTML dashboard + JSON + Markdown summaries.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ShotStatus } from '../baselines/manager.js';
import { outputLayout } from '../config.js';

export interface ShotResult {
  key: string;
  routeId: string;
  routeTitle: string;
  viewportId: string;
  viewportName: string;
  themeId: string;
  status: ShotStatus;
  diffPercent: number;
  diffImage?: string;
  durationMs: number;
  timestamp: string;
  error?: string;
}

export interface ReportSummary {
  total: number;
  passed: number;
  failed: number;
  missing: number;
  fresh: number;
  passRate: number;
  durationMs: number;
  startedAt: string;
  finishedAt: string;
}

export function summarize(results: ShotResult[]): ReportSummary {
  const total = results.length;
  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const missing = results.filter((r) => r.status === 'missing').length;
  const fresh = results.filter((r) => r.status === 'new').length;
  const durationMs = results.reduce((a, r) => a + r.durationMs, 0);
  return {
    total,
    passed,
    failed,
    missing,
    fresh,
    passRate: total > 0 ? Math.round((passed / total) * 1000) / 10 : 0,
    durationMs,
    startedAt: results[0]?.timestamp ?? new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  };
}

const GROUP_ORDER = ['desktop', 'tablet', 'mobile'];

function groupOf(viewportId: string): string {
  if (viewportId.startsWith('mobile')) return 'mobile';
  if (viewportId.startsWith('tablet')) return 'tablet';
  return 'desktop';
}

export class ReportGenerator {
  private readonly layout = outputLayout();

  constructor() {
    fs.mkdirSync(this.layout.reports, { recursive: true });
  }

  generate(results: ShotResult[]): { json: string; markdown: string; html: string } {
    const summary = summarize(results);
    const jsonFile = path.join(this.layout.reports, 'visual-regression.json');
    const mdFile = path.join(this.layout.reports, 'visual-regression.md');
    const htmlFile = path.join(this.layout.reports, 'index.html');

    const payload = { summary, results, mode: process.env.SCREENSHOT_MODE ?? 'compare' };
    fs.writeFileSync(jsonFile, JSON.stringify(payload, null, 2));

    const markdown = this.renderMarkdown(summary, results);
    fs.writeFileSync(mdFile, markdown);

    const html = this.renderHtml(summary, results);
    fs.writeFileSync(htmlFile, html);

    return { json: jsonFile, markdown: mdFile, html: htmlFile };
  }

  private renderMarkdown(summary: ReportSummary, results: ShotResult[]): string {
    const lines: string[] = [
      '# Visual Regression Report',
      '',
      `**${summary.passed}/${summary.total} passing** · pass rate ${summary.passRate}% · ` +
        `${summary.failed} failed · ${summary.missing} missing baselines · ${summary.fresh} new`,
      '',
      `Duration: ${(summary.durationMs / 1000).toFixed(1)}s · ${summary.startedAt} → ${summary.finishedAt}`,
      '',
    ];

    for (const group of GROUP_ORDER) {
      const inGroup = results.filter((r) => groupOf(r.viewportId) === group);
      if (inGroup.length === 0) continue;
      lines.push(`## ${group[0].toUpperCase()}${group.slice(1)}`, '');
      for (const r of inGroup) {
        const icon = r.status === 'pass' ? '✔' : r.status === 'fail' ? '✖' : r.status === 'missing' ? '•' : '★';
        const detail = r.status === 'fail' ? ` (${r.diffPercent}% diff)` : r.error ? ` (${r.error})` : '';
        lines.push(`${icon} ${r.routeTitle} — ${r.viewportName}/${r.themeId}${detail}`);
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  private renderHtml(summary: ReportSummary, results: ShotResult[]): string {
    const rows = results
      .map((r) => {
        const badge =
          r.status === 'pass'
            ? '<span class="badge pass">pass</span>'
            : r.status === 'fail'
              ? `<span class="badge fail">fail ${r.diffPercent}%</span>`
              : r.status === 'missing'
                ? '<span class="badge warn">missing baseline</span>'
                : '<span class="badge new">new</span>';
        const diff = r.diffImage
          ? `<a href="../${r.diffImage}" target="_blank"><img class="diff" src="../${r.diffImage}" alt="diff"/></a>`
          : '';
        return `<tr>
          <td>${r.routeTitle}</td>
          <td>${r.viewportName}</td>
          <td>${r.themeId}</td>
          <td>${badge}</td>
          <td>${r.diffPercent.toFixed(2)}%</td>
          <td>${(r.durationMs / 1000).toFixed(2)}s</td>
          <td>${diff}${r.error ? `<div class="err">${r.error}</div>` : ''}</td>
        </tr>`;
      })
      .join('');

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Vestara Visual Regression Report</title>
<style>
  :root { color-scheme: dark; }
  body { font-family: ui-sans-serif, system-ui, sans-serif; background: #0b0b0d; color: #d4d4d8; margin: 0; padding: 2rem; }
  h1 { font-size: 1.4rem; margin: 0 0 .5rem; }
  .cards { display: flex; gap: 1rem; flex-wrap: wrap; margin: 1rem 0 2rem; }
  .card { background: #18181b; border: 1px solid #27272a; border-radius: 8px; padding: .75rem 1.25rem; }
  .card b { font-size: 1.5rem; display: block; }
  table { width: 100%; border-collapse: collapse; font-size: .82rem; }
  th, td { text-align: left; padding: .45rem .6rem; border-bottom: 1px solid #27272a; vertical-align: middle; }
  th { color: #71717a; font-size: .68rem; text-transform: uppercase; letter-spacing: .05em; }
  .badge { padding: .1rem .45rem; border-radius: 999px; font-size: .68rem; text-transform: uppercase; }
  .pass { background: rgba(74,222,128,.15); color: #4ade80; }
  .fail { background: rgba(248,113,113,.15); color: #f87171; }
  .warn { background: rgba(245,158,11,.15); color: #f59e0b; }
  .new { background: rgba(167,139,250,.15); color: #a78bfa; }
  .diff { max-width: 140px; max-height: 80px; border-radius: 4px; border: 1px solid #3f3f46; }
  .err { color: #f87171; font-size: .7rem; margin-top: .25rem; }
</style>
</head>
<body>
<h1>Vestara Visual Regression Report</h1>
<div class="cards">
  <div class="card"><b>${summary.passRate}%</b>pass rate</div>
  <div class="card"><b>${summary.passed}/${summary.total}</b>passing</div>
  <div class="card"><b>${summary.failed}</b>failed</div>
  <div class="card"><b>${summary.missing}</b>missing baselines</div>
  <div class="card"><b>${summary.fresh}</b>new captures</div>
  <div class="card"><b>${(summary.durationMs / 1000).toFixed(1)}s</b>duration</div>
</div>
<table>
  <thead><tr><th>Page</th><th>Viewport</th><th>Theme</th><th>Status</th><th>Diff</th><th>Time</th><th>Preview</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</body>
</html>`;
  }
}
