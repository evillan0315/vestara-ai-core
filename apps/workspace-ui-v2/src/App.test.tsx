/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { setPackageEnabled, setPackageInstalled, VOICE_PACKAGE_ID } from './lib/package-state';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('DesktopShell phase machine', () => {
  it('boots through login into the desktop', async () => {
    render(<App />);
    expect(screen.getByText('AI OS')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText('Welcome back, Director.')).toBeTruthy();
    // Continue performs an async login attempt (offline here) before entry.
    await act(async () => {
      fireEvent.click(screen.getByText('Continue → Desktop'));
    });
    expect(screen.getAllByText('Activity Room').length).toBeGreaterThan(0);
  });

  it('advances past live clock ticks during boot', async () => {
    // Regression: App re-renders every second (clock). An unstable onDone
    // prop resets BootScreen's timers each render and boot never advances.
    render(<App />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText('Welcome back, Director.')).toBeTruthy();
  });

  it('shows the voice launchers while installed+enabled and hides them otherwise', async () => {
    render(<App />);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Continue → Desktop'));
    });
    // Voice ships installed + enabled: desktop icon and dock entry present.
    expect(screen.getByLabelText('Open Voice Streaming')).toBeTruthy();
    expect(screen.getByLabelText('Open voice window')).toBeTruthy();

    // Disabling hides both launchers; re-enabling restores them.
    act(() => {
      setPackageEnabled(VOICE_PACKAGE_ID, false);
    });
    expect(screen.queryByLabelText('Open Voice Streaming')).toBeNull();
    expect(screen.queryByLabelText('Open voice window')).toBeNull();
    act(() => {
      setPackageEnabled(VOICE_PACKAGE_ID, true);
    });
    expect(screen.getByLabelText('Open Voice Streaming')).toBeTruthy();
    expect(screen.getByLabelText('Open voice window')).toBeTruthy();

    // Uninstalling hides both launchers as well.
    act(() => {
      setPackageInstalled(VOICE_PACKAGE_ID, false);
    });
    expect(screen.queryByLabelText('Open Voice Streaming')).toBeNull();
    expect(screen.queryByLabelText('Open voice window')).toBeNull();
  });

  it('closes open voice windows when the package is uninstalled', async () => {
    render(<App />);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Continue → Desktop'));
    });
    fireEvent.click(screen.getByLabelText('Open voice window'));
    expect(screen.getByRole('dialog', { name: 'Voice Streaming' })).toBeTruthy();
    act(() => {
      setPackageInstalled(VOICE_PACKAGE_ID, false);
    });
    expect(screen.queryByRole('dialog', { name: 'Voice Streaming' })).toBeNull();
  });

  it('locks into the locked login mode from the system menu', async () => {
    render(<App />);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Continue → Desktop'));
    });
    fireEvent.click(screen.getByLabelText('Open system menu'));
    fireEvent.click(screen.getByText('Lockscreen'));
    expect(screen.getByText('Locked, Director.')).toBeTruthy();
  });
});
