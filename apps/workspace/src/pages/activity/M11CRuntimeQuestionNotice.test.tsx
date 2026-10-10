/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PendingRuntimeQuestionProjection } from '@vestara/activity-room';
import M11CRuntimeQuestionNotice from './M11CRuntimeQuestionNotice';

const question: PendingRuntimeQuestionProjection = {
  interactionId: 'rq-ui-test',
  conversationId: 'conversation-ui-test',
  openCodeSessionId: 'session-ui-test',
  openCodeRequestId: 'request-ui-test',
  status: 'pending',
  questions: [
    {
      header: 'AR-LAYOUT-001',
      question: 'How should I proceed?',
      options: [
        { label: 'Gap analysis only', description: 'Do not implement.' },
        { label: 'Implement now', description: 'Apply the fix.' },
      ],
    },
  ],
  expiresAt: '2026-09-27T12:10:00.000Z',
  createdAt: '2026-09-27T12:00:00.000Z',
  updatedAt: '2026-09-27T12:00:00.000Z',
};

function okResponse() {
  return { ok: true, json: async () => ({ ok: true, requestId: 'request-ui-test' }) };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('M11CRuntimeQuestionNotice', () => {
  it('presents options as selectable buttons with send disabled until selection', () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse()));
    render(<M11CRuntimeQuestionNotice questions={[question]} />);

    expect(screen.getByText('Waiting for your response')).toBeTruthy();
    expect(screen.getByText('AR-LAYOUT-001')).toBeTruthy();
    expect(screen.getByText('How should I proceed?')).toBeTruthy();

    const first = screen.getByRole('button', { name: /Gap analysis only/ });
    expect(first.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Send answer' })).toBeDisabled();
  });

  it('selects an option and sends the answer to the live interaction authority', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    render(<M11CRuntimeQuestionNotice questions={[question]} />);

    fireEvent.click(screen.getByRole('button', { name: /Gap analysis only/ }));
    expect(screen.getByRole('button', { name: /Gap analysis only/ }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Send answer' }));

    await waitFor(() => expect(screen.getByText('Answer sent — the runtime will continue.')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/api/conversations/conversation-ui-test/questions/request-ui-test');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ answers: [['Gap analysis only']] });
  });

  it('toggles selection off when the selected option is clicked again', () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse()));
    render(<M11CRuntimeQuestionNotice questions={[question]} />);

    const first = screen.getByRole('button', { name: /Gap analysis only/ });
    fireEvent.click(first);
    expect(first.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(first);
    expect(first.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Send answer' })).toBeDisabled();
  });

  it('surfaces a retryable error when delivery fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));
    render(<M11CRuntimeQuestionNotice questions={[question]} />);

    fireEvent.click(screen.getByRole('button', { name: /Implement now/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send answer' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toContain('no longer pending');
    expect(screen.getByRole('button', { name: 'Send answer' })).not.toBeDisabled();
  });

  it('renders no actionable controls without exact identities', () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse()));
    render(
      <M11CRuntimeQuestionNotice
        questions={[{ ...question, interactionId: 'rq-no-identity', conversationId: '', openCodeRequestId: '' }]}
      />,
    );

    expect(screen.getByText('How should I proceed?')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send answer' })).toBeNull();
    expect(screen.getByText('Response controls are unavailable for this question.')).toBeTruthy();
  });

  it('renders no surface when there is no active authoritative question', () => {
    const { container } = render(<M11CRuntimeQuestionNotice questions={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
