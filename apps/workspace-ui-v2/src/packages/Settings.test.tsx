/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsPkg } from './Settings';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SettingsPkg sections', () => {
  it('opens on Shell & TopBar and switches to Appearance', async () => {
    render(<SettingsPkg />);
    expect(await screen.findByText('TOPBAR • 32PX SMALL CLEAN')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
    });
    expect(await screen.findByRole('combobox', { name: 'Accent theme' })).toBeTruthy();
    expect(screen.queryByText('TOPBAR • 32PX SMALL CLEAN')).toBeNull();
  });

  it('shows the registry note for sections without controls', async () => {
    render(<SettingsPkg />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Network' }));
    });
    expect(await screen.findByText(/No controls registered for this section yet/)).toBeTruthy();
  });
});
