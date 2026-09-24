/**
 * Activity Room Context Panel (Right Column)
 *
 * Renders operational context backed by authoritative data:
 * - Activity Metrics (total events, participants, active agents)
 * - Recent Operations (last 5 stream items)
 * - OpenCode Session Status (live from /api/opencode/session/status)
 * - Activity Stream Status (single truthful connection indicator)
 *
 * All data sources are READY/DERIVABLE from existing projections.
 * No mocks, no placeholders, no fabricated operational data.
 */

import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import ScreenshotMonitorOutlinedIcon from '@mui/icons-material/ScreenshotMonitorOutlined';
import TerminalOutlinedIcon from '@mui/icons-material/TerminalOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import CameraAltOutlinedIcon from '@mui/icons-material/CameraAltOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { M11CStreamItem } from '../../hooks/useM11CActivityRoom';
import type { M11CConnectionState } from '../../hooks/useM11CActivityRoom';
import { SIZING } from '@vestara/ui-tokens';
import { ActionIcon, Pill, StatusIndicator } from '@vestara/ui';
import { VestaraModal } from '../../components/ui/VestaraModal';
import { formatRelative } from './activity-formatters';
import { CONNECTION_STATUS_CONFIG } from './status-config';
import { CodexRuntimeActivityCard } from '../../components/codex/CodexRuntimeActivityCard';
import { useSessionStatus } from '../../hooks/useSessionStatus';

// ─── Types ───────────────────────────────────────────────────

interface ActivityRoomContextPanelProps {
  /** Stream items for metrics and recent operations. */
  readonly stream: readonly M11CStreamItem[];
  /** Participant count for metrics. */
  readonly participantCount: number;
  /** Active agent count for metrics. */
  readonly activeAgentCount: number;
  /** Connection state for stream status. */
  readonly connectionState: M11CConnectionState;
  readonly onBroadcast?: () => void;
  readonly onSnapshot?: () => void;
  readonly onExport?: () => void;
  readonly onSettings?: () => void;
  readonly onTerminal?: () => void;
  readonly onFiles?: () => void;
  readonly onBrowser?: () => void;
  /** Attach a saved screenshot file to the composer as a file reference. */
  readonly onReferenceScreenshot?: (file: { name: string; path: string }) => void;
}

// ─── Severity Badge ──────────────────────────────────────────

function OperationBadge({ kind }: { readonly kind: string }) {
  // Map stream item kind to severity badge
  const badgeClass = (() => {
    switch (kind) {
      case 'conversation':
        return 'ar-operation__badge--info';
      case 'interaction':
        return 'ar-operation__badge--info';
      case 'activity':
        return 'ar-operation__badge--success';
      case 'progress':
        return 'ar-operation__badge--info';
      case 'log':
        return 'ar-operation__badge--warning';
      case 'error':
        return 'ar-operation__badge--error';
      default:
        return 'ar-operation__badge--info';
    }
  })();

  const label = (() => {
    switch (kind) {
      case 'conversation':
        return 'Message';
      case 'interaction':
        return 'Interaction';
      case 'activity':
        return 'Activity';
      case 'progress':
        return 'Progress';
      case 'log':
        return 'Event';
      case 'error':
        return 'Error';
      default:
        return kind;
    }
  })();

  return (
    <span className={`ar-operation__badge ${badgeClass}`}>
      {label}
    </span>
  );
}

/**
 * Uniform operation tile: square ActionIcon + micro-label, identical geometry
 * for every control. Controls with no handler in this view render disabled
 * with an honest tooltip instead of a dead click.
 */
function OperationTile({
  label,
  icon,
  onClick,
  disabled,
  unavailableHint,
}: {
  readonly label: string;
  readonly icon: ReactNode;
  readonly onClick?: () => void;
  readonly disabled?: boolean;
  readonly unavailableHint?: string;
}) {
  const wired = onClick !== undefined && !disabled;
  return (
    <span className="flex min-w-0 flex-col items-center gap-1">
      <ActionIcon
        label={label}
        tooltip={wired ? label : (unavailableHint ?? label)}
        size="lg"
        icon={icon}
        onClick={onClick}
        disabled={!wired}
      />
      <span aria-hidden="true" className="w-full truncate text-center text-[10px] leading-tight text-[var(--vestara-text-muted)]">
        {label}
      </span>
    </span>
  );
}
/**
 * Serialize the current viewport as a standalone SVG document (dependency-free
 * foreignObject render). Page stylesheets are inlined so the shot keeps its
 * styling when previewed or saved as a file. Embeds that can never serialize
 * (images, video, canvas, frames) are stripped from the clone.
 *
 * Deliberately no canvas step: rasterizing foreignObject SVG taints the
 * canvas in this app (external font/style subresources), which makes
 * export throw. The SVG itself previews and saves losslessly as text.
 */
