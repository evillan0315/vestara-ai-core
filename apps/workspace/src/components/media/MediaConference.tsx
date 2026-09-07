/**
 * @vestara/workspace — MediaConference
 *
 * Standalone, reusable media conference surface component.
 * Renders participant tiles, controls, and connection state.
 * No Activity Room dependency — usable in any context.
 *
 * Architecture:
 *   MediaConference → useMediaConference → MediaConferenceClient → BrowserAdapter
 *
 * Usage (standalone):
 *   <MediaConference
 *     context={mediaContext}
 *     createAdapter={() => new OpenViduBrowserAdapter()}
 *   />
 *
 * Usage (Activity Room):
 *   <MediaConference
 *     context={activityMediaContext}
 *     createAdapter={() => new OpenViduBrowserAdapter()}
 *   />
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-006 Media Conference
 */

import { MediaParticipantTile } from "./MediaParticipantTile";
import { MediaControls } from "./MediaControls";
import {
  useMediaConference,
  type UseMediaConferenceOptions,
} from "./useMediaConference";
import type { MediaConferenceContext, BrowserAdapter } from "@vestara/media-conference";

/** Props for MediaConference. */
export interface MediaConferenceProps {
  /** The connection context. */
  readonly context: MediaConferenceContext;

  /** Factory that creates a BrowserAdapter. */
  readonly createAdapter: () => BrowserAdapter;

  /** Whether the conference is in a compact layout. */
  readonly compact?: boolean;

  /** Optional className for the root container. */
  readonly className?: string;
}

/**
 * Standalone media conference surface.
 *
 * Self-contained: connects, renders participants, provides controls.
 * No Activity Room, no routing, no host-specific state.
 *
 * The same component works in:
 *   - Standalone page
 *   - Activity Room embedded panel
 *   - Floating conference window
 *   - Expanded/full workspace
 */
export function MediaConference({
  context,
  createAdapter,
  compact = false,
  className,
}: MediaConferenceProps) {
  const media = useMediaConference({ createAdapter });

  // Auto-connect when context changes (and we're idle)
  // The hook handles the lifecycle — we just trigger connect
  const handleConnect = async () => {
    await media.connect(context);
  };

  // ─── Idle state ─────────────────────────────────────────
  if (media.state.state === "idle") {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-3 p-4 ${className ?? ""}`}
        data-testid="media-conference"
      >
        <div className="text-center text-sm text-(--vestara-text-2)">
          Media conference inactive
        </div>
        <button
          type="button"
          onClick={handleConnect}
          className="rounded-md bg-(--vestara-accent) px-4 py-2 text-sm font-medium text-black hover:opacity-90 cursor-pointer"
          data-testid="media-join-button"
        >
          Join Conference
        </button>
      </div>
    );
  }

  // ─── Connecting state ───────────────────────────────────
  if (media.state.state === "connecting") {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-3 p-4 ${className ?? ""}`}
        data-testid="media-conference"
      >
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-(--vestara-accent) border-t-transparent" />
        <div className="text-sm text-(--vestara-text-2)">
          Connecting...
        </div>
      </div>
    );
  }

  // ─── Failed state ───────────────────────────────────────
  if (media.state.state === "failed") {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-3 p-4 ${className ?? ""}`}
        data-testid="media-conference"
      >
        <div className="text-center text-sm text-(--vestara-red)">
          {media.state.error ?? "Connection failed"}
        </div>
        <button
          type="button"
          onClick={handleConnect}
          className="rounded-md bg-(--vestara-accent) px-4 py-2 text-sm font-medium text-black hover:opacity-90 cursor-pointer"
          data-testid="media-retry-button"
        >
          Retry
        </button>
      </div>
    );
  }

  // ─── Connected / Disconnected states ────────────────────
  const participants = media.state.participants;

  return (
    <div
      className={`flex flex-col rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) overflow-hidden ${className ?? ""}`}
      data-testid="media-conference"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-(--vestara-accent-border)">
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-(--vestara-accent-text)">
          Media Conference
        </span>
        <span className="text-[10px] text-(--vestara-text-muted)">
          {media.state.state === "connected" ? "Connected" : "Disconnected"}
        </span>
      </div>

      {/* Participant grid */}
      <div className="flex flex-wrap items-center justify-center gap-2 p-3 min-h-[120px]">
        {participants.length === 0 ? (
          <div className="text-xs text-(--vestara-text-muted)">
            {media.state.state === "connected"
              ? "Waiting for participants..."
              : "No participants"}
          </div>
        ) : (
          participants.map((p) => (
            <MediaParticipantTile
              key={p.id}
              participant={p}
              compact={compact}
            />
          ))
        )}
      </div>

      {/* Controls */}
      <MediaControls media={media} />
    </div>
  );
}
