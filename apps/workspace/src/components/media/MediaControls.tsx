/**
 * @vestara/workspace — MediaControls
 *
 * Camera, microphone, and leave controls for the media conference.
 * Consumes normalized state from useMediaConference.
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-006 Media Conference
 */

import type { UseMediaConferenceReturn } from "./useMediaConference";

/** Props for MediaControls. */
export interface MediaControlsProps {
  /** The useMediaConference hook return value. */
  readonly media: UseMediaConferenceReturn;
}

/**
 * Media conference controls — mic, camera, leave.
 *
 * Follows the Vestara visual system: Tailwind v4 + --vestara-* tokens.
 */
export function MediaControls({ media }: MediaControlsProps) {
  const { state, toggleCamera, toggleMicrophone, disconnect } = media;

  // No controls when not connected
  if (state.state !== "connected") return null;

  return (
    <div className="flex items-center justify-center gap-3 p-3">
      {/* Microphone toggle */}
      <button
        type="button"
        onClick={() => toggleMicrophone()}
        className={`
          flex h-10 w-10 items-center justify-center rounded-full
          border transition-colors cursor-pointer
          ${state.microphoneEnabled
            ? "border-(--vestara-accent-border) bg-(--vestara-accent-bg) text-(--vestara-accent-text) hover:border-(--vestara-accent-border-hover)"
            : "border-(--vestara-red)/40 bg-(--vestara-red)/10 text-(--vestara-red) hover:border-(--vestara-red)/60"
          }
        `}
        title={state.microphoneEnabled ? "Mute microphone" : "Unmute microphone"}
        data-testid="media-mic-toggle"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {state.microphoneEnabled ? (
            <>
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </>
          ) : (
            <>
              <line x1="2" x2="22" y1="2" y2="22" />
              <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
              <path d="M5 10v2a7 7 0 0 0 12 5" />
              <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </>
          )}
        </svg>
      </button>

      {/* Camera toggle */}
      <button
        type="button"
        onClick={() => toggleCamera()}
        className={`
          flex h-10 w-10 items-center justify-center rounded-full
          border transition-colors cursor-pointer
          ${state.cameraEnabled
            ? "border-(--vestara-accent-border) bg-(--vestara-accent-bg) text-(--vestara-accent-text) hover:border-(--vestara-accent-border-hover)"
            : "border-(--vestara-red)/40 bg-(--vestara-red)/10 text-(--vestara-red) hover:border-(--vestara-red)/60"
          }
        `}
        title={state.cameraEnabled ? "Turn off camera" : "Turn on camera"}
        data-testid="media-camera-toggle"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {state.cameraEnabled ? (
            <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
          ) : (
            <>
              <line x1="2" x2="22" y1="2" y2="22" />
              <path d="m7 7-1.35 1.021A2 2 0 0 0 5 9.87V17a2 2 0 0 0 2 2h10a2 2 0 0 0 1.82-1.13l.86-1.3" />
            </>
          )}
          <rect x="2" y="6" width="14" height="12" rx="2" />
        </svg>
      </button>

      {/* Leave */}
      <button
        type="button"
        onClick={() => disconnect()}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-(--vestara-red)/40 bg-(--vestara-red)/10 text-(--vestara-red) transition-colors hover:border-(--vestara-red)/60 cursor-pointer"
        title="Leave media conference"
        data-testid="media-leave-button"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" x2="9" y1="12" y2="12" />
        </svg>
      </button>
    </div>
  );
}
