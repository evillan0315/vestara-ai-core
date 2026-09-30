import { useEffect, useMemo, useState } from 'react';
import type { ComposerSuggestionCandidate } from '@vestara/shared';
import type { SurfaceContext } from '@vestara/types';
import { applyComposerSuggestion, parseComposerSuggestionCommand, requestComposerSuggestions } from './composerSuggestion';

export interface ComposerSuggestionMenuProps {
  readonly draft: string;
  readonly surfaceContext?: SurfaceContext;
  readonly conversationId?: string | null;
  readonly provider?: string;
  readonly model?: string;
  readonly assistantRuntime?: 'opencode' | 'codex';
  readonly onApply: (draft: string) => void;
  readonly onDismiss: () => void;
}

function candidateText(candidate: ComposerSuggestionCandidate): string | undefined {
  return candidate.text?.trim() || candidate.title.trim() || undefined;
}

export function ComposerSuggestionMenu({
  draft,
  surfaceContext,
  conversationId,
  provider,
  model,
  assistantRuntime,
  onApply,
  onDismiss,
}: ComposerSuggestionMenuProps) {
  const command = useMemo(() => parseComposerSuggestionCommand(draft), [draft]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof requestComposerSuggestions>> | null>(null);

  useEffect(() => {
    if (!command) {
      setResult(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void requestComposerSuggestions({
      draft: command.draft,
      mode: command.mode,
      surfaceContext,
      conversationId: conversationId ?? undefined,
      provider,
      model,
      assistantRuntime,
    })
      .then((next) => {
        if (!cancelled) setResult(next);
      })
      .catch(() => {
        if (!cancelled) setError('Suggestions are unavailable right now.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assistantRuntime, command, conversationId, model, provider, surfaceContext]);

  if (!command) return null;

  const apply = (candidate: ComposerSuggestionCandidate) => {
    const text = candidateText(candidate);
    if (!text) return;
    onApply(applyComposerSuggestion(command.draft, candidate.operation, text));
  };

  return (
    <div
      className="absolute bottom-full left-0 z-20 mb-2 max-h-72 w-full overflow-y-auto rounded-xl border border-(--vestara-border-subtle) bg-(--vestara-surface-panel) p-2 shadow-2xl"
      role="dialog"
      aria-label="Composer suggestions"
      data-testid="composer-suggestion-menu"
    >
      <div className="mb-1 flex items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-(--vestara-text-muted)">
        <span>/suggest {command.mode === 'suggest' ? '' : command.mode}</span>
        <button type="button" onClick={onDismiss} className="ml-auto text-[11px] text-(--vestara-text-muted) hover:text-(--vestara-text-primary)" aria-label="Dismiss suggestions">
          ×
        </button>
      </div>
      {loading && <div className="px-1 py-2 text-[11px] text-(--vestara-text-muted)">Thinking about possible directions…</div>}
      {error && <div className="px-1 py-2 text-[11px] text-(--vestara-status-warning)">{error}</div>}
      {!loading && !error && result?.status === 'ready' && (
        <div className="px-1 py-2 text-[11px] text-(--vestara-text-muted)">Ready to send — no expansion is needed.</div>
      )}
      {!loading && !error && result?.status === 'no_match' && (
        <div className="px-1 py-2 text-[11px] text-(--vestara-text-muted)">{result.message ?? 'No grounded suggestion was found.'}</div>
      )}
      {!loading && !error && result?.candidates.map((candidate) => (
        <button
          key={candidate.id}
          type="button"
          onClick={() => apply(candidate)}
          className="mb-1 block w-full rounded-lg border border-(--vestara-border-subtle) px-2.5 py-2 text-left transition-colors hover:border-(--vestara-border-focus) hover:bg-(--vestara-accent-bg)"
          data-testid="composer-suggestion-candidate"
        >
          <span className="block text-[11px] font-medium text-(--vestara-text-primary)">{candidate.title}</span>
          {candidate.text && <span className="mt-0.5 block line-clamp-3 text-[10px] leading-relaxed text-(--vestara-text-secondary)">{candidate.text}</span>}
          {candidate.rationale && <span className="mt-1 block text-[9px] text-(--vestara-text-muted)">{candidate.rationale}</span>}
          {candidate.context.length > 0 && (
            <span className="mt-1 block text-[9px] text-(--vestara-text-muted)">
              Based on: {candidate.context.map((item) => `${item.label} ${item.detail}`).join(' · ')}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
