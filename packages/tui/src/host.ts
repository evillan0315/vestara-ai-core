import type { TuiSemanticPalette } from '@vestara/design-system';
import {
  InMemoryCommandRegistry,
  NoopNotificationService,
  type TuiHost,
  type TuiRenderer,
} from '@vestara/tui-renderer';
import type { TuiController } from './controller.js';
import type { TuiEvent } from './types.js';

export interface TuiHostOptions {
  endpoint: string;
  repoPath: string;
  controller: TuiController;
  palette?: TuiSemanticPalette;
}

export interface TuiHostHandle {
  host: TuiHost;
  controller: TuiController;
  subscribe(listener: (event: TuiEvent) => void): Promise<() => void>;
}

export function createTuiHost(renderer: TuiRenderer, options: TuiHostOptions): TuiHostHandle {
  const commands = new InMemoryCommandRegistry();
  const notifications = new NoopNotificationService();
  const { controller } = options;

  const host: TuiHost = {
    renderer,
    commands,
    keybindings: [],
    notifications,
    clipboard: {
      async write(text: string) {
        try {
          const { default: clipboardy } = await import('clipboardy');
          await clipboardy.write(text);
        } catch {
          // Clipboard unavailable (e.g. headless) — ignore.
        }
      },
    },
  };

  return {
    host,
    controller,
    subscribe: (listener) => controller.connect(listener),
  };
}
