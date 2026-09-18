// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../src/lib/theme.js';
import { FileOperationsProvider, useFileOperationsChannel, useSharedFileOps } from '../src/contexts/FileOperationsContext.js';
import { FileOperationsBar } from '../src/features/files/components/FileOperationsBar.js';
import type { UseFileOperationsReturn } from '../src/features/files/hooks/useFileOperations.js';

function idleOps(): UseFileOperationsReturn {
  const noop = () => Promise.resolve(false);
  return {
    state: { status: 'idle' },
    dismiss: vi.fn(),
    create: noop,
    rename: noop,
    duplicate: noop,
    move: noop,
    remove: noop,
    download: noop,
    approve: noop,
    reject: noop,
  };
}

function renderBar(ops: UseFileOperationsReturn) {
  return render(
    <ThemeProvider>
      <FileOperationsBar ops={ops} />
    </ThemeProvider>,
  );
}

afterEach(() => cleanup());

describe('FileOperationsBar states (FP-9)', () => {
  it('starts idle with no active operations', () => {
    renderBar(idleOps());
    expect(screen.getByRole('status', { name: 'File operations' })).toBeDefined();
    expect(screen.getByText('Ready · No active operations')).toBeDefined();
  });

  it('surfaces approval-required with Review & approve and Reject', async () => {
    const approve = vi.fn(async () => true);
    const reject = vi.fn(async () => true);
    renderBar({
      ...idleOps(),
      state: { status: 'approval', label: 'Delete notes.txt', detail: 'High-risk operation requires approval.', approvalId: 'a1' },
      approve,
      reject,
    });
    const bar = screen.getByRole('status', { name: 'File operations' });
    expect(within(bar).getByText(/Approval required/)).toBeDefined();
    fireEvent.click(within(bar).getByRole('button', { name: 'Review & approve' }));
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(1));
    fireEvent.click(within(bar).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(reject).toHaveBeenCalledTimes(1));
  });

  it('shows failure truthfully with dismiss', () => {
    const dismiss = vi.fn();
    renderBar({ ...idleOps(), state: { status: 'failure', label: 'Move a/b', detail: 'Target is outside governed workspace' }, dismiss });
    const bar = screen.getByRole('status', { name: 'File operations' });
    expect(within(bar).getByText(/Target is outside governed workspace/)).toBeDefined();
    fireEvent.click(within(bar).getByRole('button', { name: 'Dismiss operation status' }));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});

describe('FileOperationsContext channel (FP-8)', () => {
  it('exposes the registered controller and falls back to idle', () => {
    const seen: Array<string> = [];
    function Probe() {
      const { ops, register, unregister } = useFileOperationsChannel();
      const shared = useSharedFileOps();
      seen.push(ops === null ? 'null' : 'registered', shared.state.status);
      return (
        <>
          <button type="button" onClick={() => register(idleOps())}>
            register
          </button>
          <button type="button" onClick={() => unregister()}>
            unregister
          </button>
        </>
      );
    }
    render(
      <ThemeProvider>
        <FileOperationsProvider>
          <Probe />
        </FileOperationsProvider>
      </ThemeProvider>,
    );
    expect(seen).toEqual(['null', 'idle']);
    fireEvent.click(screen.getByRole('button', { name: 'register' }));
    expect(seen.slice(-2)).toEqual(['registered', 'idle']);
    fireEvent.click(screen.getByRole('button', { name: 'unregister' }));
    expect(seen.slice(-2)).toEqual(['null', 'idle']);
  });
});
