/**
 * Interactive assistant response blocks.
 *
 * Renders parsed Fix / Validation / Files-changed / Verification / Suggestion
 * structure beneath the assistant markdown as navigable cards. Presentation
 * only — every action is explicit user intent:
 * - fix file refs → `onOpenFile` (copies path per the existing affordance)
 * - fix route refs → in-app navigation when the route exists in the manifest,
 *   otherwise an honest "Planned" badge (future screen, never a dead link)
 * - validation rows → Evidence button navigates to the Activity Room, the
 *   runtime evidence authority (no inline evidence is fabricated)
 * - suggestion chips → `onSuggest` sends the chip text as a follow-up turn,
 *   the same precedent as composer suggestion shortcuts
 *
 * Renders nothing when the parser finds no blocks.
 */

import { memo, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { APP_ROUTES } from '../../routes';
import { hasResponseBlocks, parseResponseBlocks } from './assistantResponseBlocks';

export interface AssistantResponseBlocksProps {
  readonly content: string;
  readonly onOpenFile?: (file: string) => void;
  readonly onSuggest?: (text: string) => void;
}

function manifestRouteFor(token: string): { path: string; title: string; enabled: boolean } | null {
  const route = APP_ROUTES.find((entry) => entry.path === token);
  if (!route || route.redirect) return null;
  return { path: route.path, title: route.title, enabled: route.enabled !== false };
}

function SectionLabel({ children }: { children: string }) {
  return (
    <span className="text-(--vestara-font-size-caption) font-semibold uppercase tracking-wider text-[var(--vestara-text-muted)]">
      {children}
    </span>
  );
}

export const AssistantResponseBlocks = memo(function AssistantResponseBlocks({
  content,
  onOpenFile,
  onSuggest,
}: AssistantResponseBlocksProps) {
  const navigate = useNavigate();
  const blocks = useMemo(() => parseResponseBlocks(content), [content]);
  const visible = useMemo(() => hasResponseBlocks(blocks), [blocks]);
  if (!visible) return null;

  return (
    <div className="mt-2 min-w-0 space-y-2" data-testid="assistant-response-blocks">
      {blocks.fixes.length > 0 && (
        <div className="min-w-0 space-y-1.5" data-testid="response-fixes">
          <SectionLabel>Fixes</SectionLabel>
          {blocks.fixes.map((fix) => (
            <div
              key={fix.key}
              data-testid="response-fix"
              className="min-w-0 rounded-[var(--vestara-radius-md)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-[var(--vestara-spacing-2)] py-[var(--vestara-spacing-1)]"
            >
              <div className="flex min-w-0 items-start gap-2">
                <span className="shrink-0 rounded-[var(--vestara-radius-sm)] bg-[var(--vestara-surface-interactive)] px-1.5 py-0.5 font-mono text-(--vestara-font-size-caption) font-semibold text-[var(--vestara-accent-text)]">
                  {fix.key}
                </span>
                <span className="min-w-0 flex-1 text-(--vestara-font-size-body-small) leading-snug text-[var(--vestara-text-primary)]">
                  {fix.title}
                </span>
              </div>
              {(fix.fileRefs.length > 0 || fix.routeRefs.length > 0) && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {fix.fileRefs.map((file) => (
                    <button
                      key={file}
                      type="button"
                      onClick={() => onOpenFile?.(file)}
                      title={file}
                      aria-label={`Copy file path ${file}`}
                      data-testid="response-fix-file"
                      className="max-w-full cursor-pointer truncate rounded-[var(--vestara-radius-sm)] border border-[var(--vestara-border-subtle)] px-1.5 py-0.5 font-mono text-(--vestara-font-size-caption) text-[var(--vestara-text-secondary)]"
                    >
                      {file}
                    </button>
                  ))}
                  {fix.routeRefs.map((route) => {
                    const manifest = manifestRouteFor(route);
                    if (!manifest) return null;
                    if (!manifest.enabled) {
                      return (
                        <span
                          key={route}
                          title={`${route} is not enabled yet`}
                          data-testid="response-fix-planned"
                          className="shrink-0 rounded-[var(--vestara-radius-sm)] border border-[var(--vestara-border-subtle)] px-1.5 py-0.5 text-(--vestara-font-size-caption) text-[var(--vestara-text-muted)]"
                        >
                          Planned: {manifest.title}
                        </span>
                      );
                    }
                    return (
                      <button
                        key={route}
                        type="button"
                        onClick={() => navigate(manifest.path)}
                        aria-label={`Open ${manifest.title}`}
                        data-testid="response-fix-route"
                        className="shrink-0 cursor-pointer rounded-[var(--vestara-radius-sm)] border border-[var(--vestara-border-subtle)] px-1.5 py-0.5 text-(--vestara-font-size-caption) font-medium text-[var(--vestara-accent-text)]"
                      >
                        Open {manifest.title}
                      </button>
                    );
                  })}
                </div>
              )}
              {fix.fileRefs.length === 0 && fix.routeRefs.length === 0 && (
                <span
                  data-testid="response-fix-planned"
                  title="No navigable target parsed from this fix"
                  className="mt-1.5 inline-block rounded-[var(--vestara-radius-sm)] border border-[var(--vestara-border-subtle)] px-1.5 py-0.5 text-(--vestara-font-size-caption) text-[var(--vestara-text-muted)]"
                >
                  Planned screen
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {blocks.validations.length > 0 && (
        <div className="min-w-0 space-y-1.5" data-testid="response-validations">
          <SectionLabel>Validations</SectionLabel>
          {blocks.validations.map((validation, index) => (
            <div
              key={`${validation.command}:${index}`}
              data-testid="response-validation"
              className="flex min-w-0 items-center gap-2 rounded-[var(--vestara-radius-md)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-[var(--vestara-spacing-2)] py-[var(--vestara-spacing-1)]"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-(--vestara-font-size-label) text-[var(--vestara-text-secondary)]" title={validation.command}>
                {validation.command}
              </span>
              {validation.result && (
                <span className="shrink-0 truncate text-(--vestara-font-size-label) text-[var(--vestara-text-muted)]">{validation.result}</span>
              )}
              <button
                type="button"
                onClick={() => navigate('/activity')}
                aria-label={`Open Activity Room for evidence of ${validation.command}`}
                title="Runtime evidence lives in the Activity Room"
                data-testid="response-validation-evidence"
                className="shrink-0 cursor-pointer rounded-[var(--vestara-radius-sm)] border border-[var(--vestara-border-subtle)] px-1.5 py-0.5 text-(--vestara-font-size-caption) font-medium text-[var(--vestara-accent-text)]"
              >
                Evidence
              </button>
            </div>
          ))}
        </div>
      )}

      {blocks.filesChanged.length > 0 && (
        <div className="min-w-0" data-testid="response-files">
          <SectionLabel>Files changed</SectionLabel>
          <div className="mt-1 flex flex-wrap gap-1">
            {blocks.filesChanged.map((file) => (
              <button
                key={file}
                type="button"
                onClick={() => onOpenFile?.(file)}
                title={file}
                aria-label={`Copy file path ${file}`}
                data-testid="response-file"
                className="max-w-full cursor-pointer truncate rounded-[var(--vestara-radius-sm)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-1.5 py-0.5 font-mono text-(--vestara-font-size-caption) text-[var(--vestara-text-secondary)]"
              >
                {file}
              </button>
            ))}
          </div>
        </div>
      )}

      {blocks.verifications.length > 0 && (
        <div className="min-w-0 space-y-1.5" data-testid="response-verifications">
          <div className="flex items-center justify-between gap-2">
            <SectionLabel>Verification</SectionLabel>
            <button
              type="button"
              onClick={() => navigate('/verifier')}
              aria-label="Open Verifier"
              data-testid="response-verifier-open"
              className="shrink-0 cursor-pointer rounded-[var(--vestara-radius-sm)] border border-[var(--vestara-border-subtle)] px-1.5 py-0.5 text-(--vestara-font-size-caption) font-medium text-[var(--vestara-accent-text)]"
            >
              Open verifier
            </button>
          </div>
          <ul className="min-w-0 space-y-1">
            {blocks.verifications.map((item, index) => (
              <li
                key={`${item.slice(0, 24)}:${index}`}
                data-testid="response-verification"
                className="rounded-[var(--vestara-radius-md)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-[var(--vestara-spacing-2)] py-[var(--vestara-spacing-1)] text-(--vestara-font-size-body-small) leading-snug text-[var(--vestara-text-primary)]"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {blocks.suggestions.length > 0 && onSuggest && (
        <div className="min-w-0" data-testid="response-suggestions">
          <SectionLabel>Suggested next steps</SectionLabel>
          <div className="mt-1 flex flex-wrap gap-1">
            {blocks.suggestions.map((suggestion) => (
              <button
                key={suggestion.slice(0, 48)}
                type="button"
                onClick={() => onSuggest(suggestion)}
                title={suggestion}
                aria-label={`Send follow-up: ${suggestion}`}
                data-testid="response-suggestion"
                className="max-w-full cursor-pointer truncate rounded-full border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-interactive)] px-2.5 py-1 text-(--vestara-font-size-label) text-[var(--vestara-accent-text)]"
              >
                {suggestion.length > 80 ? `${suggestion.slice(0, 80)}…` : suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export default AssistantResponseBlocks;
