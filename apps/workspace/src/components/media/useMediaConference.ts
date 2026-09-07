/**
 * @vestara/workspace — useMediaConference Hook
 *
 * React hook that manages the MediaConferenceClient lifecycle
 * and exposes normalized media conference state for UI consumption.
 *
 * Architecture:
 *   React Component → useMediaConference → MediaConferenceClient → BrowserAdapter → openvidu-browser
 *
 * Credential Boundary:
 *   - context.credential is passed once via connect() call
 *   - Consumed by MediaConferenceClient for connection
 *   - Never stored in React state, localStorage, or any persistent state
 *
 * MediaStream Ownership:
 *   - MediaStream references exist in ephemeral browser state only
 *   - Returned via participant.mediaStream for direct <video> attachment
 *   - Never persisted, serialized, or emitted to EventBus
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-006 Media Conference
 */

import { useState, useRef, useCallback, useEffect } from "react";
import {
  MediaConferenceClient,
  type MediaConferenceSnapshot,
  type MediaConferenceState,
  type MediaConferenceParticipant,
  type MediaConferenceContext,
  type BrowserAdapter,
} from "@vestara/media-conference";

/** Default media conference state. */
const DEFAULT_SNAPSHOT: MediaConferenceSnapshot = {
  state: "idle",
  participants: [],
  localParticipant: null,
  remoteParticipants: [],
  cameraEnabled: false,
  microphoneEnabled: false,
  error: null,
};

/** Options for the useMediaConference hook. */
export interface UseMediaConferenceOptions {
  /**
   * Factory that creates a BrowserAdapter for each connection.
   * Called once per connect() invocation.
   */
  createAdapter: () => BrowserAdapter;
}

/** Return type for the useMediaConference hook. */
export interface UseMediaConferenceReturn {
  /** Current normalized media conference state. */
  state: MediaConferenceSnapshot;

  /** Connect to a media session using the provided context. */
  connect: (context: MediaConferenceContext) => Promise<void>;

  /** Disconnect from the media session. */
  disconnect: () => Promise<void>;

  /** Toggle camera on/off. */
  toggleCamera: () => Promise<boolean>;

  /** Toggle microphone on/off. */
  toggleMicrophone: () => Promise<boolean>;

  /** Whether the client is currently connected. */
  isConnected: boolean;

  /** Whether the client is currently connecting. */
  isConnecting: boolean;

  /** Whether the client is in a failed state. */
  isFailed: boolean;

  /** Error message, if any. */
  error: string | null;
}

/**
 * React hook for media conference participation.
 *
 * Manages the MediaConferenceClient lifecycle and exposes normalized
 * media state. Components never touch provider objects directly.
 *
 * Usage:
 * ```tsx
 * const { state, connect, disconnect, toggleCamera, toggleMicrophone } = useMediaConference({
 *   createAdapter: () => new OpenViduBrowserAdapter(),
 * });
 *
 * // To join:
 * await connect({
 *   serverUrl: "https://viduk.swinglifestyle.com",
 *   sessionId: "room-1",
 *   credential: "tok_xxx",
 *   displayName: "User",
 * });
 * ```
 */
export function useMediaConference(
  options: UseMediaConferenceOptions,
): UseMediaConferenceReturn {
  const { createAdapter } = options;

  const [state, setState] = useState<MediaConferenceSnapshot>(DEFAULT_SNAPSHOT);
  const clientRef = useRef<MediaConferenceClient | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clientRef.current?.destroy();
      clientRef.current = null;
    };
  }, []);

  // Create client if needed
  const ensureClient = useCallback((): MediaConferenceClient => {
    if (clientRef.current) {
      return clientRef.current;
    }

    const client = new MediaConferenceClient();

    // Wire up event handlers
    client.on({
      onStateChange: (newState: MediaConferenceState) => {
        setState((prev) => ({ ...prev, state: newState }));
      },
      onParticipantsChange: (participants: readonly MediaConferenceParticipant[]) => {
        setState((prev) => ({
          ...prev,
          participants,
          localParticipant: participants.find((p) => p.local) ?? null,
          remoteParticipants: participants.filter((p) => !p.local),
        }));
      },
      onCameraChange: (enabled: boolean) => {
        setState((prev) => ({ ...prev, cameraEnabled: enabled }));
      },
      onMicrophoneChange: (enabled: boolean) => {
        setState((prev) => ({ ...prev, microphoneEnabled: enabled }));
      },
      onError: (error: string) => {
        setState((prev) => ({ ...prev, error }));
      },
    });

    clientRef.current = client;
    return client;
  }, []);

  const connect = useCallback(
    async (context: MediaConferenceContext) => {
      const client = ensureClient();
      await client.connect(context, createAdapter);
    },
    [ensureClient, createAdapter],
  );

  const disconnect = useCallback(async () => {
    await clientRef.current?.disconnect();
    clientRef.current = null;
    setState(DEFAULT_SNAPSHOT);
  }, []);

  const toggleCamera = useCallback(async () => {
    return clientRef.current?.toggleCamera() ?? false;
  }, []);

  const toggleMicrophone = useCallback(async () => {
    return clientRef.current?.toggleMicrophone() ?? false;
  }, []);

  return {
    state,
    connect,
    disconnect,
    toggleCamera,
    toggleMicrophone,
    isConnected: state.state === "connected",
    isConnecting: state.state === "connecting",
    isFailed: state.state === "failed",
    error: state.error,
  };
}
