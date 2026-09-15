// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from '../src/lib/theme.js';

function mockLocalStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      for (const key of Object.keys(store)) delete store[key];
    }),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', mockLocalStorage());
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ settings: [] }) }) as Response));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Runtime proof for the Settings → General → Profiles gallery: the premium
// profiles apply their theme modes while legacy profiles leave the mode
// untouched.

describe('Theme profiles runtime (Settings General)', () => {
  it("applyProfile('premium-dark') switches to dark mode with amber accent", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeProvider>{children}</ThemeProvider>
    );
    const { result } = renderHook(() => useTheme(), { wrapper });
    await act(async () => {
      result.current.applyProfile('premium-dark');
    });
    await waitFor(() => {
      expect(result.current.activeProfile).toBe('premium-dark');
    });
    expect(result.current.mode).toBe('dark');
    expect(result.current.settings.colorTheme).toBe('amber');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it("applyProfile('premium') switches to light mode with gold accent", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeProvider>{children}</ThemeProvider>
    );
    const { result } = renderHook(() => useTheme(), { wrapper });
    await act(async () => {
      result.current.applyProfile('premium');
    });
    await waitFor(() => {
      expect(result.current.activeProfile).toBe('premium');
    });
    expect(result.current.mode).toBe('light');
    expect(result.current.settings.colorTheme).toBe('gold');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it("applyProfile('default') keeps the current mode (legacy profiles are mode-independent)", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeProvider>{children}</ThemeProvider>
    );
    const { result } = renderHook(() => useTheme(), { wrapper });
    await act(async () => {
      result.current.applyProfile('premium-dark');
    });
    await waitFor(() => {
      expect(result.current.mode).toBe('dark');
    });
    await act(async () => {
      result.current.applyProfile('default');
    });
    await waitFor(() => {
      expect(result.current.activeProfile).toBe('default');
    });
    expect(result.current.mode).toBe('dark');
  });
});
