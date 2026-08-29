// OpenTUI adapter for the Vestara TUI renderer contract.
// This package is the ONLY place in the TUI stack that imports OpenTUI's React
// binding. Feature code consumes the contract + hooks exported from here.

import { type CliRenderer, createCliRenderer } from '@opentui/core';
import { createRoot, type Root } from '@opentui/react';
import type { ReactNode } from 'react';
import type { TerminalCapabilities, TerminalViewport, TuiRenderer, TuiRenderOptions } from './contract.js';

export interface OpenTuiRendererOptions {
  readonly targetFps?: number;
  readonly exitOnCtrlC?: boolean;
  readonly useMouse?: boolean;
  readonly useKittyKeyboard?: boolean;
  /** Pre-created CliRenderer (e.g. from @opentui/core/testing). */
  readonly renderer?: CliRenderer;
}

export class OpenTuiRenderer implements TuiRenderer {
  private renderer: CliRenderer | null = null;
  private root: Root | null = null;
  private viewport: TerminalViewport = { columns: 80, rows: 24 };
  private resizeListeners = new Set<(viewport: TerminalViewport) => void>();
  private destroyListeners = new Set<() => void>();
  private destroyed = false;
  private readonly options: OpenTuiRendererOptions;

  constructor(options: OpenTuiRendererOptions = {}) {
    this.options = options;
  }

  get isDestroyed(): boolean {
    return this.destroyed;
  }

  async start(options?: TuiRenderOptions): Promise<void> {
    if (this.renderer) return;
    const renderer =
      this.options.renderer ??
      (await createCliRenderer({
        externalOutputMode: 'passthrough',
        targetFps: options?.targetFps ?? this.options.targetFps ?? 60,
        exitOnCtrlC: options?.exitOnCtrlC ?? this.options.exitOnCtrlC ?? false,
        useKittyKeyboard: this.options.useKittyKeyboard === false ? {} : {},
        autoFocus: false,
        useMouse: options?.useMouse ?? this.options.useMouse ?? false,
      }));
    this.renderer = renderer;
    this.viewport = this.readViewport(renderer);
    renderer.on('resize', () => {
      this.viewport = this.readViewport(renderer);
      for (const listener of this.resizeListeners) listener(this.viewport);
    });
    renderer.once('destroy', () => {
      this.destroyed = true;
      for (const listener of this.destroyListeners) listener();
    });
    this.root = createRoot(renderer);
  }

  render(node: ReactNode): void {
    if (!this.root || !this.renderer) return;
    this.root.render(node);
  }

  async stop(): Promise<void> {
    if (!this.renderer) return;
    this.root?.unmount();
    this.root = null;
    this.renderer.destroy();
    this.renderer = null;
  }

  invalidate(): void {
    // OpenTUI repaints on every render() call; explicit invalidation is a no-op.
  }

  getCapabilities(): TerminalCapabilities {
    return {
      color: true,
      mouse: Boolean(this.options.useMouse),
      kittyKeyboard: this.options.useKittyKeyboard !== false,
      unicode: true,
    };
  }

  getViewport(): TerminalViewport {
    return this.viewport;
  }

  onResize(listener: (viewport: TerminalViewport) => void): () => void {
    this.resizeListeners.add(listener);
    return () => {
      this.resizeListeners.delete(listener);
    };
  }

  onDestroy(listener: () => void): () => void {
    this.destroyListeners.add(listener);
    return () => {
      this.destroyListeners.delete(listener);
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.root?.unmount();
    this.root = null;
    this.renderer?.destroy();
    this.renderer = null;
    this.destroyed = true;
  }

  private readViewport(renderer: CliRenderer): TerminalViewport {
    const columns = renderer.terminalWidth ?? 80;
    const rows = renderer.terminalHeight ?? 24;
    return { columns, rows };
  }
}
