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
    listener({
      type: 'plans',
      plans: [{ id: 'plan-1', title: 'Native TUI', goal: 'Replace REPL', status: 'approved', taskCount: 5 }],
    });
    listener({
      type: 'sessions',
      sessions: [
        {
          id: 'session-1',
          title: 'TUI implementation',
          objective: 'Ship the TUI',
          status: 'executing',
          participantCount: 2,
        },
      ],
    });
    listener({ type: 'files', files: [{ path: 'packages/tui/src/app.tsx', status: 'modified' }] });
    listener({
      type: 'routing',
      routing: {
        revision: 2,
        profileId: 'manual',
        roles: { developer: { providerId: 'opencode', modelId: 'deepseek' } },
        agents: [
          { id: 'agent-developer', name: 'Developer', role: 'developer', status: 'active' },
          { id: 'agent-architect', name: 'Architect', role: 'architect', status: 'active' },
        ],
        candidates: [
          {
            ref: { providerId: 'opencode', modelId: 'deepseek' },
            providerName: 'OpenCode',
            locality: 'cloud',
            availability: { available: true, state: 'healthy' },
          },
          {
            ref: { providerId: 'ollama', modelId: 'qwen-coder' },
            providerName: 'Ollama',
            locality: 'local',
            availability: { available: true, state: 'healthy' },
          },
        ],
        activeAgentId: 'agent-developer',
      },
    });
    return () => {};
  }
  async *execute(command: string): AsyncGenerator<TuiEvent> {
    this.commands.push(command);
    if (command.startsWith('/routing select')) {
      yield { type: 'notification', level: 'success', message: 'Developer → Ollama/qwen-coder' };
      return;
    }
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
  it('renders typed text immediately and submits it from the composer', async () => {
    const controller = new StubController();
    const view = render(createElement(App, { controller: controller as unknown as TuiController }));
    try {
      await frame(view, 'connected');
      view.stdin.write('build the dashboard');
      expect(await frame(view, 'build the dashboard')).toContain('› build the dashboard');
      view.stdin.write('\r');
      await frame(view, 'Streaming response');
      expect(controller.commands).toEqual(['build the dashboard']);
    } finally {
      view.unmount();
    }
  });

  it('renders runtime state and navigates the command palette', async () => {
    const controller = new StubController();
    const view = render(createElement(App, { controller: controller as unknown as TuiController }));
    try {
      const initial = await frame(view, 'Developer · opencode/deepseek');
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

  it('selects an agent, provider, and model from the routing overlay', async () => {
    const controller = new StubController();
    const view = render(createElement(App, { controller: controller as unknown as TuiController }));
    try {
      await frame(view, 'connected');
      view.stdin.write('\u0012');
      expect(await frame(view, 'Execution Routing · Agent')).toContain('Developer · developer · current');
      view.stdin.write('\r');
      await frame(view, 'Execution Routing · Provider');
      view.stdin.write('\u001b[B');
      await frame(view, '› Ollama · ollama');
      view.stdin.write('\r');
      expect(await frame(view, 'Execution Routing · Model')).toContain('qwen-coder');
      view.stdin.write('\r');
      await frame(view, 'Developer → Ollama/qwen-coder');
      expect(controller.commands).toEqual(['/routing select "agent-developer" "developer" "ollama" "qwen-coder"']);
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

  it('renders runtime-backed plans, sessions, and workspace files', async () => {
    const view = render(createElement(App, { controller: new StubController() as unknown as TuiController }));
    try {
      await frame(view, 'connected');
      view.stdin.write('\u0010');
      await frame(view, 'Command Palette');
      view.stdin.write('plans');
      await frame(view, 'Command Palette › plans');
      view.stdin.write('\r');
      expect(await frame(view, 'Native TUI')).toContain('5 tasks');

      view.stdin.write('\u0010');
      await frame(view, 'Command Palette');
      view.stdin.write('explorer');
      await frame(view, 'Command Palette › explorer');
      view.stdin.write('\r');
      expect(await frame(view, 'packages/tui/src/app.tsx')).toContain('modified');
    } finally {
      view.unmount();
    }
  });
});
