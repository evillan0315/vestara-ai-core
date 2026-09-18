// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ThemeProvider } from '../src/lib/theme.js';
import { FileOperationsProvider } from '../src/contexts/FileOperationsContext.js';
import { filesFixture } from '../src/features/files/files.fixtures.js';
import Files from '../src/pages/Files.js';

vi.mock('../src/features/files/hooks/useFiles', () => ({
  useFiles: () => ({
    data: filesFixture,
    isLoading: false,
    error: null as string | null,
    refetch: vi.fn().mockResolvedValue(undefined),
  }),
}));

function renderFiles() {
  return render(
    <ThemeProvider>
      <FileOperationsProvider>
        <Files />
      </FileOperationsProvider>
    </ThemeProvider>,
  );
}

afterEach(() => cleanup());

describe('Files canonical composition', () => {
  it('renders hero, toolbar, explorer, work area, and inspector', () => {
    renderFiles();
    expect(screen.getAllByText('Files').length).toBeGreaterThan(0);
    expect(screen.getByText(/every read, write, and search agents perform/)).toBeDefined();
    expect(screen.getAllByText('vestara-ai-core').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /New/ })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Upload (unavailable)' })).toBeDisabled();
    expect(screen.getByLabelText('Search files by name, path, or content')).toBeDefined();
    expect(screen.getByRole('tree', { name: 'Repository tree' })).toBeDefined();
    expect(screen.getByRole('tablist', { name: 'Work area modes' })).toBeDefined();
    expect(screen.getAllByText('Inspector').length).toBeGreaterThan(0);
  });

  it('keeps file operations and execution audit off the Files page', () => {
    renderFiles();
    expect(screen.queryByRole('status', { name: 'File operations' })).toBeNull();
    expect(screen.queryByText('Execution audit')).toBeNull();
    expect(screen.queryByText('Storage intelligence')).toBeNull();
  });

  it('shows authoritative metrics, never hardcoded mockups', () => {
    renderFiles();
    expect(screen.getByLabelText(/Workspace metrics: \d+ files, \d+ directories/)).toBeDefined();
    expect(screen.queryByText('3,986 Files')).toBeNull();
    expect(screen.queryByText('677 MB Storage')).toBeNull();
  });

  it('expands tree nodes and navigates the directory table', () => {
    renderFiles();
    const tree = screen.getByRole('tree', { name: 'Repository tree' });
    const appsRow = within(tree).getByTitle('apps');
    fireEvent.click(appsRow);
    expect(within(tree).getByTitle('apps/api')).toBeDefined();

    const crumb = screen.getByRole('navigation', { name: 'Directory breadcrumb' });
    fireEvent.click(within(crumb).getByText('vestara-ai-core'));
  });

  it('filters the directory by type select', () => {
    renderFiles();
    const typeSelect = screen.getByLabelText('Filter by type');
    fireEvent.change(typeSelect, { target: { value: 'dir' } });
    expect(screen.queryByTitle('package.json')).toBeNull();
    fireEvent.change(typeSelect, { target: { value: 'file' } });
    expect(screen.getAllByTitle('package.json').length).toBeGreaterThan(0);
    fireEvent.change(typeSelect, { target: { value: 'all' } });
  });

  it('toggles hidden files through the Filters popover', () => {
    renderFiles();
    fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
    const dialog = screen.getByRole('dialog', { name: 'Display filters' });
    const hidden = within(dialog).getByLabelText('Show hidden files');
    expect((hidden as HTMLInputElement).checked).toBe(false);
    fireEvent.click(hidden);
    expect((hidden as HTMLInputElement).checked).toBe(true);
    const grouping = within(dialog).getByLabelText('Group directories first');
    expect((grouping as HTMLInputElement).checked).toBe(true);
  });

  it('opens the context menu from the directory row kebab', () => {
    renderFiles();
    fireEvent.click(screen.getByRole('button', { name: 'Actions for package.json' }));
    const menu = screen.getByRole('menu');
    expect(menu.getAttribute('aria-label')).toBe('Actions for package.json');
    expect(within(menu).getByRole('menuitem', { name: 'Rename…' })).toBeDefined();
  });

  it('selects a node and synchronizes the inspector', () => {
    renderFiles();
    const tree = screen.getByRole('tree', { name: 'Repository tree' });
    fireEvent.click(within(tree).getByTitle('package.json'));
    expect(screen.getByRole('tab', { name: 'details' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Open' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Open in Editor' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Download' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Copy Relative Path' })).toBeDefined();
    // Git/References stay visibly held, never fixture-filled
    expect(screen.getByRole('tab', { name: 'git' })).toBeDisabled();
    expect(screen.getByRole('tab', { name: 'references' })).toBeDisabled();
  });

  it('keeps three-pane dominance in the responsive grid', () => {
    const { container } = renderFiles();
    expect(container.innerHTML).toContain('xl:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)_minmax(16rem,20rem)]');
  });

  it('adopts Activity Room shell grammar without copying its CSS', () => {
    const { container } = renderFiles();
    expect(container.querySelector('.ar-page')).not.toBeNull();
    expect(container.querySelector('.ar-header')).not.toBeNull();
    expect(container.querySelector('.ar-panel--rail')).not.toBeNull();
    expect(container.querySelector('.ar-panel--main')).not.toBeNull();
    expect(container.querySelector('.ar-panel--context')).not.toBeNull();
    expect(container.querySelector('.ar-kicker')).not.toBeNull();
    expect(screen.getByRole('group', { name: 'Open panels' })).toBeDefined();
  });

  it('opens the explorer as a sheet from the launchers', () => {
    renderFiles();
    fireEvent.click(screen.getByRole('button', { name: /Explorer ·/ }));
    const dialog = screen.getByRole('dialog', { name: 'File explorer' });
    expect(within(dialog).getByRole('tree', { name: 'Repository tree' })).toBeDefined();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'File explorer' })).toBeNull();
  });
});

describe('Files dependency direction', () => {
  it('shares Activity Room primitives via stylesheet import, never domain code', () => {
    for (const file of [
      '../src/features/files/FilesScreen.tsx',
      '../src/features/files/components/FilesWorkspace.tsx',
      '../src/features/files/components/FileTree.tsx',
      '../src/features/files/components/FileInspector.tsx',
    ]) {
      const source = fs.readFileSync(path.resolve(__dirname, file), 'utf8');
      const imports = source.split('\n').filter((line) => line.startsWith('import '));
      // No Activity Room TS/domain imports and no duplicate hero primitive…
      expect(imports.join('\n')).not.toMatch(/pages\/activity|components\/assistant|layout\/PageHero\/PageHero/);
      // …but the shared ar-* stylesheet is the approved reuse channel.
      if (file.endsWith('FilesScreen.tsx')) {
        expect(imports.join('\n')).toMatch(/styles\/activity-room\.css/);
      }
    }
    const workspace = fs.readFileSync(
      path.resolve(__dirname, '../src/features/files/components/FilesWorkspace.tsx'),
      'utf8',
    );
    expect(workspace).toMatch(/from '@vestara\/ui'/);
  });
});
