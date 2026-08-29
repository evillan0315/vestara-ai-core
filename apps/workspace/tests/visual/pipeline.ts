/**
 * ScreenshotPipeline — composes viewport → theme → capture → compare.
 *
 * Single responsibility: given a browser, a route, a viewport, and a theme,
 * produce the ShotResult (writing current/baseline/diff images as needed).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Browser } from '@playwright/test';
import { BaselineManager, type ShotStatus } from './baselines/manager.js';
import type { Config, Theme, Viewport } from './config.js';
import { DiffGenerator } from './diff/generator.js';
import { shotKey } from './helpers/naming.js';
import type { ShotResult } from './reports/generator.js';
import type { RouteDefinition } from './routes/manifest.js';
import { PageScreenshotRunner } from './runner/page.js';
import { ThemeRunner } from './runner/theme.js';
import { ViewportRunner } from './runner/viewport.js';

export interface PipelineResult {
  result: ShotResult;
  status: ShotStatus;
}

export class ScreenshotPipeline {
  private readonly viewports: ViewportRunner;
  private readonly baselines: BaselineManager;
  private readonly diff: DiffGenerator;

  constructor(private readonly config: Config) {
    this.viewports = new ViewportRunner();
    this.baselines = new BaselineManager();
    this.diff = new DiffGenerator({
      tolerance: config.tolerance,
      maxDiffPercent: config.maxDiffPercent,
    });
  }

  async run(
    browser: Browser,
    route: RouteDefinition,
    viewport: Viewport,
    theme: Theme,
    role?: string,
  ): Promise<PipelineResult> {
    const started = Date.now();
    const themes = new ThemeRunner(this.config);
    const { context, page } = await this.viewports.open(browser, viewport);
    themes.seed(context, theme);

    let status: ShotStatus;
    let diffPercent = 0;
    let diffImage: string | undefined;
    let error: string | undefined;

    try {
      const capture = new PageScreenshotRunner(this.config);
      const png = await capture.capture(page, route, theme);
      this.baselines.writeCurrent(route, viewport, theme, png, role);

      if (this.config.mode === 'update') {
        this.baselines.writeBaseline(route, viewport, theme, png, role);
        status = 'new';
      } else if (!this.baselines.hasBaseline(route, viewport, theme, role)) {
        status = 'missing';
      } else {
        const baseline = this.baselines.readBaseline(route, viewport, theme, role) as Buffer;
        const paths = this.baselines.pathsFor(route, viewport, theme, role);
        const tmpBaseline = `${paths.current}.baseline.png`;
        fs.writeFileSync(tmpBaseline, baseline);
        const diff = this.diff.compare(tmpBaseline, paths.current, paths.diff);
        status = diff.pass ? 'pass' : 'fail';
        diffPercent = diff.diffPercent;
        diffImage = path.relative(this.config.output.reports, paths.diff).split(path.sep).join('/');
        if (!diff.pass && diff.message) error = diff.message;
      }
    } catch (err: any) {
      status = 'fail';
      error = err?.message ?? String(err);
    } finally {
      await context.close().catch(() => {});
    }

    const result: ShotResult = {
      key: shotKey(route, viewport, theme, role),
      routeId: route.id,
      routeTitle: route.title,
      viewportId: viewport.id,
      viewportName: viewport.name,
      themeId: theme.id,
      status,
      diffPercent,
      diffImage,
      durationMs: Date.now() - started,
      timestamp: new Date().toISOString(),
      error,
    };
    return { result, status };
  }
}
