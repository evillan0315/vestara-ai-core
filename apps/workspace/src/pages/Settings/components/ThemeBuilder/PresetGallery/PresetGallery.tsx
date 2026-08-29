import { useCallback, useMemo, useRef, useState } from 'react';
import type { CustomTheme } from '../../../../../lib/theme.js';
import { useThemeBuilder } from '../../../../../lib/theme-builder-context.js';
import { Button, focus, input } from '../../../settings-ui.js';
import { CreateFromPreset } from './CreateFromPreset.js';
import { PresetCard } from './PresetCard.js';

type TabType = 'built-in' | 'custom';

export function PresetGallery() {
  const { builtInThemes, customThemes, loadTheme, saveTheme, deleteTheme, createFromPreset, applyThemeToPreview } =
    useThemeBuilder();

  const [activeTab, setActiveTab] = useState<TabType>('built-in');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedBaseTheme, setSelectedBaseTheme] = useState<CustomTheme | null>(null);
  const [editingCustomTheme, setEditingCustomTheme] = useState<CustomTheme | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [_dragOverId, setDragOverId] = useState<string | null>(null);
  const galleryRef = useRef<HTMLDivElement>(null);

  const filteredBuiltIn = useMemo(() => {
    if (!searchQuery) return builtInThemes;
    const q = searchQuery.toLowerCase();
    return builtInThemes.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.baseThemeId.toLowerCase().includes(q),
    );
  }, [builtInThemes, searchQuery]);

  const filteredCustom = useMemo(() => {
    if (!searchQuery) return customThemes;
    const q = searchQuery.toLowerCase();
    return customThemes.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.baseThemeId.toLowerCase().includes(q),
    );
  }, [customThemes, searchQuery]);

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDragOverId(null);
  }, []);

  const _handleDragOver = useCallback(
    (e: React.DragEvent, id: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (id !== draggedId) {
        setDragOverId(id);
      }
    },
    [draggedId],
  );

  const _handleDragLeave = useCallback((e: React.DragEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      setDragOverId(null);
    }
  }, []);

  const _handleDrop = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      const sourceId = e.dataTransfer.getData('text/plain');
      if (!sourceId || sourceId === targetId) {
        setDraggedId(null);
        setDragOverId(null);
        return;
      }

      const sourceIndex = customThemes.findIndex((t) => t.id === sourceId);
      const targetIndex = customThemes.findIndex((t) => t.id === targetId);

      if (sourceIndex === -1 || targetIndex === -1) {
        setDraggedId(null);
        setDragOverId(null);
        return;
      }

      const newCustomThemes = [...customThemes];
      const [removed] = newCustomThemes.splice(sourceIndex, 1);
      newCustomThemes.splice(targetIndex, 0, removed);

      // Update the context - we need to persist the new order
      // This will trigger the persistCustomThemes effect in ThemeBuilderProvider
      // We'll need to access the setCustomThemes from context, but it's not exposed
      // For now, we'll store the order in localStorage directly
      try {
        localStorage.setItem('vestara-custom-themes', JSON.stringify(newCustomThemes));
        // Force a re-render by updating the context
        window.dispatchEvent(new CustomEvent('vestara-custom-themes-updated', { detail: newCustomThemes }));
      } catch {}

      setDraggedId(null);
      setDragOverId(null);
    },
    [customThemes],
  );

  const handleCustomize = useCallback(
    (theme: CustomTheme) => {
      if (theme.isBuiltIn) {
        setSelectedBaseTheme(theme);
        setShowCreateDialog(true);
      } else {
        loadTheme(theme);
        setEditingCustomTheme(theme);
        setShowCreateDialog(true);
      }
    },
    [loadTheme],
  );

  const handleApply = useCallback(
    (theme: CustomTheme) => {
      applyThemeToPreview(theme);
      // Also apply to main theme context
      // The applyThemeToPreview already applies to document.documentElement
    },
    [applyThemeToPreview],
  );

  const handleDuplicate = useCallback(
    (theme: CustomTheme) => {
      const duplicated = createFromPreset(theme.id, {
        name: `Copy of ${theme.name}`,
        description: `Duplicated from ${theme.name}`,
      });
      saveTheme(duplicated);
    },
    [createFromPreset, saveTheme],
  );

  const handleDelete = useCallback(
    (theme: CustomTheme) => {
      deleteTheme(theme.id);
    },
    [deleteTheme],
  );

  const handleExport = useCallback((theme: CustomTheme) => {
    const json = JSON.stringify(theme, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${theme.name.toLowerCase().replace(/\s+/g, '-')}.vestara-theme.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const handleCreateSubmit = useCallback(
    (newTheme: CustomTheme) => {
      if (editingCustomTheme) {
        saveTheme(newTheme);
      } else {
        saveTheme(newTheme);
        loadTheme(newTheme);
      }
      setEditingCustomTheme(null);
      setSelectedBaseTheme(null);
    },
    [editingCustomTheme, saveTheme, loadTheme],
  );

  const currentThemes = activeTab === 'built-in' ? filteredBuiltIn : filteredCustom;
  const isCustomEmpty = customThemes.length === 0;

  return (
    <section className="flex flex-col h-full" aria-label="Theme Preset Gallery">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 border-b border-[var(--vestara-color-border-subtle,var(--color-zinc-800))]">
        <div className="flex items-center gap-2" role="tablist" aria-label="Theme type">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'built-in'}
            aria-controls="built-in-panel"
            id="built-in-tab"
            onClick={() => setActiveTab('built-in')}
            className={`px-3 py-1.5 text-xs font-medium rounded-[var(--vestara-radius)] transition-colors ${focus} ${
              activeTab === 'built-in'
                ? 'bg-[var(--vestara-accent-bg)] text-[var(--vestara-accent-text)] border border-[var(--vestara-accent-border)]'
                : 'text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] hover:text-[var(--vestara-color-text-primary,var(--vestara-text))] hover:bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))]'
            }`}
          >
            Built-in ({builtInThemes.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'custom'}
            aria-controls="custom-panel"
            id="custom-tab"
            onClick={() => setActiveTab('custom')}
            className={`px-3 py-1.5 text-xs font-medium rounded-[var(--vestara-radius)] transition-colors ${focus} ${
              activeTab === 'custom'
                ? 'bg-[var(--vestara-accent-bg)] text-[var(--vestara-accent-text)] border border-[var(--vestara-accent-border)]'
                : 'text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] hover:text-[var(--vestara-color-text-primary,var(--vestara-text))] hover:bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))]'
            }`}
          >
            Custom ({customThemes.length})
          </button>
        </div>

        <div className="relative flex-1 max-w-xs">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search themes..."
            className={`${input} pl-9 pr-3 w-full`}
            aria-label="Search themes"
          />
        </div>

        {activeTab === 'custom' && (
          <Button
            onClick={() => {
              setSelectedBaseTheme(null);
              setEditingCustomTheme(null);
              setShowCreateDialog(true);
            }}
            primary
            className="text-xs px-3 py-1.5"
          >
            <svg className="size-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Theme
          </Button>
        )}
      </div>

      <div
        role="tabpanel"
        id={activeTab === 'built-in' ? 'built-in-panel' : 'custom-panel'}
        aria-labelledby={activeTab === 'built-in' ? 'built-in-tab' : 'custom-tab'}
        className="flex-1 overflow-auto p-3"
        ref={galleryRef}
      >
        {currentThemes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            {activeTab === 'custom' && isCustomEmpty ? (
              <>
                <svg
                  className="size-16 text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                  />
                </svg>
                <h3 className="mt-4 text-sm font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))]">
                  No Custom Themes Yet
                </h3>
                <p className="mt-1 text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] max-w-xs">
                  Create your first custom theme by customizing a built-in preset or starting from scratch.
                </p>
                <Button
                  onClick={() => {
                    setSelectedBaseTheme(null);
                    setEditingCustomTheme(null);
                    setShowCreateDialog(true);
                  }}
                  primary
                  className="mt-4 text-xs px-4 py-2"
                >
                  <svg
                    className="size-3.5 mr-1.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create Your First Theme
                </Button>
              </>
            ) : (
              <>
                <svg
                  className="size-16 text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <h3 className="mt-4 text-sm font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))]">
                  No Themes Found
                </h3>
                <p className="mt-1 text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                  Try adjusting your search terms.
                </p>
              </>
            )}
          </div>
        ) : (
          <ul
            className="grid gap-3"
            style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            }}
            aria-label={`${activeTab === 'built-in' ? 'Built-in' : 'Custom'} themes`}
          >
            {currentThemes.map((theme) => (
              <PresetCard
                key={theme.id}
                theme={theme}
                onCustomize={() => handleCustomize(theme)}
                onApply={() => handleApply(theme)}
                onDuplicate={() => handleDuplicate(theme)}
                onDelete={() => handleDelete(theme)}
                onExport={() => handleExport(theme)}
                isDragging={draggedId === theme.id}
                dragHandleProps={
                  !theme.isBuiltIn
                    ? {
                        onDragStart: (e) => handleDragStart(e, theme.id),
                        onDragEnd: handleDragEnd,
                      }
                    : undefined
                }
              />
            ))}
          </ul>
        )}
      </div>

      <CreateFromPreset
        open={showCreateDialog}
        onClose={() => {
          setShowCreateDialog(false);
          setSelectedBaseTheme(null);
          setEditingCustomTheme(null);
        }}
        baseTheme={selectedBaseTheme}
        existingTheme={editingCustomTheme}
        onSubmit={handleCreateSubmit}
      />
    </section>
  );
}
