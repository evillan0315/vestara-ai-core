/**
 * Live Browser — the governed browser surface.
 *
 * Phase 1: core surface — session lifecycle, live viewport, address bar,
 * status badge, Stop (reset) and Take Control. Voice Control + Live
 * Transcript + Action Timeline panels arrive in Phases 2–3.
 */

import PublicRoundedIcon from '@mui/icons-material/PublicRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import TouchAppRoundedIcon from '@mui/icons-material/TouchAppRounded';
import { useState } from 'react';
import { type BrowserConnectionStatus, useBrowserSession } from '../../hooks/useBrowserSession';
import { ActionTimelinePanel } from './ActionTimelinePanel';
import { BrowserViewport } from './BrowserViewport';
import { CommandSuggestions } from './CommandSuggestions';
import { LiveTranscriptPanel } from './LiveTranscriptPanel';
import { VoiceControlPanel } from './VoiceControlPanel';

const STATUS_META: Record<BrowserConnectionStatus, { label: string; dot: string; text: string }> = {
  connecting: { label: 'Connecting…', dot: 'bg-(--vestara-amber)', text: 'text-(--vestara-amber)' },
  live: { label: 'Live', dot: 'bg-(--vestara-green)', text: 'text-(--vestara-green)' },
  human: { label: 'Human Control', dot: 'bg-(--vestara-blue)', text: 'text-(--vestara-blue)' },
  offline: { label: 'Offline', dot: 'bg-(--vestara-red)', text: 'text-(--vestara-red)' },
  unconfigured: { label: 'Browser not configured', dot: 'bg-(--vestara-red)', text: 'text-(--vestara-red)' },
};

export default function LiveBrowserPage() {
  const browser = useBrowserSession();
  const [confirmReset, setConfirmReset] = useState(false);

  const meta = STATUS_META[browser.status];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 sm:gap-4">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-(--vestara-accent-bg) text-(--vestara-accent-text)">
            <PublicRoundedIcon fontSize="small" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-(--vestara-text)">Live Browser</h1>
            {browser.sessionId && <p className="text-xs text-(--vestara-text-dim)">Session {browser.sessionId}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-2.5 py-1 text-xs font-medium ${meta.text}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${meta.dot} ${browser.status === 'live' ? 'animate-pulse' : ''}`}
            />
            {meta.label}
          </span>

          <button
            type="button"
            onClick={() => void browser.toggleControl()}
            disabled={browser.status === 'connecting' || browser.status === 'unconfigured'}
            title="Toggle between agent and human control"
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              browser.status === 'human'
                ? 'bg-(--vestara-accent-bg) text-(--vestara-accent-text) hover:bg-(--vestara-accent-border)'
                : 'bg-(--vestara-accent-bg) text-(--vestara-accent-text) hover:bg-(--vestara-accent-border)'
            }`}
          >
            <TouchAppRoundedIcon fontSize="small" />
            {browser.status === 'human' ? 'Return Control to Agent' : 'Take Control'}
          </button>

          <button
            type="button"
            onClick={() => {
              if (confirmReset) {
                void browser.resetSession();
                setConfirmReset(false);
              } else {
                setConfirmReset(true);
                window.setTimeout(() => setConfirmReset(false), 3000);
              }
            }}
            disabled={browser.status === 'connecting' || browser.status === 'unconfigured'}
            title="Stop and restart the browser session"
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              confirmReset
                ? 'bg-(--vestara-red) text-zinc-950'
                : 'bg-(--vestara-accent-bg) text-(--vestara-accent-text) hover:bg-(--vestara-accent-border)'
            }`}
          >
            <StopRoundedIcon fontSize="small" />
            {confirmReset ? 'Confirm reset?' : 'Stop'}
          </button>
        </div>
      </header>

      {/* Error banner */}
      {browser.error && (
        <div
          role="alert"
          className="rounded-lg border border-(--vestara-red) bg-(--vestara-red)/10 px-3 py-2 text-sm text-(--vestara-red)"
        >
          {String(browser.error)}
        </div>
      )}

      {/* Browser not configured */}
      {browser.status === 'unconfigured' && (
        <div className="flex flex-1 items-center justify-center">
          <div className="max-w-md rounded-xl border border-(--vestara-accent-border) bg-zinc-900 p-6 text-center">
            <PublicRoundedIcon className="mx-auto mb-3 text-(--vestara-accent-text)" />
            <h2 className="mb-1 font-semibold text-(--vestara-text)">Browser runtime not configured</h2>
            <p className="text-sm text-(--vestara-text-muted)">
              Set{' '}
              <code className="rounded bg-zinc-800 px-1 py-0.5 text-(--vestara-accent-text)">VESTARA_BROWSER_URL</code>{' '}
              on the API server to enable the Live Browser. Playwright Chromium must be provisioned.
            </p>
          </div>
        </div>
      )}

      {/* Viewport + right rail */}
      {browser.status !== 'unconfigured' && (
        <main className="flex min-h-[28rem] flex-1 flex-col gap-3 lg:flex-row lg:gap-4">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <BrowserViewport
              url={browser.url}
              screenshot={browser.screenshot}
              busy={browser.busy}
              humanControlled={browser.status === 'human'}
              onNavigate={(target) => browser.navigate(target)}
              onBack={() => browser.back()}
              onForward={() => browser.forward()}
              onReload={() => browser.reload()}
            />
          </div>
          <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-72">
            <VoiceControlPanel
              disabled={browser.status !== 'live' || browser.busy}
              onCommand={(text) => browser.voiceCommand(text)}
            />
            <LiveTranscriptPanel entries={browser.transcript} />
            <ActionTimelinePanel entries={browser.timeline} />
            <CommandSuggestions
              disabled={browser.status !== 'live' || browser.busy}
              onCommand={(text) => void browser.voiceCommand(text)}
            />
          </aside>
        </main>
      )}
    </div>
  );
}
