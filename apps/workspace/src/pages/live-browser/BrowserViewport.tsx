/**
 * BrowserViewport — the live browser page display.
 *
 * Renders the governed browser session as a streamed screenshot with an
 * address bar (back/forward/reload + URL input). In a human-control session
 * the address bar disables because the agent cannot act.
 */

import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import PublicRoundedIcon from '@mui/icons-material/PublicRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { type FormEvent, useState } from 'react';

export interface BrowserViewportProps {
  url: string;
  screenshot: string | null;
  busy: boolean;
  humanControlled: boolean;
  onNavigate(target: string): Promise<unknown>;
  onBack(): Promise<unknown>;
  onForward(): Promise<unknown>;
  onReload(): Promise<unknown>;
}

export function BrowserViewport({
  url,
  screenshot,
  busy,
  humanControlled,
  onNavigate,
  onBack,
  onForward,
  onReload,
}: BrowserViewportProps) {
  const [draft, setDraft] = useState(url);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const target = draft.trim();
    if (!target) return;
    void onNavigate(target);
  };

  const canAct = !humanControlled;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-(--vestara-accent-border) bg-zinc-950">
      {/* Address bar */}
      <div className="flex items-center gap-1 border-b border-zinc-800 bg-zinc-900 px-2 py-1.5">
        <button
          type="button"
          onClick={() => void onBack()}
          disabled={!canAct || busy}
          aria-label="Go back"
          title="Go back"
          className="rounded p-1.5 text-(--vestara-text-muted) transition-colors hover:bg-(--vestara-accent-bg) hover:text-(--vestara-accent-text) disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowBackRoundedIcon fontSize="small" />
        </button>
        <button
          type="button"
          onClick={() => void onForward()}
          disabled={!canAct || busy}
          aria-label="Go forward"
          title="Go forward"
          className="rounded p-1.5 text-(--vestara-text-muted) transition-colors hover:bg-(--vestara-accent-bg) hover:text-(--vestara-accent-text) disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowForwardRoundedIcon fontSize="small" />
        </button>
        <button
          type="button"
          onClick={() => void onReload()}
          disabled={!canAct || busy}
          aria-label="Reload"
          title="Reload"
          className="rounded p-1.5 text-(--vestara-text-muted) transition-colors hover:bg-(--vestara-accent-bg) hover:text-(--vestara-accent-text) disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RefreshRoundedIcon fontSize="small" />
        </button>
        <form onSubmit={handleSubmit} className="flex min-w-0 flex-1 items-center gap-1">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1">
            <PublicRoundedIcon fontSize="small" className="shrink-0 text-(--vestara-text-dim)" />
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={!canAct || busy}
              placeholder="Enter a URL or path…"
              aria-label="Address bar"
              className="min-w-0 flex-1 bg-transparent text-sm text-(--vestara-text) outline-none placeholder:text-(--vestara-text-dim)"
            />
          </div>
          <button
            type="submit"
            disabled={!canAct || busy || !draft.trim()}
            className="shrink-0 rounded-md bg-(--vestara-accent) px-3 py-1 text-xs font-medium text-zinc-950 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Go
          </button>
        </form>
      </div>

      {/* Viewport */}
      <div className="relative flex min-h-0 flex-1 items-start justify-center overflow-auto bg-zinc-950">
        {screenshot ? (
          <img
            src={screenshot}
            alt="Live browser viewport"
            className="max-w-full object-contain"
            style={{ minHeight: '100%' }}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-(--vestara-text-muted)">
            {busy ? (
              <>
                <RefreshRoundedIcon className="animate-spin text-(--vestara-accent-text)" />
                <span className="text-sm">Loading page…</span>
              </>
            ) : (
              <>
                <PublicRoundedIcon fontSize="large" />
                <span className="text-sm">No page loaded — navigate to a URL</span>
              </>
            )}
          </div>
        )}
        {busy && screenshot && (
          <div className="absolute right-3 top-3 rounded-md bg-(--vestara-accent-bg) px-2 py-1 text-xs text-(--vestara-accent-text)">
            Loading…
          </div>
        )}
      </div>
    </div>
  );
}
