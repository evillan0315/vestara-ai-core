/**
 * @vestara/workspace — Media Conference Components
 *
 * Standalone, reusable media conference UI components.
 * No Activity Room dependency — usable in any context.
 *
 * Architecture:
 *   MediaConference → useMediaConference → MediaConferenceClient → BrowserAdapter
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-006 Media Conference
 */

export { MediaConference, type MediaConferenceProps } from "./MediaConference";
export { MediaParticipantTile, type MediaParticipantTileProps } from "./MediaParticipantTile";
export { MediaControls, type MediaControlsProps } from "./MediaControls";
export {
  useMediaConference,
  type UseMediaConferenceOptions,
  type UseMediaConferenceReturn,
} from "./useMediaConference";
