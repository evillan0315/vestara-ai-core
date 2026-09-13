/**
 * GA-TERM-001 Phase 2 — AssistantTerminal output surface.
 *
 * Deterministic render tests (no localhost/OpenCode): exit-code chip,
 * authoritative duration vs client-observed elapsed, cwd, expandable
 * scrollback output with Copy, and the no-fabrication invariant (absent
 * fields render nothing).
 */

// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistantTerminal } from '../src/components/assistant/AssistantTerminal';
import type { TerminalExecutionDetail } from '@vestara/shared';

afterEach(() => {
  vi.unstubAllGlobals();
});

function detail(overrides: Partial<TerminalExecutionDetail>): TerminalExecutionDetail {
  return {
    contract: 'assistant.execution.v1',
    version: 1,
    operationId: 'op-bash-1',
    state: 'completed',
    tool: 'bash',
    source: 'opencode',
    timestamp: 1789216000000,
    kind: 'terminal',
    cwdProvenance: 'runtime-provided',
    exitCodeProvenance: 'runtime-provided',
    ...overrides,
  } as TerminalExecutionDetail;
}

describe('AssistantTerminal Phase 2', () => {
  it('renders command, exit chip, duration, and cwd from the projection', () => {
    render(
      <AssistantTerminal
        detail={detail({
          command: 'pnpm vestara doctor',
          cwd: 'vestara-ai-core',
          exitCode: 0,
          durationMs: 4876,
          outputPreview: 'healthy',
        })}
      />,
    );
    expect(screen.getByTestId('assistant-terminal')).toBeTruthy();
    expect(screen.getByTestId('terminal-exit-code').textContent).toContain('exit 0');
    expect(screen.getByTestId('terminal-duration').textContent).toContain('4.9s');
    expect(screen.getByTestId('terminal-cwd').textContent).toContain('vestara-ai-core');
    // Output collapsed by default — hint only, no Copy yet.
    expect(screen.queryByTestId('terminal-output')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy terminal output' })).toBeNull();
  });

  it('expanding reveals scrollback output with Copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    render(
      <AssistantTerminal
        detail={detail({ command: 'pnpm test', exitCode: 1, outputPreview: 'line1\nline2' })}
      />,
    );
    fireEvent.click(screen.getByTestId('terminal-toggle'));
    expect(screen.getByTestId('terminal-output').textContent).toContain('line1');
    const copy = screen.getByRole('button', { name: 'Copy terminal output' });
    fireEvent.click(copy);
    await screen.findByText('Copied');
    expect(writeText).toHaveBeenCalledWith('line1\nline2');
  });

  it('running without authoritative duration shows client-observed elapsed', () => {
    render(<AssistantTerminal detail={detail({ state: 'running', command: 'pnpm test' })} />);
    expect(screen.getByTestId('terminal-elapsed')).toBeTruthy();
    expect(screen.queryByTestId('terminal-duration')).toBeNull();
  });

  it('fabricates nothing: absent fields render no chips or output', () => {
    render(<AssistantTerminal detail={detail({})} />);
    expect(screen.queryByTestId('terminal-exit-code')).toBeNull();
    expect(screen.queryByTestId('terminal-duration')).toBeNull();
    expect(screen.queryByTestId('terminal-elapsed')).toBeNull();
    expect(screen.queryByTestId('terminal-cwd')).toBeNull();
    expect(screen.queryByTestId('terminal-output')).toBeNull();
  });
});
