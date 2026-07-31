/**
 * BaselineManager — locates baseline / current / diff files and detects
 * missing baselines and brand-new captures.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Theme, Viewport } from '../config.js';
import { outputLayout } from '../config.js';
import { baselineName } from '../helpers/naming.js';
import type { RouteDefinition } from '../routes/manifest.js';

export type ShotStatus = 'pass' | 'fail' | 'missing' | 'new';

export interface ShotPaths {
  baseline: string;
  current: string;
  diff: string;
}

export class BaselineManager {
  private readonly layout = outputLayout();

  constructor() {
    for (const dir of [this.layout.baselines, this.layout.current, this.layout.diff, this.layout.results]) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  pathsFor(route: RouteDefinition, viewport: Viewport, theme: Theme, role?: string): ShotPaths {
    const name = baselineName(route, viewport, theme, { role });
    return {
      baseline: path.join(this.layout.baselines, name),
      current: path.join(this.layout.current, name),
      diff: path.join(this.layout.diff, name),
    };
  }

  hasBaseline(route: RouteDefinition, viewport: Viewport, theme: Theme, role?: string): boolean {
    return fs.existsSync(this.pathsFor(route, viewport, theme, role).baseline);
  }

  writeBaseline(route: RouteDefinition, viewport: Viewport, theme: Theme, png: Buffer, role?: string): string {
    const file = this.pathsFor(route, viewport, theme, role).baseline;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, png);
    return file;
  }

  writeCurrent(route: RouteDefinition, viewport: Viewport, theme: Theme, png: Buffer, role?: string): string {
    const file = this.pathsFor(route, viewport, theme, role).current;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, png);
    return file;
  }

  readBaseline(route: RouteDefinition, viewport: Viewport, theme: Theme, role?: string): Buffer | null {
    const file = this.pathsFor(route, viewport, theme, role).baseline;
    try {
      return fs.readFileSync(file);
    } catch {
      return null;
    }
  }

  /** List baseline files (for reports / stats). */
  listBaselines(): string[] {
    return fs.readdirSync(this.layout.baselines).filter((f) => f.endsWith('.png'));
  }

  /** Count of existing baselines. */
  baselineCount(): number {
    return this.listBaselines().length;
  }
}
