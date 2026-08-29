// Renderer contract — the boundary between the Vestara TUI application and
// the terminal rendering engine (OpenTUI). Feature code must not import
// OpenTUI directly; it consumes this contract + the hooks/adapter exported
// from this package.

import type { TuiSemanticPalette } from '@vestara/design-system';
import type { ReactNode } from 'react';

export interface TerminalViewport {
  readonly columns: number;
  readonly rows: number;
}

export interface TerminalCapabilities {
  readonly color: boolean;
  readonly mouse: boolean;
  readonly kittyKeyboard: boolean;
  readonly unicode: boolean;
}

export interface TuiRenderer {
  /** Mount the renderer and prepare it for React rendering. */
  start(options?: TuiRenderOptions): Promise<void>;
  /** Render a React tree into the terminal. */
  render(node: ReactNode): void;
  /** Tear the renderer down and restore the terminal. */
  stop(): Promise<void>;
  invalidate(): void;
  getCapabilities(): TerminalCapabilities;
  getViewport(): TerminalViewport;
  onResize(listener: (viewport: TerminalViewport) => void): () => void;
  onDestroy(listener: () => void): () => void;
  destroy(): void;
}

export interface TuiRenderOptions {
  readonly theme?: TuiSemanticPalette;
  readonly targetFps?: number;
  readonly exitOnCtrlC?: boolean;
  readonly useMouse?: boolean;
}

export interface TuiKeybinding {
  readonly key: string;
  readonly desc: string;
  readonly group: string;
  readonly cmd: () => void;
}

export interface TuiCommand {
  readonly name: string;
  readonly title: string;
  readonly category: string;
  readonly hidden?: boolean;
  readonly run: () => void;
}

export interface TuiCommandRegistry {
  register(command: TuiCommand): () => void;
  list(): readonly TuiCommand[];
  dispatch(name: string): boolean;
}

export interface TuiNotificationService {
  notify(level: 'success' | 'warning' | 'error' | 'info', message: string): void;
}

export interface TuiClipboardService {
  write(text: string): Promise<void>;
}

export interface TuiHost {
  readonly renderer: TuiRenderer;
  readonly commands: TuiCommandRegistry;
  readonly keybindings: TuiKeybinding[];
  readonly notifications: TuiNotificationService;
  readonly clipboard: TuiClipboardService;
}

export class InMemoryCommandRegistry implements TuiCommandRegistry {
  private readonly commands = new Map<string, TuiCommand>();
  register(command: TuiCommand): () => void {
    this.commands.set(command.name, command);
    return () => {
      this.commands.delete(command.name);
    };
  }
  list(): readonly TuiCommand[] {
    return [...this.commands.values()];
  }
  dispatch(name: string): boolean {
    const command = this.commands.get(name);
    if (!command) return false;
    command.run();
    return true;
  }
}

export class NoopNotificationService implements TuiNotificationService {
  notify(level: 'success' | 'warning' | 'error' | 'info', message: string): void {
    const prefix = level === 'error' ? '✗' : level === 'warning' ? '!' : level === 'success' ? '✓' : 'ℹ';
    console.error(`[tui] ${prefix} ${message}`);
  }
}
