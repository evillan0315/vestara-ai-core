import { useCallback, useEffect, useState } from 'react';
import { isValidUiVersion, uiVersionDefault, uiVersionOptions } from '../lib/workspace-settings-model';
import {
  fetchUiVersionState,
  saveUiVersion,
  UiVersionApiError,
  type UiVersionState,
  type WorkspaceUiVersion,
} from '../lib/workspace-ui-version';
import {
  WORKSPACE_UI_VERSION_ENV_NOTE,
  WORKSPACE_UI_VERSION_FIXTURE,
  WORKSPACE_UI_VERSION_HELP,
  WORKSPACE_UI_VERSION_OFFLINE_NOTE,
  WORKSPACE_UI_VERSION_UNAUTHORIZED_NOTE,
} from './settings.fixtures';

type LoadStatus = 'loading' | 'ready' | 'saving';

function sourceBadge(source: UiVersionState['source']): string {
  if (source === 'environment') return 'env';
  if (source === 'fixture') return 'fixture';
  return 'live';
}

/**
 * Workspace UI version selector (v1 stable ↔ v2 next).
 * Mirrors the v1 Settings segmented control: two aria-pressed buttons in a
 * pill container. Persists general.workspaceUiVersion via the Settings API;
 * locks when VESTARA_WORKSPACE_UI_VERSION is set and falls back to the v2
 * fixture offline.
 */
export function WorkspaceUiToggle() {
  const [state, setState] = useState<UiVersionState>({
    version: WORKSPACE_UI_VERSION_FIXTURE,
    revision: null,
    source: 'fixture',
    envLocked: false,
  });
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchUiVersionState()
      .then(async (next) => {
        if (cancelled) return;
        if (await isValidUiVersion(next.version)) {
          setState(next);
        } else {
          setState({ ...next, version: uiVersionDefault() });
          setNotice('Unexpected value from settings — showing the model default.');
        }
        setStatus('ready');
      })
      .catch((error) => {
        if (cancelled) return;
        const apiError = error instanceof UiVersionApiError ? error : null;
        setState({ version: WORKSPACE_UI_VERSION_FIXTURE, revision: null, source: 'fixture', envLocked: false });
        setNotice(
          apiError?.status === 401 || apiError?.status === 403
            ? WORKSPACE_UI_VERSION_UNAUTHORIZED_NOTE
            : WORKSPACE_UI_VERSION_OFFLINE_NOTE,
        );
        setStatus('ready');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const select = useCallback(
    async (target: WorkspaceUiVersion) => {
      if (status !== 'ready' || state.envLocked || target === state.version) return;
      if (!(await isValidUiVersion(target))) {
        setNotice('That value is not valid for this setting.');
        return;
      }
      setStatus('saving');
      setNotice(null);
      try {
        const next = await saveUiVersion(target, state.revision);
        setState(next);
        setStatus('ready');
      } catch (error) {
        if (error instanceof UiVersionApiError && error.status === 409) {
          try {
            const reloaded = await fetchUiVersionState();
            setState(reloaded);
            setNotice(error.message);
          } catch {
            setNotice(error.message);
          }
        } else {
          setNotice(error instanceof Error ? error.message : 'Switch failed.');
        }
        setStatus('ready');
      }
    },
    [status, state],
  );

  const busy = status !== 'ready';
  const disabled = busy || state.envLocked;

  return (
    <div className="rounded-[var(--vestara-radius-md-plus)] bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[length:var(--vestara-font-size-label)] tracking-[0.12em] text-[var(--vestara-text-shell-muted)]">
          WORKSPACE UI
        </div>
        <span className="text-[length:var(--vestara-font-size-caption)] px-1.5 py-0.5 rounded-full border border-[var(--vestara-border-shell)] text-[var(--vestara-text-shell-secondary)]">
          {sourceBadge(state.source)}
        </span>
      </div>
      <div className="mt-2">
        {status === 'loading' ? (
          <div className="text-[length:var(--vestara-font-size-body-small)] text-[var(--vestara-text-shell-secondary)]">
            Reading workspace settings…
          </div>
        ) : (
          <fieldset>
            <legend className="sr-only">Workspace UI version</legend>
            <div className="inline-flex flex-wrap gap-1 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-panel)] p-1">
              {uiVersionOptions().map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={state.version === option.value}
                  disabled={disabled}
                  onClick={() => select(option.value)}
                  className={`min-h-8 rounded-[var(--vestara-radius-md)] border px-3 text-[length:var(--vestara-font-size-caption)] capitalize focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--vestara-accent-shell)] disabled:cursor-not-allowed disabled:opacity-60 ${
                    state.version === option.value
                      ? 'border-[var(--vestara-accent-shell)]/20 bg-[var(--vestara-accent-shell)]/10 text-[var(--vestara-accent-shell)]'
                      : 'border-transparent text-[var(--vestara-text-shell-secondary)] hover:text-[var(--vestara-text-shell-primary)]'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <div className="mt-1.5 text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-secondary)]">
          {state.envLocked ? WORKSPACE_UI_VERSION_ENV_NOTE : WORKSPACE_UI_VERSION_HELP}
        </div>
      </div>
      {notice && (
        <div
          role="status"
          className="mt-2 text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-status-shell-warning)]"
        >
          {notice}
        </div>
      )}
    </div>
  );
}