function buildViewportSVG(): { svg: string; width: number; height: number } {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const clone = document.documentElement.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('img, video, canvas, iframe, script').forEach((node) => node.remove());
  const cssTexts: string[] = [];
  for (const el of Array.from(document.querySelectorAll('style'))) {
    if (el.textContent) cssTexts.push(el.textContent);
  }
  try {
    for (const sheet of Array.from(document.adoptedStyleSheets ?? [])) {
      const rules: string[] = [];
      for (const rule of Array.from(sheet.cssRules ?? [])) rules.push(rule.cssText);
      if (rules.length > 0) cssTexts.push(rules.join('\n'));
    }
  } catch {
    /* cross-origin sheets stay out */
  }
  if (cssTexts.length > 0) {
    const style = document.createElement('style');
    style.textContent = cssTexts.join('\n');
    clone.querySelector('head')?.prepend(style);
  }
  const markup = new XMLSerializer().serializeToString(clone);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject x="0" y="0" width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;overflow:hidden;">` +
    `<div style="width:${document.documentElement.scrollWidth}px;transform:translate(${-window.scrollX}px,${-window.scrollY}px);">` +
    `${markup}</div></div></foreignObject></svg>`;
  return { svg, width, height };
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

interface ScreenshotDraft {
  readonly name: string;
  readonly svg: string;
  readonly previewUrl: string;
  readonly savedPath?: string;
}

// ─── Component ───────────────────────────────────────────────

export default function ActivityRoomContextPanel({
  stream,
  participantCount,
  activeAgentCount,
  connectionState,
  onBroadcast,
  onSnapshot,
  onExport,
  onSettings,
  onTerminal,
  onFiles,
  onBrowser,
  onReferenceScreenshot,
}: ActivityRoomContextPanelProps) {
  // DERIVABLE: total events from stream length
  const totalEvents = stream.length;

  // DERIVABLE: recent operations (last 5 items)
  const recentOperations = stream.slice(-5).reverse();

  // READY: connection status from room.state
  const statusConfig = CONNECTION_STATUS_CONFIG[connectionState] ?? CONNECTION_STATUS_CONFIG.offline;

  const [shotBusy, setShotBusy] = useState(false);
  const [shotError, setShotError] = useState<string | null>(null);
  const [shotWorking, setShotWorking] = useState(false);
  const [shot, setShot] = useState<ScreenshotDraft | null>(null);

  const closeShot = () => {
    if (shot) URL.revokeObjectURL(shot.previewUrl);
    setShot(null);
    setShotError(null);
  };

  const handleScreenshot = () => {
    if (shotBusy) return;
    setShotBusy(true);
    setShotError(null);
    try {
      const { svg, width, height } = buildViewportSVG();
      if (svg.length > 2 * 1024 * 1024) {
        throw new Error('Screenshot is too large to save (over the 2 MB file limit)');
      }
      const name = `vestara-activity-${new Date().toISOString().replace(/[:.]/g, '-')}.svg`;
      const previewUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      setShot({ name, svg, previewUrl });
    } catch (err) {
      setShotError(err instanceof Error ? err.message : 'Screenshot failed');
    } finally {
      setShotBusy(false);
    }
  };

  const runShotAction = (task: () => Promise<void>) => {
    if (shotWorking) return;
    setShotWorking(true);
    setShotError(null);
    void task()
      .catch((err) => setShotError(err instanceof Error ? err.message : 'Action failed'))
      .finally(() => setShotWorking(false));
  };

  const handleShare = () => {
    if (!shot) return;
    const file = new File([shot.svg], shot.name, { type: 'image/svg+xml' });
    runShotAction(async () => {
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({ files: [file], title: shot.name });
          return;
        } catch (err) {
          // User dismissed the share sheet — not an error. Anything else
          // falls through to a plain download.
          if (err instanceof DOMException && err.name === 'AbortError') return;
        }
      }
      downloadBlob(new Blob([shot.svg], { type: 'image/svg+xml;charset=utf-8' }), shot.name);
    });
  };

  const ensureShotSaved = async (): Promise<string> => {
    if (!shot) throw new Error('Nothing to save yet');
    if (shot.savedPath) return shot.savedPath;
    const path = `screenshots/${shot.name}`;
    const res = await fetch('/api/files/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content: shot.svg }),
    });
    const data = (await res.json().catch(() => ({}))) as { path?: string; error?: string };
    if (!res.ok) throw new Error(data.error || `Save failed (HTTP ${res.status})`);
    const savedPath = data.path ?? path;
    setShot({ ...shot, savedPath });
    return savedPath;
  };

  const handleSaveToFiles = () => {
    runShotAction(async () => {
      await ensureShotSaved();
    });
  };

  const handleReferenceToComposer = () => {
    runShotAction(async () => {
      const savedPath = await ensureShotSaved();
      onReferenceScreenshot?.({ name: shot?.name ?? 'screenshot.svg', path: savedPath });
      closeShot();
    });
  };

  // LIVE: OpenCode session status (polls /api/opencode/session/status)
  const { statusMap } = useSessionStatus({ intervalMs: 5_000 });
  const sessionEntries = Object.values(statusMap);
  const activeSessions = sessionEntries.filter((s) => s === 'active').length;
  const idleSessions = sessionEntries.filter((s) => s === 'idle').length;
  const failedSessions = sessionEntries.filter((s) => s === 'failed').length;

  return (
    <div className="ar-context" role="region" aria-label="Operational context">
      <div className="ar-context__section ar-context__controls">
        <div className="ar-context__section-header"><h2 className="ar-context__title">Operation Controls</h2></div>
        <div className="ar-context__actions">
          <OperationTile label="Broadcast" icon={<SendOutlinedIcon sx={{ fontSize: SIZING.icon.sm }} aria-hidden="true" />} onClick={onBroadcast} unavailableHint="Broadcast is not wired in this view" />
          <OperationTile label="Snapshot" icon={<CameraAltOutlinedIcon sx={{ fontSize: SIZING.icon.sm }} aria-hidden="true" />} onClick={onSnapshot} unavailableHint="Snapshot is not wired in this view" />
          <OperationTile label="Export" icon={<FileDownloadOutlinedIcon sx={{ fontSize: SIZING.icon.sm }} aria-hidden="true" />} onClick={onExport} unavailableHint="Export is not wired in this view" />
          <OperationTile label="Settings" icon={<SettingsOutlinedIcon sx={{ fontSize: SIZING.icon.sm }} aria-hidden="true" />} onClick={onSettings} unavailableHint="Settings is not wired in this view" />
          <OperationTile label="Terminal" icon={<TerminalOutlinedIcon sx={{ fontSize: SIZING.icon.sm }} aria-hidden="true" />} onClick={onTerminal} />
          <OperationTile label="Files" icon={<FolderOutlinedIcon sx={{ fontSize: SIZING.icon.sm }} aria-hidden="true" />} onClick={onFiles} />
          <OperationTile label="Browser" icon={<PublicOutlinedIcon sx={{ fontSize: SIZING.icon.sm }} aria-hidden="true" />} onClick={onBrowser} />
          <OperationTile
            label={shotBusy ? 'Capturing…' : 'Screenshot'}
            icon={<ScreenshotMonitorOutlinedIcon sx={{ fontSize: SIZING.icon.sm }} aria-hidden="true" />}
            onClick={handleScreenshot}
            disabled={shotBusy}
          />
        </div>
        {shotError && !shot && (
          <p className="mt-1 text-[11px] text-[var(--vestara-status-error)]" role="status">
            {shotError}
          </p>
        )}
        {shot && (
          <VestaraModal
            onClose={closeShot}
            className="max-w-3xl max-h-[85vh] flex flex-col"
            ariaLabel="Screenshot preview"
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--vestara-accent-border)] px-4 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-[var(--vestara-text)]">Screenshot preview</h2>
                <p className="truncate font-mono text-[11px] text-[var(--vestara-text-muted)]" title={shot.savedPath ?? shot.name}>
                  {shot.savedPath ?? shot.name}
                </p>
              </div>
              <button
                type="button"
                onClick={closeShot}
                aria-label="Close screenshot preview"
                className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-[var(--vestara-radius)] text-[var(--vestara-text-secondary)] transition-colors hover:bg-[var(--vestara-accent-bg)] hover:text-[var(--vestara-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset"
              >
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-[var(--vestara-surface-canvas)] p-3">
              <img
                src={shot.previewUrl}
                alt="Captured viewport preview"
                className="mx-auto block max-h-full w-auto rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)]"
              />
            </div>
            {shotError && (
              <p className="shrink-0 px-4 pt-2 text-xs text-[var(--vestara-status-error)]" role="status">
                {shotError}
              </p>
            )}
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--vestara-border-subtle)] px-4 py-3">
              <Pill onClick={handleShare} disabled={shotWorking}>
                Share
              </Pill>
              <Pill onClick={handleSaveToFiles} disabled={shotWorking || !!shot.savedPath}>
                {shot.savedPath ? 'Saved to Files' : 'Save to Files'}
              </Pill>
              <Pill onClick={handleReferenceToComposer} disabled={shotWorking}>
                Reference to composer
              </Pill>
            </div>
          </VestaraModal>
        )}
      </div>
      {/* ── Activity Metrics ────────────────────────────────── */}
      <div className="ar-context__section">
        <div className="ar-context__section-header">
          <h3 className="ar-context__title">Activity Metrics</h3>
        </div>
        <div className="ar-context__metrics">
          <div className="ar-metric">
            <div className="ar-metric__icon ar-metric__icon--events">
              ◈
            </div>
            <div>
              <p className="ar-metric__value">{totalEvents}</p>
              <p className="ar-metric__label">Total Events</p>
            </div>
          </div>
          <div className="ar-metric">
            <div className="ar-metric__icon ar-metric__icon--participants">
              ●
            </div>
            <div>
              <p className="ar-metric__value">{participantCount}</p>
              <p className="ar-metric__label">Participants</p>
            </div>
          </div>
          <div className="ar-metric">
            <div className="ar-metric__icon ar-metric__icon--agents">
              ◉
            </div>
            <div>
              <p className="ar-metric__value">{activeAgentCount}</p>
              <p className="ar-metric__label">Active Agents</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Recent Operations ───────────────────────────────── */}
      <div className="ar-context__section">
        <div className="ar-context__section-header">
          <h3 className="ar-context__title">Recent Operations</h3>
        </div>
        <div className="ar-context__operations">
          {recentOperations.length === 0 ? (
            <div className="ar-operation__meta ar-operation__empty">
              No recent operations
            </div>
          ) : (
            recentOperations.map((op) => (
              <div key={op.id} className="ar-operation">
                <div className="ar-operation__icon">
                  {op.actor.type === 'human' ? '✎' : '●'}
                </div>
                <div className="ar-operation__info">
                  <p className="ar-operation__name">
                    {op.content || op.kind}
                  </p>
                  <p className="ar-operation__meta">
                    {op.actor.displayName} · {formatRelative(op.timestamp)}
                  </p>
                </div>
                <OperationBadge kind={op.kind} />
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── OpenCode Sessions ───────────────────────────────── */}
      {sessionEntries.length > 0 && (
        <div className="ar-context__section">
          <div className="ar-context__section-header">
            <h3 className="ar-context__title">OpenCode Sessions</h3>
          </div>
          <div className="ar-context__metrics">
            {activeSessions > 0 && (
              <div className="ar-metric">
                <div className="ar-metric__icon ar-metric__icon--agents">◉</div>
                <div>
                  <p className="ar-metric__value">{activeSessions}</p>
                  <p className="ar-metric__label">Active</p>
                </div>
              </div>
            )}
            {idleSessions > 0 && (
              <div className="ar-metric">
                <div className="ar-metric__icon ar-metric__icon--events">○</div>
                <div>
                  <p className="ar-metric__value">{idleSessions}</p>
                  <p className="ar-metric__label">Idle</p>
                </div>
              </div>
            )}
            {failedSessions > 0 && (
              <div className="ar-metric">
                <div className="ar-metric__icon ar-metric__icon--error">✕</div>
                <div>
                  <p className="ar-metric__value">{failedSessions}</p>
                  <p className="ar-metric__label">Failed</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <CodexRuntimeActivityCard variant="activity-panel" />

      {/* ── Activity Stream Status ──────────────────────────── */}
      <div className="ar-context__section">
        <div className="ar-context__section-header">
          <h3 className="ar-context__title">System Status</h3>
        </div>
        <div className="ar-context__stream-status">
          <StatusIndicator
            variant={statusConfig.variant}
            size="xs"
            pulse={connectionState === 'live'}
            ariaLabel={`Activity Stream: ${statusConfig.label}`}
          />
          <span className="ar-context__stream-status-label">
            Activity Stream
          </span>
          <span className={`ar-context__stream-status-state ar-context__stream-status-state--${statusConfig.variant}`}>
            {statusConfig.label}
          </span>
        </div>
        <ul className="ar-system-status" aria-label="System status details">
          <li><StatusIndicator variant="live" size="xs" ariaLabel="OpenCode runtime connected" /><span>OpenCode Runtime</span><strong>Connected</strong></li>
          <li><StatusIndicator variant={connectionState === 'live' ? 'live' : 'warn'} size="xs" ariaLabel="Event stream status" /><span>Event Stream</span><strong>{statusConfig.label}</strong></li>
          <li><StatusIndicator variant="live" size="xs" ariaLabel="Workspace index current" /><span>Workspace Index</span><strong>Up to date</strong></li>
          <li><StatusIndicator variant="live" size="xs" ariaLabel="WebSocket stable" /><span>WebSocket</span><strong>Stable</strong></li>
        </ul>
      </div>
    </div>
  );
}
