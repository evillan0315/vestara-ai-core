import { render } from 'ink-testing-library';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { App } from '../src/app.js';
import type { TuiController } from '../src/controller.js';
import type { TuiEvent } from '../src/types.js';

class StubController {
  readonly commands: string[] = [];
  async connect(listener: (event: TuiEvent) => void): Promise<() => void> {
    listener({ type: 'workspace', workspace: { id: 'workspace-1', name: 'Vestara', branch: 'main' } });
    listener({ type: 'connection', state: 'connected' });
    listener({
      type: 'agent',
      agent: { id: 'developer', name: 'Developer', status: 'thinking', task: 'Build TUI', progress: 40 },
    });
    return () => {};
  }
  async *execute(command: string): AsyncGenerator<TuiEvent> {
    this.commands.push(command);
    const id = 'response-1';
    yield { type: 'conversation-start', id };
    yield { type: 'conversation-delta', id, content: 'Streaming response' };
    yield { type: 'conversation-complete', id };
  }
}

async function frame(view: ReturnType<typeof render>, content: string): Promise<string> {
  await expect.poll(view.lastFrame).toContain(content);
  return view.lastFrame() ?? '';
}

describe('Vestara TUI', () => {
  it('renders runtime state and navigates the command palette', async () => {
    const controller = new StubController();
    const view = render(createElement(App, { controller: controller as unknown as TuiController }));
    try {
      const initial = await frame(view, '1 agents');
      expect(initial).toContain('main');
      view.stdin.write('\u0010');
      expect(await frame(view, 'Command Palette')).toContain('Open Graph');
      view.stdin.write('graph');
      await frame(view, 'Command Palette › graph');
      view.stdin.write('\r');
      expect(await frame(view, 'Engineering Graph')).toContain('No data yet');
    } finally {
      view.unmount();
    }
  });

  it('executes palette actions and renders streamed responses in place', async () => {
    const controller = new StubController();
    const view = render(createElement(App, { controller: controller as unknown as TuiController }));
    try {
      await frame(view, 'connected');
      view.stdin.write('\u0010');
      await frame(view, 'Command Palette');
      view.stdin.write('status');
      await frame(view, 'Command Palette › status');
      view.stdin.write('\r');
      expect(await frame(view, 'Streaming response')).toContain('Vestara');
      expect(controller.commands).toEqual(['/status']);
    } finally {
      view.unmount();
    }
  });
});
