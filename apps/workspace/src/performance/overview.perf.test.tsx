/** @vitest-environment jsdom */

import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useOverview } from '../features/overview/hooks/useOverview';

describe('Overview performance characterization', () => {
  it('records the current request fan-out and duplicate workspace request', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === '/api/workspace') {
        return new Response(JSON.stringify({ workspace: { name: 'Workspace' } }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useOverview());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => expect(fetchMock.mock.calls.map(([input]) => String(input))).toContain('/api/health'));

    const paths = fetchMock.mock.calls.map(([input]) => String(input));
    expect(paths.filter((path) => path === '/api/workspace')).toHaveLength(1);
    expect(paths).toEqual(expect.arrayContaining(['/api/conversations', '/api/agents', '/api/health']));
  });

  it('renders fixture data when every overview endpoint fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 })),
    );

    const { result } = renderHook(() => useOverview());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).not.toBeNull();
    expect(result.current.error).toBeNull();
  });
});
