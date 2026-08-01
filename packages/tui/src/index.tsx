import { render } from 'ink';
import { createElement } from 'react';
import { App } from './app.js';
import { TuiController } from './controller.js';

export interface RunTuiOptions {
  endpoint?: string;
}

export async function runTui(options: RunTuiOptions = {}): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Vestara TUI requires an interactive terminal');
  const instance = render(createElement(App, { controller: new TuiController(options) }), {
    alternateScreen: true,
    exitOnCtrlC: false,
    patchConsole: true,
  });
  await instance.waitUntilExit();
}

export { App } from './app.js';
export { snapshotFromEvents, splitArguments, TuiController } from './controller.js';
export { TuiExtensionRegistry } from './extensions.js';
export { humanizeTool, normalizeRuntimeEvent } from './normalize.js';
export type * from './types.js';
