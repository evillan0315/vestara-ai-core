import { render } from 'ink';
import { createElement } from 'react';
import { App } from './app.js';
import { ConsoleController } from './controller.js';

export interface RunConsoleOptions {
  endpoint?: string;
}

export async function runConsole(options: RunConsoleOptions = {}): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error('Vestara Console requires an interactive terminal');
  const controller = new ConsoleController(options);
  const instance = render(createElement(App, { controller }), {
    alternateScreen: true,
    exitOnCtrlC: false,
  });
  await instance.waitUntilExit();
}

export { App } from './app.js';
export { ConsoleController, type ConsoleEvent, splitArguments } from './controller.js';
