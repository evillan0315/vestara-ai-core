/**
 * VisualTestEngine — top-level orchestration.
 *
 * Generates the flat list of test cases (route × viewport × theme), executes a
 * case against a browser via the ScreenshotPipeline, records results per
 * worker, and produces reports. Kept free of @playwright/test imports so the
 * case generation and reporting logic is unit-testable.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Browser } from '@playwright/test';
import { roleById } from './auth/roles.js';
import type { Config, Theme, Viewport } from './config.js';
import { outputLayout } from './config.js';
import { ScreenshotPipeline } from './pipeline.js';
import { ReportGenerator, type ShotResult, summarize } from './reports/generator.js';
import { discoverRoutes, RouteDiscovery } from './routes/discovery.js';
import type { RouteDefinition } from './routes/manifest.js';
import { ThemeRunner } from './runner/theme.js';

export interface TestCase {
  title: string;
  route: RouteDefinition;
  viewport: Viewport;
  theme: Theme;
  role: string;
}

export class VisualTestEngine {
  private readonly pipeline: ScreenshotPipeline;
  private readonly report: ReportGenerator;
  private readonly layout = outputLayout();
  private readonly runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  constructor(
    private readonly config: Config,
    private readonly discovery: RouteDiscovery = new RouteDiscovery(),
  ) {
    this.pipeline = new ScreenshotPipeline(config);
    this.report = new ReportGenerator();
  }

  /** All (route × viewport × theme) test cases for this run. */
  cases(): TestCase[] {
    const routes = this.discovery.discover();
    const themes = new ThemeRunner(this.config).selected();
    const role = this.config.role;
    const out: TestCase[] = [];
    for (const route of routes) {
      for (const viewport of this.config.viewports) {
        for (const theme of themes) {
          out.push({
            title: `${route.title}.${viewport.id}.${theme.id}`,
            route,
            viewport,
            theme,
            role,
          });
        }
      }
    }
    return out;
  }

  /** Execute one case and persist its result. */
  async execute(browser: Browser, testCase: TestCase): Promise<ShotResult> {
    const { result } = await this.pipeline.run(
      browser,
      testCase.route,
      testCase.viewport,
      testCase.theme,
      testCase.role,
    );
    this.record(result);
    return result;
  }

  /** Persist a result for the global teardown to aggregate. */
  record(result: ShotResult): void {
    const dir = path.join(this.layout.results, this.runId);
    fs.mkdirSync(dir, { recursive: true });
    const name = `${result.key.replace(/[^a-zA-Z0-9._-]+/g, '-')}.json`;
    fs.writeFileSync(path.join(dir, name), JSON.stringify(result, null, 2));
  }

  /** Load every recorded result from disk. */
  loadResults(): ShotResult[] {
    const out: ShotResult[] = [];
    const root = this.layout.results;
    if (!fs.existsSync(root)) return out;
    for (const runDir of fs.readdirSync(root)) {
      const dir = path.join(root, runDir);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.json')) continue;
        try {
          out.push(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
        } catch {
          /* skip malformed */
        }
      }
    }
    return out;
  }

  /** Write HTML/JSON/Markdown reports from recorded results. */
  writeReport(results: ShotResult[]): void {
    this.report.generate(results);
  }

  summary(results: ShotResult[]) {
    return summarize(results);
  }
}

export type { RouteDefinition };
export { discoverRoutes, RouteDiscovery, roleById };
