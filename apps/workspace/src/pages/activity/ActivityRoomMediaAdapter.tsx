/**
 * @vestara/workspace — ActivityRoomMediaAdapter
 *
 * Thin adapter that bridges ActivityRoom's ActivityMediaBinding
 * into the MediaConference's provider-neutral context.
 *
 * This is the ONLY place where ActivityRoom-specific state
 * touches MediaConference. The adapter transforms:
 *   ActivityMediaBinding → MediaConferenceContext
 *
 * Activity Room owns:
 *   - ActivityMediaBinding correlation
 *   - Identity and authorization
 *   - Workflow/activity stream
 *
 * Media Conference owns:
 *   - Browser connection lifecycle
 *   - MediaStreams
 *   - Camera/mic state
 *
 * Architecture:
 *   M11CActivityRoomPage → ActivityRoomMediaAdapter → MediaConference
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-006 Media Conference
 */

import { useCallback } from "react";
import { MediaConference } from "../../components/media/MediaConference";
import type { MediaConferenceContext } from "@vestara/media-conference";
import type { BrowserAdapter } from "@vestara/media-conference";

/** Props for ActivityRoomMediaAdapter. */
export interface ActivityRoomMediaAdapterProps {
  /** The server URL (e.g., from environment or config). */
  readonly serverUrl: string;

  /** The session ID from the ActivityMediaBinding. */
  readonly sessionId: string;

  /** The ephemeral credential from joinParticipant(). */
  readonly credential: string;

  /** Display name for the local participant. */
  readonly displayName: string;

  /** Factory that creates a BrowserAdapter. */
  readonly createAdapter: () => BrowserAdapter;

  /** Whether the panel is in a compact layout. */
  readonly compact?: boolean;

  /** Optional className. */
  readonly className?: string;
}

/**
 * Activity Room → Media Conference adapter.
 *
 * Transforms ActivityRoom-specific state (binding, credential)
 * into the provider-neutral MediaConferenceContext and renders
 * the standalone MediaConference component.
 *
 * Activity Room's M11C hook remains completely independent.
 * This adapter does NOT modify useM11CActivityRoom.
 */
export function ActivityRoomMediaAdapter({
  serverUrl,
  sessionId,
  credential,
  displayName,
  createAdapter,
  compact = false,
  className,
}: ActivityRoomMediaAdapterProps) {
  const context: MediaConferenceContext = {
    serverUrl,
    sessionId,
    credential,
    displayName,
  };

  return (
    <MediaConference
      context={context}
      createAdapter={createAdapter}
      compact={compact}
      className={className}
    />
  );
}
