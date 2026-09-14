// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ProviderModelSelector,
  __resetProviderModelSelectorCachesForTests,
} from '../src/components/ui/ProviderModelSelector';

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

function browseResponse(
  providers: Array<{ id: string; name: string; models: Array<{ id: string; name: string; status?: string }> }>,
  total = providers.length,
) {
  return {
    ok: true,
    json: async () => ({
      providers: providers.map((p) => ({ ...p, source: 'test' })),
      default: {},
      pagination: { total, offset: 0, limit: 50, hasMore: false },
    }),
  };
}

function selectedResponse(
  providers: Array<{ id: string; name: string; models: Array<{ id: string; name: string; status?: string }> }>,
  hasMore = false,
  total?: number,
) {
  return {
    ok: true,
    json: async () => ({
      providers: providers.map((p) => ({ ...p, source: 'test' })),
      default: {},
      pagination: { total: total ?? providers.length, offset: 0, limit: 100, hasMore },
    }),
  };
}

function routeFetch(opts: {
  browse: () => any;
  selected: (q: string) => any;
  captured: Array<{ url: string; q: string; limit: number }>;
}) {
  mockFetch.mockImplementation(async (url: string) => {
    const u = String(url);
    const parsed = new URL(u, 'http://localhost');
    const q = parsed.searchParams.get('q') ?? '';
    const limit = Number(parsed.searchParams.get('limit') ?? '0');
    opts.captured.push({ url: u, q, limit });
    if (q) return opts.selected(q);
    return opts.browse();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetProviderModelSelectorCachesForTests();
});

afterEach(() => {
  cleanup();
});

describe('GA-PROVIDER-002A: truthful selected-model availability', () => {
  it('mount/loading does not render unavailable', async () => {
    const captured: Array<{ url: string; q: string; limit: number }> = [];
    mockFetch.mockImplementation(() => new Promise(() => {}));
    const onChange = vi.fn();
    render(<ProviderModelSelector value={{ providerId: 'opencode', modelId: 'm-x' }} onChange={onChange} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId('provider-model-unavailable')).toBeNull();
    expect(screen.queryByTestId('provider-model-unknown')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(captured).toEqual([]);
  });

  it('selected model outside browse page 1 resolves available', async () => {
    const captured: Array<{ url: string; q: string; limit: number }> = [];
    routeFetch({
      captured,
      browse: () =>
        browseResponse([{ id: 'other', name: 'Other', models: [{ id: 'm1', name: 'M1' }] }]),
      selected: () =>
        selectedResponse([{ id: 'opencode', name: 'OpenCode', models: [{ id: 'm-x', name: 'Model X' }] }]),
    });
    const onChange = vi.fn();
    render(<ProviderModelSelector value={{ providerId: 'opencode', modelId: 'm-x' }} onChange={onChange} />);
    await waitFor(() => expect(screen.getByText('OpenCode / Model X')).toBeDefined());
    expect(screen.queryByTestId('provider-model-unavailable')).toBeNull();
    expect(screen.queryByTestId('provider-model-unknown')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    // Bounded: browse page 50, targeted lookup 100 — never the full catalog.
    expect(captured.find((c) => !c.q)?.limit).toBe(50);
    expect(captured.find((c) => !!c.q)?.limit).toBe(100);
  });

  it('open then close does not change resolved selected-model state', async () => {
    const captured: Array<{ url: string; q: string; limit: number }> = [];
    routeFetch({
      captured,
      browse: () =>
        browseResponse([{ id: 'other', name: 'Other', models: [{ id: 'm1', name: 'M1' }] }]),
      selected: () =>
        selectedResponse([{ id: 'opencode', name: 'OpenCode', models: [{ id: 'm-x', name: 'Model X' }] }]),
    });
    const onChange = vi.fn();
    render(<ProviderModelSelector value={{ providerId: 'opencode', modelId: 'm-x' }} onChange={onChange} />);
    await waitFor(() => expect(screen.getByText('OpenCode / Model X')).toBeDefined());
    fireEvent.click(screen.getByTestId('provider-model-selector-trigger'));
    await waitFor(() => expect(screen.getByTestId('provider-model-search')).toBeDefined());
    // Browse page does not contain the selection — resolution must survive.
    expect(screen.queryByTestId('provider-model-unavailable')).toBeNull();
    fireEvent.click(screen.getByTestId('provider-model-selector-trigger'));
    await waitFor(() => expect(screen.queryByTestId('provider-model-search')).toBeNull());
    expect(screen.getByText('OpenCode / Model X')).toBeDefined();
    expect(screen.queryByTestId('provider-model-unavailable')).toBeNull();
    expect(screen.queryByTestId('provider-model-unknown')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('search excluding selected model does not mark it unavailable', async () => {
    const captured: Array<{ url: string; q: string; limit: number }> = [];
    let searchMode = false;
    mockFetch.mockImplementation(async (url: string) => {
      const u = String(url);
      const parsed = new URL(u, 'http://localhost');
      const q = parsed.searchParams.get('q') ?? '';
      captured.push({ url: u, q, limit: Number(parsed.searchParams.get('limit') ?? '0') });
      // Targeted selected lookup always resolves.
      if (q === 'm-x') return selectedResponse([{ id: 'opencode', name: 'OpenCode', models: [{ id: 'm-x', name: 'Model X' }] }]);
      // Browse search returns a subset without the selection.
      if (q === 'zzz') {
        searchMode = true;
        return { ok: true, json: async () => ({ providers: [], default: {}, pagination: { total: 0, offset: 0, limit: 50, hasMore: false } }) };
      }
      return browseResponse([{ id: 'other', name: 'Other', models: [{ id: 'm1', name: 'M1' }] }]);
    });
    const onChange = vi.fn();
    render(<ProviderModelSelector value={{ providerId: 'opencode', modelId: 'm-x' }} onChange={onChange} />);
    await waitFor(() => expect(screen.getByText('OpenCode / Model X')).toBeDefined());
    fireEvent.click(screen.getByTestId('provider-model-selector-trigger'));
    await waitFor(() => expect(screen.getByTestId('provider-model-search')).toBeDefined());
    fireEvent.change(screen.getByTestId('provider-model-search'), { target: { value: 'zzz' } });
    await waitFor(() => expect(searchMode).toBe(true));
    await new Promise((r) => setTimeout(r, 350));
    expect(screen.queryByTestId('provider-model-unavailable')).toBeNull();
    expect(screen.queryByTestId('provider-model-unknown')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('fetch failure renders Unknown, not Unavailable', async () => {
    const captured: Array<{ url: string; q: string; limit: number }> = [];
    mockFetch.mockImplementation(async (url: string) => {
      const u = String(url);
      const parsed = new URL(u, 'http://localhost');
      const q = parsed.searchParams.get('q') ?? '';
      captured.push({ url: u, q, limit: Number(parsed.searchParams.get('limit') ?? '0') });
      if (q) throw new Error('network down');
      return browseResponse([]);
    });
    const onChange = vi.fn();
    render(<ProviderModelSelector value={{ providerId: 'opencode', modelId: 'm-x' }} onChange={onChange} />);
    await waitFor(() => expect(screen.getByTestId('provider-model-unknown')).toBeDefined());
    expect(screen.getByText('Model status unknown')).toBeDefined();
    expect(screen.queryByTestId('provider-model-unavailable')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('authoritative absence renders Unavailable and preserves identity', async () => {
    const captured: Array<{ url: string; q: string; limit: number }> = [];
    routeFetch({
      captured,
      browse: () => browseResponse([]),
      selected: () => selectedResponse([{ id: 'opencode', name: 'OpenCode', models: [{ id: 'other-model', name: 'Other' }] }], false),
    });
    const onChange = vi.fn();
    render(<ProviderModelSelector value={{ providerId: 'opencode', modelId: 'm-gone' }} onChange={onChange} />);
    await waitFor(() => expect(screen.getByTestId('provider-model-unavailable')).toBeDefined());
    expect(screen.getByText('Model unavailable')).toBeDefined();
    expect(screen.queryByTestId('provider-model-unknown')).toBeNull();
    // Identity preserved — no silent fallback.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('truncated search page without exact match renders Unknown, not Unavailable', async () => {
    routeFetch({
      captured: [],
      browse: () => browseResponse([]),
      selected: () =>
        selectedResponse([{ id: 'opencode', name: 'OpenCode', models: [{ id: 'other-model', name: 'Other' }] }], true, 500),
    });
    const onChange = vi.fn();
    render(<ProviderModelSelector value={{ providerId: 'opencode', modelId: 'm-x' }} onChange={onChange} />);
    await waitFor(() => expect(screen.getByTestId('provider-model-unknown')).toBeDefined());
    expect(screen.queryByTestId('provider-model-unavailable')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not match on display names — canonical providerId + modelId only', async () => {
    routeFetch({
      captured: [],
      browse: () => browseResponse([]),
      // Same display names, wrong canonical IDs.
      selected: () =>
        selectedResponse([{ id: 'other-provider', name: 'OpenCode', models: [{ id: 'different-id', name: 'm-x' }] }], false),
    });
    const onChange = vi.fn();
    render(<ProviderModelSelector value={{ providerId: 'opencode', modelId: 'm-x' }} onChange={onChange} />);
    await waitFor(() => expect(screen.getByTestId('provider-model-unavailable')).toBeDefined());
    expect(screen.queryByTestId('provider-model-unknown')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('disabled selected model renders Unavailable', async () => {
    routeFetch({
      captured: [],
      browse: () => browseResponse([]),
      selected: () =>
        selectedResponse([{ id: 'opencode', name: 'OpenCode', models: [{ id: 'm-x', name: 'Model X', status: 'disabled' }] }], false),
    });
    const onChange = vi.fn();
    render(<ProviderModelSelector value={{ providerId: 'opencode', modelId: 'm-x' }} onChange={onChange} />);
    await waitFor(() => expect(screen.getByTestId('provider-model-unavailable')).toBeDefined());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('dropdown pagination and search remain bounded', async () => {
    const captured: Array<{ url: string; q: string; limit: number }> = [];
    routeFetch({
      captured,
      browse: () => browseResponse([]),
      selected: () => selectedResponse([], false),
    });
    const onChange = vi.fn();
    render(<ProviderModelSelector value={{ providerId: 'opencode', modelId: 'm-x' }} onChange={onChange} />);
    await waitFor(() => expect(captured.length).toBeGreaterThan(0));
    for (const c of captured) {
      expect(c.limit).toBeLessThanOrEqual(100);
    }
    expect(captured.filter((c) => !c.q).every((c) => c.limit === 50)).toBe(true);
  });
});
