import { useCallback, useEffect, useState } from 'react';
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
  WORKSPACE_UI_VERSION_OPTIONS,
  WORKSPACE_UI_VERSION_UNAUTHORIZED_NOTE,
} from './settings.fixtures';

type LoadStatus = 'loading' | 'ready' | 'saving';

function optionLabel(version: WorkspaceUiVersion): string {
  return WORKSPACE_UI_VERSION_OPTIONS.find((option) => option.value === version)?.label ?? version;
}

function sourceBadge(source: UiVersionState['source']): string {
  if (source === 'environment') return 'env';
  if (source === 'fixture') return 'fixture';
  return 'live';
}

/**
 * Workspace UI version switch (v1 stable ↔ v2 next).
 * Persists general.workspaceUiVersion via the Settings API; locks when
 * VESTARA_WORKSPACE_UI_VERSION is set and falls back to the v2 fixture
 * offline. Checked = v2.
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
      .then((next) => {
        if (cancelled) return;
        setState(next);
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

  const flip = useCallback(async () => {
    if (status !== 'ready' || state.envLocked) return;
    const target: WorkspaceUiVersion = state.version === 'v2' ? 'v1' : 'v2';
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
  }, [status, state]);

  const checked = state.version === 'v2';
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
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[length:var(--vestara-font-size-body-small)] font-medium text-[var(--vestara-text-shell-primary)]">
            {status === 'loading' ? 'Reading workspace settings…' : optionLabel(state.version)}
          </div>
          <div className="mt-0.5 text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-secondary)]">
            {state.envLocked ? WORKSPACE_UI_VERSION_ENV_NOTE : WORKSPACE_UI_VERSION_HELP}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label="Workspace UI version"
          disabled={disabled}
          onClick={flip}
          className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
            checked
              ? 'bg-[var(--vestara-accent-shell)] border-[var(--vestara-accent-shell)]'
              : 'bg-[var(--vestara-surface-shell-panel)] border-[var(--vestara-border-shell)]'
          } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <span
            aria-hidden="true"
            className={`absolute top-0.5 h-[1.125rem] w-[1.125rem] rounded-full transition-transform ${
              checked
                ? 'translate-x-[1.375rem] bg-[var(--vestara-surface-shell-canvas)]'
                : 'translate-x-0.5 bg-[var(--vestara-text-shell-secondary)]'
            }`}
          />
        </button>
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
