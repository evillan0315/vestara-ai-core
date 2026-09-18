// @vitest-environment jsdom
import * as fs from 'node:fs';
import * as path from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../src/lib/theme.js';
import {
  CaptureControl,
  capabilityFor,
  type CaptureCapabilityEntry,
} from '../src/components/capture/CaptureControl.js';

/** M3A-shaped environment: screenshots usable, recording unavailable. */
const M3A_CAPABILITIES: readonly CaptureCapabilityEntry[] = [
  { operation: 'screenshot', scope: 'display', supported: true, reason: 'x11 backend ready' },
  { operation: 'screenshot', scope: 'window', supported: true, reason: 'x11 window backend ready' },
  {
    operation: 'screenshot',
    scope: 'region',
    supported: true,
    reason: 'explicit geometry within 1920x1080',
  },
  { operation: 'recording', scope: 'display', supported: false, reason: 'recording is not implemented' },
  { operation: 'recording', scope: 'window', supported: false, reason: 'recording is not implemented' },
  { operation: 'recording', scope: 'region', supported: false, reason: 'recording is not implemented' },
];

function renderControl(props?: Partial<React.ComponentProps<typeof CaptureControl>>) {
  return render(
    <ThemeProvider>
      <CaptureControl capabilities={M3A_CAPABILITIES} {...props} />
    </ThemeProvider>,
  );
}

afterEach(() => cleanup());

describe('CaptureControl compact trigger', () => {
  it('renders one Capture control rather than six permanent buttons', () => {
    renderControl();
    expect(screen.getByRole('button', { name: 'Capture screen' })).toBeDefined();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens a menu with screenshot and recording sections', () => {
    renderControl();
    fireEvent.click(screen.getByRole('button', { name: 'Capture screen' }));
    expect(screen.getByRole('menu', { name: 'Capture actions' })).toBeDefined();
    expect(screen.getByText('Screenshot')).toBeDefined();
    expect(screen.getByText('Record Screen')).toBeDefined();
    expect(screen.getByRole('button', { name: 'screenshot Entire Screen' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'recording Region' })).toBeDefined();
  });
});

describe('capability-driven availability', () => {
  it('enables supported actions and disables the rest with reasons', () => {
    renderControl();
    fireEvent.click(screen.getByRole('button', { name: 'Capture screen' }));
    const displayShot = screen.getByRole('button', { name: 'screenshot Entire Screen' });
    expect(displayShot.getAttribute('disabled')).toBeNull();
    const recordDisplay = screen.getByRole('button', { name: 'recording Entire Screen' });
    expect(recordDisplay.getAttribute('disabled')).not.toBeNull();
    expect(recordDisplay.getAttribute('title')).toBe('recording is not implemented');
  });

  it('reflects window gating from capability data, not hardcode', () => {
    const gated = M3A_CAPABILITIES.map((entry) =>
      entry.operation === 'screenshot' && entry.scope === 'window'
        ? { ...entry, supported: false, reason: 'no mapped window in this session' }
        : entry,
    );
    renderControl({ capabilities: gated });
    fireEvent.click(screen.getByRole('button', { name: 'Capture screen' }));
    const windowShot = screen.getByRole('button', { name: 'screenshot Window' });
    expect(windowShot.getAttribute('disabled')).not.toBeNull();
    expect(windowShot.getAttribute('title')).toBe('no mapped window in this session');
  });

  it('dispatches the operation/scope pair without capturing itself', () => {
    const onAction = vi.fn();
    renderControl({ onAction });
    fireEvent.click(screen.getByRole('button', { name: 'Capture screen' }));
    fireEvent.click(screen.getByRole('button', { name: 'screenshot Window' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith({ operation: 'screenshot', scope: 'window' });
  });
});

describe('capture states', () => {
  it.each([
    ['requesting-permission', 'Requesting permission…'],
    ['selecting', 'Waiting for OS selection…'],
    ['capturing', 'Capturing…'],
    ['finalizing', 'Finalizing evidence…'],
    ['completed', 'Capture attached'],
    ['cancelled', 'Capture cancelled'],
    ['failed', 'Capture failed'],
  ] as const)('renders the %s state', (state, label) => {
    renderControl({ state });
    expect(screen.getByText(label)).toBeDefined();
  });

  it('surfaces failure detail and dismiss', () => {
    const onCancel = vi.fn();
    renderControl({ state: 'failed', lastError: 'xwd failed: BadMatch', onCancel });
    expect(screen.getByRole('alert').textContent).toBe('xwd failed: BadMatch');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss capture error' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('offers cancel while busy', () => {
    const onCancel = vi.fn();
    renderControl({ state: 'capturing', onCancel });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel capture' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('reserves a visible recording indicator for M4', () => {
    renderControl({ state: 'recording', onCancel: () => undefined });
    expect(screen.getByText('REC')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Stop recording' })).toBeDefined();
  });
});

describe('capabilityFor', () => {
  it('resolves entries and fails closed on unknown pairs', () => {
    expect(capabilityFor(M3A_CAPABILITIES, 'screenshot', 'display').supported).toBe(true);
    expect(capabilityFor(M3A_CAPABILITIES, 'recording', 'region').supported).toBe(false);
    expect(capabilityFor([], 'screenshot', 'display').supported).toBe(false);
  });
});

describe('domain boundaries', () => {
  it('imports no Activity Room or Global Assistant contracts', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../src/components/capture/CaptureControl.tsx'),
      'utf8',
    );
    const imports = source.split('\n').filter((line) => line.startsWith('import '));
    expect(imports.join('\n')).not.toMatch(/activity-room/i);
    expect(imports.join('\n')).not.toMatch(/assistant/i);
    expect(source).not.toMatch(/style=\{\{/);
  });
});
