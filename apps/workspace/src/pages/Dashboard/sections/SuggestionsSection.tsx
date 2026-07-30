import type { DragSectionProps } from '../DashboardSection';
import DashboardSection from '../DashboardSection';

interface Suggestion {
  id: string;
  priority: string;
  title: string;
  description?: string;
  impact?: string;
  category?: string;
}

interface SuggestionsSectionProps {
  suggestions: Suggestion[];
  dragSection: DragSectionProps;
}

const ICON_MAP: Record<string, string> = {
  health: '🩺',
  risk: '⚠️',
  planning: '📋',
  testing: '🧪',
  documentation: '📝',
  architecture: '🏗️',
  dependency: '🔗',
  agent: '🤖',
  milestone: '🎯',
};

export default function SuggestionsSection({ suggestions, dragSection }: SuggestionsSectionProps) {
  if (suggestions.length === 0) return null;

  return (
    <DashboardSection title="Suggestions" icon="💡" dragSection={dragSection}>
      <div className="space-y-2">
        {suggestions.slice(0, 5).map((s, i) => {
          const borderColor = s.priority === 'high' ? '#ef4444' : s.priority === 'medium' ? '#f59e0b' : '#52525b';
          return (
            <div
              key={s.id || i}
              className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg hover:border-(--vestara-accent-border-hover) transition-colors border-l-[3px]"
              style={{ borderLeftColor: borderColor }}
            >
              <div className="flex items-start gap-2">
                <span className="text-sm shrink-0 mt-0.5">{ICON_MAP[s.category || ''] || '💡'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-(--vestara-text) font-medium">{s.title}</span>
                    <span
                      className={`text-[8px] px-1 py-0.5 rounded uppercase font-semibold ${s.priority === 'high' ? 'bg-red-400/10 text-red-400' : s.priority === 'medium' ? 'bg-amber-400/10 text-amber-400' : 'bg-zinc-800 text-(--vestara-text-2)'}`}
                    >
                      {s.priority}
                    </span>
                  </div>
                  {s.description && <div className="text-[10px] text-(--vestara-text-2) mt-0.5">{s.description}</div>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </DashboardSection>
  );
}
