import { render } from 'ink-testing-library';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { App } from '../src/app.js';
import { ConsoleController, type ConsoleEvent } from '../src/controller.js';

class StubController extends ConsoleController {
  readonly commands: string[] = [];

  constructor(private readonly responder: (command: string) => AsyncIterable<ConsoleEvent>) {
    super({ endpoint: 'http://127.0.0.1:1' });
  }

  override async *execute(command: string): AsyncGenerator<ConsoleEvent> {
    this.commands.push(command);
    yield* this.responder(command);
  }
}

async function* events(...values: ConsoleEvent[]): AsyncGenerator<ConsoleEvent> {
  for (const value of values) yield value;
}

async function waitForFrame(read: () => string | undefined, content: string): Promise<string> {
  await expect.poll(read).toContain(content);
  return read() ?? '';
}

describe('Console App', () => {
  it('renders help and command palette overlays from keyboard shortcuts', async () => {
    const controller = new StubController(() => events());
    const view = render(createElement(App, { controller }));
    try {
      expect(view.lastFrame()).toContain('Vestara Engineering Console ready');

      view.stdin.write('?');
      expect(await waitForFrame(view.lastFrame, 'Keyboard')).toContain('Shift+Enter');

      view.stdin.write('\u001B');
      await expect.poll(view.lastFrame).not.toContain('Keyboard');
      view.stdin.write('\u0010');
      expect(await waitForFrame(view.lastFrame, 'Command palette')).toContain('routing preview');
    } finally {
      view.unmount();
    }
  });

  it('submits input and renders streamed output incrementally', async () => {
    const controller = new StubController(() =>
      events(
        { type: 'status', content: 'Thinking…' },
        { type: 'output-start' },
        { type: 'output-delta', content: 'Hello ' },
        { type: 'output-delta', content: 'engineer.' },
        { type: 'output-end' },
      ),
    );
    const view = render(createElement(App, { controller }));
    try {
      view.stdin.write('Explain routing');
      await waitForFrame(view.lastFrame, 'Explain routing');
      view.stdin.write('\r');

      const frame = await waitForFrame(view.lastFrame, 'Hello engineer.');
      expect(controller.commands).toEqual(['Explain routing']);
      expect(frame).toContain('You');
      expect(frame).toContain('Explain routing');
      expect(frame).toContain('Ready');
    } finally {
      view.unmount();
    }
  });

  it('requires keyboard approval before executing a governed command', async () => {
    const controller = new StubController((command) =>
      command.endsWith('--confirmed')
        ? events({ type: 'output', content: 'Reassignment accepted.' })
        : events({ type: 'confirmation', prompt: 'Reassign TASK-1?', command: `${command} --confirmed` }),
    );
    const view = render(createElement(App, { controller }));
    try {
      view.stdin.write('routing reassign TASK-1');
      await waitForFrame(view.lastFrame, 'routing reassign TASK-1');
      view.stdin.write('\r');
      expect(await waitForFrame(view.lastFrame, 'Confirmation required')).toContain('Reassign TASK-1?');
      expect(controller.commands).toEqual(['routing reassign TASK-1']);

      view.stdin.write('y');
      expect(await waitForFrame(view.lastFrame, 'Reassignment accepted.')).toContain('Ready');
      expect(controller.commands).toEqual(['routing reassign TASK-1', 'routing reassign TASK-1 --confirmed']);
    } finally {
      view.unmount();
    }
  });
});
