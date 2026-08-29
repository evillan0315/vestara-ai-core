import { useMemo } from 'react';
import { useThemeBuilder } from '../../../../../lib/theme-builder-context';
import type { TokenCategory } from '../../../../../lib/theme';
import { TokenCategorySection } from './TokenCategorySection';
import { surface, focus } from '../../../settings-ui';

const CATEGORY_ORDER: TokenCategory[] = [
  'color-accent',
  'color-bg',
  'color-surface',
  'color-border',
  'color-text',
  'color-focus',
  'color-status',
  'spacing',
  'radius',
  'shadow',
  'motion',
  'typography',
];

const CATEGORY_LABELS: Record<TokenCategory, string> = {
  'color-accent': 'Accent Colors',
  'color-bg': 'Background',
  'color-surface': 'Surface',
  'color-border': 'Borders',
  'color-text': 'Text',
  'color-focus': 'Focus',
  'color-status': 'Status',
  'spacing': 'Spacing',
  'radius': 'Radius',
  'shadow': 'Shadows',
  'motion': 'Motion',
  'typography': 'Typography',
};

export function TokenEditor() {
  const { getTokensByCategory, editingTheme } = useThemeBuilder();

  const categorySections = useMemo(() => {
    return CATEGORY_ORDER.map((category) => {
      const tokens = getTokensByCategory(category);
      if (tokens.length === 0) return null;
      return (
        <TokenCategorySection
          key={category}
          category={category}
          label={CATEGORY_LABELS[category]}
          tokens={tokens}
        />
      );
    });
  }, [getTokensByCategory]);

  return (
    <div className="space-y-4" role="region" aria-label="Token editor">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))]">
          Semantic Tokens
        </h3>
        {editingTheme && (
          <span className="text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
            Editing: <span className="font-mono">{editingTheme.name}</span>
          </span>
        )}
      </div>
      <div className={surface} role="list" aria-label="Token categories">
        {categorySections}
      </div>
    </div>
  );
}