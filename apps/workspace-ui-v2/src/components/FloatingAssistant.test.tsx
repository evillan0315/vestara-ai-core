/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ASSISTANT_REPLIES } from '../packages/assistant.fixtures';
import { FloatingAssistant } from './FloatingAssistant';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

const ok = (data: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => data }) as Response;

describe('FloatingAssistant', () => {
  it('opens the panel with greeting and starters', async () => {
    const user = userEvent.setup();
    render(<FloatingAssistant />);
    expect(screen.queryByRole('dialog', { name: 'Vestara assistant' })).toBeNull();
    await user.click(screen.getByLabelText('Open assistant'));
    expect(screen.getByRole('dialog', { name: 'Vestara assistant' })).toBeTruthy();
    expect(screen.getByText(/shell nominal/i)).toBeTruthy();
    expect(screen.getByText('Shell status')).toBeTruthy();
  });

  it('sends a starter and appends the deterministic reply', async () => {
    const user = userEvent.setup();
    render(<FloatingAssistant />);
    await user.click(screen.getByLabelText('Open assistant'));
    await user.click(screen.getByText('Shell status'));
    expect(screen.getByText('Shell status')).toBeTruthy();
    expect(screen.getByText(ASSISTANT_REPLIES[0])).toBeTruthy();
  });

  it('sends typed input on Enter and closes on Escape', async () => {
    const user = userEvent.setup();
    render(<FloatingAssistant />);
    await user.click(screen.getByLabelText('Open assistant'));
    await user.type(screen.getByLabelText('Message Vestara assistant'), 'hello{Enter}');
    expect(screen.getByText('hello')).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Vestara assistant' })).toBeNull();
  });

  it('answers live when authenticated', async () => {
    localStorage.setItem('vestara-assistant-token', 'tok-live');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.endsWith('/api/auth/me')) return ok({ user: { id: 'u1' } });
        if (u.endsWith('/api/conversations')) return ok({ conversation: { id: 'conv-live' } }, 201);
        if (u.includes('/stream'))
          return new Response(
            'data: {"event":{"type":"delta","content":"Live answer"}}\n\ndata: {"event":{"type":"done"}}\n\n',
          );
        throw new Error(`unexpected fetch ${u}`);
      }),
    );
    const user = userEvent.setup();
    render(<FloatingAssistant />);
    await user.click(screen.getByLabelText('Open assistant'));
    expect(await screen.findByText('live')).toBeTruthy();
    await user.type(screen.getByLabelText('Message Vestara assistant'), 'ping{Enter}');
    expect(await screen.findByText('Live answer')).toBeTruthy();
  });

  it('falls back to fixtures on 401 and clears the dead token', async () => {
    localStorage.setItem('vestara-assistant-token', 'tok-dead');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.endsWith('/api/auth/me')) return ok({ error: 'Authentication is required.' }, 401);
        throw new Error(`unexpected fetch ${u}`);
      }),
    );
    const user = userEvent.setup();
    render(<FloatingAssistant />);
    await user.click(screen.getByLabelText('Open assistant'));
    expect(await screen.findByText('fixture')).toBeTruthy();
    expect(localStorage.getItem('vestara-assistant-token')).toBeNull();
  });

  it('performs the suggestion action and streams the reply', async () => {
    localStorage.setItem('vestara-assistant-token', 'tok-live');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.endsWith('/api/auth/me')) return ok({ user: { id: 'u1' } });
        if (u.endsWith('/api/conversations')) return ok({ conversation: { id: 'conv-act' } }, 201);
        if (u.includes('/stream'))
          return new Response(
            'data: {"event":{"type":"delta","content":"Opening "}}\n\ndata: {"event":{"type":"delta","content":"activity."}}\n\ndata: {"event":{"type":"done"}}\n\n',
          );
        throw new Error(`unexpected fetch ${u}`);
      }),
    );
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<FloatingAssistant onAction={onAction} />);
    await user.click(screen.getByLabelText('Open assistant'));
    expect(await screen.findByText('live')).toBeTruthy();
    await user.click(screen.getByText('Open Activity Room'));
    expect(onAction).toHaveBeenCalledWith('activity');
    expect(await screen.findByText('Opening activity.')).toBeTruthy();
  });

  it('reattaches to a running turn after reload without duplicating it', async () => {
    vi.useFakeTimers();
    try {
      localStorage.setItem('vestara-assistant-token', 'tok-live');
      localStorage.setItem('vestara-assistant-thread', 'conv-old');
      let activeCalls = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: unknown) => {
          const u = String(url);
          if (u.endsWith('/api/auth/me')) return ok({ user: { id: 'u1' } });
          if (u.endsWith('/active')) {
            activeCalls += 1;
            return ok({ conversationId: 'conv-old', active: activeCalls < 2 });
          }
          if (u.includes('/api/conversations/conv-old'))
            return ok({ conversation: { messages: [{ role: 'assistant', content: 'Caught-up answer' }] } });
          throw new Error(`unexpected fetch ${u}`);
        }),
      );
      render(<FloatingAssistant />);
      fireEvent.click(screen.getByLabelText('Open assistant'));
      // Pump the clock until the validation → live → reattach chain settles.
      for (let i = 0; i < 20 && !screen.queryByText('Catching up on the running turn…'); i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(50);
        });
      }
      expect(screen.getByText('Catching up on the running turn…')).toBeTruthy();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(screen.getByText('Caught-up answer')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts a new chat and clears the stored thread', async () => {
    localStorage.setItem('vestara-assistant-thread', 'conv-old');
    const user = userEvent.setup();
    render(<FloatingAssistant />);
    await user.click(screen.getByLabelText('Open assistant'));
    await user.type(screen.getByLabelText('Message Vestara assistant'), 'hi{Enter}');
    expect(screen.getByText('hi')).toBeTruthy();
    await user.click(screen.getByLabelText('Start new chat'));
    expect(screen.queryByText('hi')).toBeNull();
    expect(localStorage.getItem('vestara-assistant-thread')).toBeNull();
  });

  it('falls back to the messages call on an empty stream and shows latency', async () => {
    localStorage.setItem('vestara-assistant-token', 'tok-live');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.endsWith('/api/auth/me')) return ok({ user: { id: 'u1' } });
        if (u.endsWith('/api/conversations')) return ok({ conversation: { id: 'conv-fb' } }, 201);
        if (u.includes('/stream')) return new Response('data: {"event":{"type":"done"}}\n\n');
        if (u.includes('/messages')) return ok({ response: { content: 'Fallback answer' }, latency: 42 });
        throw new Error(`unexpected fetch ${u}`);
      }),
    );
    const user = userEvent.setup();
    render(<FloatingAssistant />);
    await user.click(screen.getByLabelText('Open assistant'));
    expect(await screen.findByText('live')).toBeTruthy();
    await user.type(screen.getByLabelText('Message Vestara assistant'), 'ping{Enter}');
    expect(await screen.findByText('Fallback answer')).toBeTruthy();
    expect(await screen.findByText('answered in 42ms')).toBeTruthy();
  });

  it('renders live tool operations from stream frames', async () => {
    localStorage.setItem('vestara-assistant-token', 'tok-live');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.endsWith('/api/auth/me')) return ok({ user: { id: 'u1' } });
        if (u.endsWith('/api/conversations')) return ok({ conversation: { id: 'conv-tools' } }, 201);
        if (u.includes('/stream'))
          return new Response(
            'data: {"event":{"type":"tool","name":"read","execution":{"contract":"assistant.execution.v1","version":1,"kind":"tool","tool":"read","operationId":"op-1","state":"running","source":"opencode","timestamp":1}}}\n\n' +
              'data: {"event":{"type":"tool_result","name":"read","content":"file body","execution":{"contract":"assistant.execution.v1","version":1,"kind":"tool","tool":"read","operationId":"op-1","state":"completed","source":"opencode","timestamp":2}}}\n\n' +
              'data: {"event":{"type":"done"}}\n\n',
          );
        throw new Error(`unexpected fetch ${u}`);
      }),
    );
    const user = userEvent.setup();
    render(<FloatingAssistant />);
    await user.click(screen.getByLabelText('Open assistant'));
    await user.type(screen.getByLabelText('Message Vestara assistant'), 'read it{Enter}');
    expect(await screen.findByTestId('assistant-tool-ops')).toBeTruthy();
    expect(await screen.findByText('read')).toBeTruthy();
    expect(await screen.findByText(/file body/)).toBeTruthy();
  });

  it('shows ASK permission cards and resolves them via the decision endpoint', async () => {
    localStorage.setItem('vestara-assistant-token', 'tok-live');
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown, init?: RequestInit) => {
        const u = String(url);
        calls.push({ url: u, body: String(init?.body ?? '') });
        if (u.endsWith('/api/auth/me')) return ok({ user: { id: 'u1' } });
        if (u.endsWith('/api/conversations')) return ok({ conversation: { id: 'conv-ask' } }, 201);
        if (u.includes('/permissions/')) return ok({ ok: true, permissionId: 'per-1' });
        if (u.includes('/stream'))
          return new Response(
            'data: {"event":{"type":"status","content":"Waiting for permission: webfetch","execution":{"contract":"assistant.execution.v1","version":1,"kind":"permission","operationId":"per-1","state":"running","permissionRequestId":"per-1","action":"webfetch","resources":["https://example.com"],"permissionState":"requested","source":"opencode","timestamp":1}}}\n\n' +
              'data: {"event":{"type":"done"}}\n\n',
          );
        throw new Error(`unexpected fetch ${u}`);
      }),
    );
    const user = userEvent.setup();
    render(<FloatingAssistant />);
    await user.click(screen.getByLabelText('Open assistant'));
    await user.type(screen.getByLabelText('Message Vestara assistant'), 'fetch it{Enter}');
    expect(await screen.findByTestId('assistant-permission-card')).toBeTruthy();
    expect(await screen.findByText('webfetch')).toBeTruthy();
    await user.click(screen.getByText('Once'));
    await vi.waitFor(() => {
      expect(calls.some((c) => c.url.endsWith('/permissions/per-1'))).toBe(true);
    });
    expect(JSON.parse(calls.find((c) => c.url.endsWith('/permissions/per-1'))?.body ?? '{}')).toEqual({
      decision: 'allow-once',
    });
    await vi.waitFor(() => {
      expect(screen.queryByTestId('assistant-permission-card')).toBeNull();
    });
  });

  it('stops a live turn via AbortController plus the cancel endpoint', async () => {
    localStorage.setItem('vestara-assistant-token', 'tok-live');
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown, init?: RequestInit) => {
        const u = String(url);
        calls.push(u);
        if (u.endsWith('/api/auth/me')) return ok({ user: { id: 'u1' } });
        if (u.endsWith('/api/conversations')) return ok({ conversation: { id: 'conv-stop' } }, 201);
        if (u.endsWith('/cancel')) return ok({ cancelled: true });
        if (u.includes('/stream')) {
          return new Promise<Response>((_resolve, reject) => {
            (init?.signal as AbortSignal | undefined)?.addEventListener('abort', () => {
              reject(new DOMException('AbortError', 'AbortError'));
            });
          });
        }
        throw new Error(`unexpected fetch ${u}`);
      }),
    );
    const user = userEvent.setup();
    render(<FloatingAssistant />);
    await user.click(screen.getByLabelText('Open assistant'));
    expect(await screen.findByText('live')).toBeTruthy();
    await user.type(screen.getByLabelText('Message Vestara assistant'), 'work{Enter}');
    expect(await screen.findByLabelText('Stop response')).toBeTruthy();
    await user.click(screen.getByLabelText('Stop response'));
    expect(calls.some((c) => c.endsWith('/cancel'))).toBe(true);
    expect(screen.queryByLabelText('Stop response')).toBeNull();
  });
});
