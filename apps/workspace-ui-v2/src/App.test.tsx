/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('DesktopShell phase machine', () => {
  it('boots through login into the desktop', async () => {
    render(<App />);
    expect(screen.getByText('SHELL OS')).toBeTruthy();
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
