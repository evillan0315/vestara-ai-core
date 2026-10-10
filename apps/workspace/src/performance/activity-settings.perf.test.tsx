/** @vitest-environment jsdom */

import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ActivitySettingsPanel from '../pages/activity/ActivitySettingsPanel';

describe('Activity Settings performance characterization', () => {
  it('issues configuration and runtime requests when the panel mounts', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<ActivitySettingsPanel />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual(
      expect.arrayContaining(['/api/settings', '/api/runtime/status']),
    );
  });
});
