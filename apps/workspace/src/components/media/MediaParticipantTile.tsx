/**
 * @vestara/workspace — MediaParticipantTile
 *
 * Displays a single participant's video/audio state.
 * Consumes normalized MediaConferenceParticipant state — no provider objects.
 *
 * Handles:
 *   - Audio+video participant (video element + audio playback)
 *   - Audio-only participant (no video, avatar placeholder)
 *   - Video-only participant (video element, no audio indicator)
 *   - Local participant (mirror video, label "You")
 *   - Remote participants (normal video, display name)
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-006 Media Conference
 */

import { useRef, useEffect } from "react";
import type { MediaConferenceParticipant } from "@vestara/media-conference";

/** Props for MediaParticipantTile. */
export interface MediaParticipantTileProps {
  /** The participant to display. */
  readonly participant: MediaConferenceParticipant;

  /** Whether this tile is in a compact layout (e.g., sidebar). */
  readonly compact?: boolean;
}

/**
 * Renders a single participant's video and audio state.
 *
 * MediaStream is consumed directly for <video> srcObject —
 * it exists in ephemeral browser state only and is never persisted.
 */
export function MediaParticipantTile({
  participant,
  compact = false,
}: MediaParticipantTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Attach MediaStream to video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const stream = participant.mediaStream;
    if (stream && participant.videoEnabled) {
      video.srcObject = stream;
      video.play().catch(() => {
        // Autoplay may be blocked — user interaction required
      });
    } else {
      video.srcObject = null;
    }
  }, [participant.mediaStream, participant.videoEnabled]);

  // Attach MediaStream to audio element for remote participants
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Only attach audio for remote participants
    if (!participant.local && participant.mediaStream && participant.audioEnabled) {
      audio.srcObject = participant.mediaStream;
      audio.play().catch(() => {
        // Audio autoplay may be blocked
      });
    } else {
      audio.srcObject = null;
    }
  }, [participant.mediaStream, participant.audioEnabled, participant.local]);

  const hasVideo = participant.videoEnabled && participant.mediaStream;
  const hasAudio = participant.audioEnabled && !participant.local;

  return (
    <div
      className={`
        relative overflow-hidden rounded-lg
        ${compact ? "h-24 w-32" : "h-48 w-64"}
        bg-(--vestara-text-dim)/20
        border border-(--vestara-text-dim)/20
      `}
      data-testid={`media-participant-${participant.id}`}
    >
      {/* Video element (hidden if no video) */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={participant.local}
        className={`
          absolute inset-0 h-full w-full object-cover
          ${hasVideo ? "" : "hidden"}
          ${participant.local ? "scale-x-[-1]" : ""}
        `}
      />

      {/* Audio-only placeholder (no video) */}
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-(--vestara-accent)/20">
            <span className="text-lg text-(--vestara-accent-text)">
              {participant.displayName.charAt(0).toUpperCase()}
            </span>
          </div>
        </div>
      )}

      {/* Audio element (remote only, hidden) */}
      {hasAudio && (
        <audio ref={audioRef} autoPlay playsInline className="hidden" />
      )}

      {/* Participant label */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-2 py-1">
        <div className="flex items-center gap-1">
          <span className="truncate text-xs text-white">
            {participant.local ? "You" : participant.displayName}
          </span>
        </div>
      </div>
    </div>
  );
}
