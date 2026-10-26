/**
 * "Start from a template" — Orchestration creation presets on the Assistant
 * launch surface.
 *
 * Presentation only. The resolver maps the authoritative catalog
 * (`GET /api/orchestration/templates`) to suggestions; this component renders
 * them and reports intent.
 *
 * Authority:
 * - Prefill navigates to the Orchestration creation surface. It never creates.
 * - Run is explicit and only rendered when the caller can mutate.
 */

import type { AssistantSuggestion } from './assistantSuggestionResolver';

export interface AssistantTemplateSuggestionsProps {
  readonly suggestions: readonly AssistantSuggestion[];
  /** True only for editor/admin — the server still enforces the role. */
  readonly canRun: boolean;
  readonly runningTemplateId: string | null;
  readonly error: string | null;
  readonly onPrefill: (templateId: string) => void;
  readonly onRun: (templateId: string) => void;
}

export function AssistantTemplateSuggestions({
  suggestions,
  canRun,
  runningTemplateId,
  error,
  onPrefill,
  onRun,
}: AssistantTemplateSuggestionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="w-full" data-testid="assistant-template-section" aria-label="Start from a template">
      <div className="mb-2 text-[length:var(--vestara-font-size-xs)] font-semibold uppercase tracking-wide text-[var(--vestara-text-muted)]">
        Start from a template
      </div>
      <div className="flex flex-col gap-[var(--vestara-spacing-2)]">
        {suggestions.map((suggestion) => {
          const templateId = suggestion.action?.templateId;
          const running = templateId !== undefined && runningTemplateId === templateId;
          const busy = runningTemplateId !== null;
          return (
            <div
              key={suggestion.id}
              className="flex items-stretch gap-[var(--vestara-spacing-2)] rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-shell)] p-[var(--vestara-spacing-2)]"
            >
              <button
                type="button"
                onClick={() => templateId && onPrefill(templateId)}
                disabled={busy}
                data-testid={templateId ? `assistant-template-${templateId}` : 'assistant-template'}
                aria-label={`Use the ${suggestion.label} template`}
                title={suggestion.prompt}
                className="group flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-[var(--vestara-radius-md)] px-[var(--vestara-spacing-2)] py-[var(--vestara-spacing-1)] text-left transition-colors hover:bg-[var(--vestara-surface-interactive)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="truncate text-[length:var(--vestara-font-size-sm)] font-semibold text-[var(--vestara-text-primary)]">
                  {suggestion.label}
                </span>
                {suggestion.description ? (
                  <span className="line-clamp-2 text-[length:var(--vestara-font-size-xs)] leading-snug text-[var(--vestara-text-muted)]">
                    {suggestion.description}
                  </span>
                ) : null}
              </button>
              {canRun && templateId ? (
                <button
                  type="button"
                  onClick={() => onRun(templateId)}
                  disabled={busy}
                  data-testid={`assistant-template-run-${templateId}`}
                  className="shrink-0 self-center rounded-[var(--vestara-radius-md)] border border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)] px-[var(--vestara-spacing-2)] py-[var(--vestara-spacing-1)] text-[length:var(--vestara-font-size-xs)] font-semibold text-[var(--vestara-accent-text)] transition-colors hover:border-[var(--vestara-accent-border-active)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {running ? 'Starting…' : 'Create & run'}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="mt-[var(--vestara-spacing-2)] text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-status-error)]">
          {error}
        </p>
      ) : null}
      <p className="mt-[var(--vestara-spacing-2)] text-[length:var(--vestara-font-size-xs)] leading-relaxed text-[var(--vestara-text-muted)]">
        Opens the Orchestration creation form with the template applied. Nothing starts until you confirm.
      </p>
    </div>
  );
}
