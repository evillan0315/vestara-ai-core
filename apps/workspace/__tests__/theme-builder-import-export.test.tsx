import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ThemeBuilderProvider } from '../src/lib/theme-builder-context';
import { ToastProvider } from '../src/components/Toast';
import { ImportExport } from '../src/pages/Settings/components/ThemeBuilder/ImportExport/ImportExport';

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <ThemeBuilderProvider>
      <ToastProvider>
        {ui}
      </ToastProvider>
    </ThemeBuilderProvider>,
  );
}

describe('ImportExport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders three tabs: Import, Export, Share', () => {
    renderWithProviders(<ImportExport />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(3);
    expect(tabs[0].textContent).toContain('Import');
    expect(tabs[1].textContent).toContain('Export');
    expect(tabs[2].textContent).toContain('Share');
  });

  it('shows Import panel by default', () => {
    renderWithProviders(<ImportExport />);

    const importHeadings = screen.getAllByText('Import Themes');
    expect(importHeadings.length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Open Import Dialog/i })).toBeTruthy();
  });

  it('switches to Export panel when Export tab clicked', () => {
    renderWithProviders(<ImportExport />);

    fireEvent.click(screen.getByRole('tab', { name: /Export/i }));
    const exportHeadings = screen.getAllByText('Export Themes');
    expect(exportHeadings.length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Open Export Dialog/i })).toBeTruthy();
  });

  it('switches to Share panel when Share tab clicked', () => {
    renderWithProviders(<ImportExport />);

    fireEvent.click(screen.getByRole('tab', { name: /Share/i }));
    const shareHeadings = screen.getAllByText('Share Theme');
    expect(shareHeadings.length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Open Share Dialog/i })).toBeTruthy();
  });

  it('tabs have proper ARIA attributes', () => {
    renderWithProviders(<ImportExport />);

    const importTab = screen.getByRole('tab', { name: /Import/i });
    const exportTab = screen.getByRole('tab', { name: /Export/i });
    const shareTab = screen.getByRole('tab', { name: /Share/i });

    expect(importTab.getAttribute('aria-selected')).toBe('true');
    expect(exportTab.getAttribute('aria-selected')).toBe('false');
    expect(shareTab.getAttribute('aria-selected')).toBe('false');
    expect(importTab.getAttribute('aria-controls')).toBe('import-panel');
    expect(exportTab.getAttribute('aria-controls')).toBe('export-panel');
    expect(shareTab.getAttribute('aria-controls')).toBe('share-panel');
  });

  it('panels have proper ARIA attributes', () => {
    renderWithProviders(<ImportExport />);

    const importPanel = screen.getByRole('tabpanel', { name: /Import/i });
    expect(importPanel.getAttribute('aria-labelledby')).toBe('import-tab');
    expect(importPanel.hasAttribute('hidden')).toBe(false);

    // Switch to export tab and check its panel
    fireEvent.click(screen.getByRole('tab', { name: /Export/i }));
    const exportPanel = screen.getByRole('tabpanel', { name: /Export/i });
    expect(exportPanel.hasAttribute('hidden')).toBe(false);
  });

  it('renders Import panel content', () => {
    renderWithProviders(<ImportExport />);

    expect(screen.getByText(/Import themes from JSON files/i)).toBeTruthy();
    expect(screen.getByText(/Drag & drop .json files or paste JSON/i)).toBeTruthy();
    expect(screen.getByText(/Supported formats:/i)).toBeTruthy();
    expect(screen.getByText(/Merge strategies:/i)).toBeTruthy();
    expect(screen.getByText(/Validation:/i)).toBeTruthy();
  });

  it('renders Export panel content', () => {
    renderWithProviders(<ImportExport />);

    fireEvent.click(screen.getByRole('tab', { name: /Export/i }));

    expect(screen.getByText(/Export themes as .vestara-theme.json files/i)).toBeTruthy();
    expect(screen.getByText(/theme-name.vestara-theme.json/i)).toBeTruthy();
    expect(screen.getByText(/vestara-themes.json/i)).toBeTruthy();
    expect(screen.getByText(/Clipboard:/i)).toBeTruthy();
  });

  it('renders Share panel content', () => {
    renderWithProviders(<ImportExport />);

    fireEvent.click(screen.getByRole('tab', { name: /Share/i }));

    expect(screen.getByText(/Generate a shareable URL/i)).toBeTruthy();
    expect(screen.getByText(/URL format:/i)).toBeTruthy();
    expect(screen.getByText(/QR Code:/i)).toBeTruthy();
    expect(screen.getByText(/No server:/i)).toBeTruthy();
  });
});