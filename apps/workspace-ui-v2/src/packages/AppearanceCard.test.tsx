/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { SHELL_APPEARANCE_STORAGE_KEY } from '../lib/workspace-settings-model';
import { AppearanceCard } from './AppearanceCard';

afterEach(() => {
  cleanup();
  localStorage.removeItem(SHELL_APPEARANCE_STORAGE_KEY);
  document.documentElement.style.removeProperty('--vestara-accent-shell');
  document.documentElement.style.removeProperty('--vestara-accent-shell-glow');
  document.documentElement.style.removeProperty('--vestara-sizing-topbar-height');
});

describe('AppearanceCard', () => {
  it('lists every registered accent theme and persists the selection', async () => {
    render(<AppearanceCard />);
    const select = (await screen.findByRole('combobox', { name: 'Accent theme' })) as HTMLSelectElement;
    expect(select.options).toHaveLength(8);
    expect(select.value).toBe('shell');
    await act(async () => {
      fireEvent.change(select, { target: { value: 'violet' } });
    });
    expect(JSON.parse(localStorage.getItem(SHELL_APPEARANCE_STORAGE_KEY) ?? '{}')).toMatchObject({
      accentTheme: 'violet',
    });
    expect(document.documentElement.style.getPropertyValue('--vestara-accent-shell')).toBe(
      'var(--vestara-accent-theme-violet)',
    );
  });

  it('toggles TopBar density through the framework-validated switch', async () => {
    render(<AppearanceCard />);
    const toggle = await screen.findByRole('switch', { name: 'Compact TopBar' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(document.documentElement.style.getPropertyValue('--vestara-sizing-topbar-height')).toBe(
      'var(--vestara-sizing-topbar-height-comfortable)',
    );
  });
});
