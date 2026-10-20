/**
 * VES-UI-001 T4: BootScreen acceptance guards.
 *
 * - Brand lockup renders without version strings (G11).
 * - No inline `<style>` keyframes (G8 — governed `.ds-boot-logo` CSS only).
 * - Progress + log stream render from `desktopShellBootLogsFixture`.
 * - Boot auto-completes after `BOOT_DONE_MS`; shutdown renders the
 *   spinner variant and completes after `SHUTDOWN_DONE_MS`.
 *
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOOT_DONE_MS,
  BOOT_TICK_MS,
  BOOT_TICKS,
  BootScreen,
  SHUTDOWN_DONE_MS,
} from './BootScreen.js';
import {
  desktopShellBootLogsFixture,
  desktopShellWorkspaceFixture,
} from './desktop-shell.fixtures.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('BootScreen', () => {
  it('renders the brand lockup with the workspace pill and no version strings', () => {
    const { container } = render(<BootScreen onDone={vi.fn()} />);
    expect(screen.getByText('VESTARA')).toBeInTheDocument();
    expect(screen.getByText('SHELL OS')).toBeInTheDocument();
    expect(screen.getByText(desktopShellWorkspaceFixture)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/v?\d+\.\d+\.\d+/);
    expect(container.textContent).not.toMatch(/FINAL/i);
  });

  it('uses governed CSS for the glow — no inline <style> keyframes (G8)', () => {
    const { container } = render(<BootScreen onDone={vi.fn()} />);
    expect(container.querySelector('style')).toBeNull();
    expect(container.querySelector('.ds-boot-logo')).toBeInTheDocument();
    expect(container.querySelector('svg[aria-label="Vestara"]')).toBeInTheDocument();
  });

  it('streams the fixture boot logs deterministically', () => {
    render(<BootScreen onDone={vi.fn()} />);
    const log = screen.getByRole('log', { name: 'Boot log' });
    expect(log).toBeEmptyDOMElement();
    act(() => {
      vi.advanceTimersByTime(260 * desktopShellBootLogsFixture.length);
    });
    expect(log.children).toHaveLength(desktopShellBootLogsFixture.length);
    for (const line of desktopShellBootLogsFixture) {
      expect(log.textContent).toContain(line.slice(6));
    }
  });

  it('advances the progressbar to 100% and calls onDone after BOOT_DONE_MS', () => {
    const onDone = vi.fn();
    render(<BootScreen onDone={onDone} />);
    const bar = screen.getByRole('progressbar', { name: 'Boot progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    act(() => {
      vi.advanceTimersByTime(BOOT_TICK_MS * BOOT_TICKS);
    });
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText('100% INITIALIZED')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(BOOT_DONE_MS - BOOT_TICK_MS * BOOT_TICKS);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('cleans up timers on unmount without calling onDone', () => {
    const onDone = vi.fn();
    const view = render(<BootScreen onDone={onDone} />);
    view.unmount();
    act(() => {
      vi.advanceTimersByTime(BOOT_DONE_MS * 2);
    });
    expect(onDone).not.toHaveBeenCalled();
  });

  it('renders the shutdown variant and completes after SHUTDOWN_DONE_MS', () => {
    const onDone = vi.fn();
    const { container } = render(<BootScreen shutting onDone={onDone} />);
    expect(screen.getByText('SHUTTING DOWN SHELL OS')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Shutting down' })).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(container.querySelector('style')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(SHUTDOWN_DONE_MS - 1);
    });
    expect(onDone).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
