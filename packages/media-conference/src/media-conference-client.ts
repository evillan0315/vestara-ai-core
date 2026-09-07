/**
 * @vestara/media-conference — MediaConferenceClient
 *
 * Browser-side media conference client that wraps a BrowserAdapter
 * and exposes provider-neutral normalized state.
 *
 * React components never touch the BrowserAdapter, openvidu-browser,
 * or any provider-specific objects directly. They consume the
 * normalized MediaConferenceSnapshot.
 *
 * Architecture:
 *   React → useMediaConference → MediaConferenceClient → BrowserAdapter → openvidu-browser
 *
 * Credential Boundary:
 *   - connect() receives an ephemeral credential string
 *   - Credential is consumed for connection, then discarded
 *   - Never stored in localStorage, sessionStorage, IndexedDB, URL, DOM, or React state
 *
 * Lifecycle:
 *   idle → connecting → connected → disconnected
 *                     ↘ failed
 *
 * MediaStream Ownership:
 *   MediaStream references exist in ephemeral browser UI state only.
 *   They must not enter persistence, EventBus, Activity records,
 *   evidence, telemetry, or serialized state.
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-006 Media Conference
 */

import type {
  BrowserAdapter,
  MediaConferenceClientEvents,
  MediaConferenceContext,
  MediaConferenceParticipant,
  MediaConferenceSnapshot,
  MediaConferenceState,
  SubscriberHandle,
} from './types.js';

// ─── MediaConferenceClient ───────────────────────────────────

/**
 * Browser-side media conference client.
 *
 * Provides provider-neutral normalized state to React components.
 * Never exposes provider objects to the UI layer.
 *
 * Credential is consumed once during connect() and discarded.
 */
export class MediaConferenceClient {
  private state: MediaConferenceState = 'idle';
  private participants: MediaConferenceParticipant[] = [];
  private cameraEnabled = false;
  private microphoneEnabled = false;
  private error: string | null = null;

  // Adapter objects (private — never exposed)
  private adapter: BrowserAdapter | null = null;
  private publisher: import('./types.js').PublisherHandle | null = null;
  private readonly subscribers = new Map<string, SubscriberHandle>();

  // Callbacks
  private events: MediaConferenceClientEvents = {};

  // Context (consumed on connect, then discarded from memory)
  private context: MediaConferenceContext | null = null;

  constructor() {}

  /**
   * Register event callbacks.
   */
  on(events: MediaConferenceClientEvents): void {
    this.events = { ...this.events, ...events };
  }

  /**
   * Get current normalized state.
   */
  getState(): MediaConferenceSnapshot {
    return {
      state: this.state,
      participants: this.participants,
      localParticipant: this.participants.find((p) => p.local) ?? null,
      remoteParticipants: this.participants.filter((p) => !p.local),
      cameraEnabled: this.cameraEnabled,
      microphoneEnabled: this.microphoneEnabled,
      error: this.error,
    };
  }

  /**
   * Connect to a media session.
   *
   * Consumes the context's credential for connection. The credential string
   * is passed to the adapter's connect() and then discarded from memory.
   *
   * @param context - The connection context (credential consumed, not stored)
   * @param adapterFactory - Factory that creates a BrowserAdapter for this connection
   */
  async connect(context: MediaConferenceContext, adapterFactory: () => BrowserAdapter): Promise<void> {
    if (this.state !== 'idle' && this.state !== 'disconnected' && this.state !== 'failed') {
      throw new Error(`Cannot connect in state: ${this.state}`);
    }

    this.setState('connecting');
    this.error = null;

    try {
      // Create adapter
      this.adapter = adapterFactory();

      // Wire up adapter events
      this.adapter.on({
        onRemoteStreamCreated: (subscriber) => this.handleRemoteStreamCreated(subscriber),
        onRemoteStreamDestroyed: (streamId, connectionId) => this.handleRemoteStreamDestroyed(streamId, connectionId),
        onSessionDisconnected: () => this.handleSessionDisconnected(),
        onError: (err) => this.handleError(err),
      });

      // Connect to session (credential consumed here)
      await this.adapter.connect(context.serverUrl, context.credential);

      // Publish local media
      this.publisher = await this.adapter.publish({
        publishAudio: context.publishAudio ?? true,
        publishVideo: context.publishVideo ?? true,
      });

      // Set local state
      this.cameraEnabled = context.publishVideo ?? true;
      this.microphoneEnabled = context.publishAudio ?? true;

      // Add local participant
      const localParticipant: MediaConferenceParticipant = {
        id: 'local',
        displayName: context.displayName,
        local: true,
        connectionState: 'connected',
        audioEnabled: this.microphoneEnabled,
        videoEnabled: this.cameraEnabled,
        mediaStream: this.publisher.mediaStream,
      };

      this.participants = [localParticipant];
      this.emitParticipants();
      this.setState('connected');

      // Discard context (credential consumed)
      this.context = null;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
      this.setState('failed');
      this.events.onError?.(this.error);
      throw err;
    }
  }

  /**
   * Disconnect from the media session.
   *
   * Disconnects from the session and cleans up all resources.
   */
  async disconnect(): Promise<void> {
    if (this.state === 'idle' || this.state === 'disconnected') {
      return;
    }

    try {
      // Destroy publisher
      if (this.publisher) {
        this.publisher.destroy();
        this.publisher = null;
      }

      // Destroy subscribers
      for (const sub of this.subscribers.values()) {
        sub.destroy();
      }
      this.subscribers.clear();

      // Disconnect adapter
      if (this.adapter) {
        this.adapter.disconnect();
        this.adapter.destroy();
        this.adapter = null;
      }

      this.participants = [];
      this.cameraEnabled = false;
      this.microphoneEnabled = false;
      this.emitParticipants();
      this.setState('disconnected');
    } catch {
      // Best-effort cleanup
      this.setState('disconnected');
    }
  }

  /**
   * Toggle camera on/off.
   *
   * Operates on browser/provider media state only.
   * Does NOT modify any host-side lifecycle (e.g., ActivityMediaBinding).
   */
  async toggleCamera(): Promise<boolean> {
    if (!this.publisher) return this.cameraEnabled;

    const newState = !this.cameraEnabled;
    this.publisher.publishVideo(newState);
    this.cameraEnabled = newState;

    // Update local participant
    this.updateLocalParticipant({
      videoEnabled: newState,
      mediaStream: this.publisher.mediaStream,
    });

    this.events.onCameraChange?.(newState);
    return newState;
  }

  /**
   * Toggle microphone on/off.
   *
   * Operates on browser/provider media state only.
   * Does NOT modify any host-side lifecycle.
   */
  async toggleMicrophone(): Promise<boolean> {
    if (!this.publisher) return this.microphoneEnabled;

    const newState = !this.microphoneEnabled;
    this.publisher.publishAudio(newState);
    this.microphoneEnabled = newState;

    // Update local participant
    this.updateLocalParticipant({
      audioEnabled: newState,
    });

    this.events.onMicrophoneChange?.(newState);
    return newState;
  }

  /**
   * Destroy the client and release all resources.
   */
  destroy(): void {
    // Synchronous best-effort cleanup
    try {
      this.publisher?.destroy();
    } catch {
      /* ignore */
    }

    for (const sub of this.subscribers.values()) {
      try {
        sub.destroy();
      } catch {
        /* ignore */
      }
    }
    this.subscribers.clear();

    try {
      this.adapter?.disconnect();
      this.adapter?.destroy();
    } catch {
      /* ignore */
    }

    this.adapter = null;
    this.publisher = null;
    this.participants = [];
    this.events = {};
  }

  // ─── Private ──────────────────────────────────────────────

  private setState(newState: MediaConferenceState): void {
    if (this.state === newState) return;
    this.state = newState;
    this.events.onStateChange?.(newState);
  }

  private handleRemoteStreamCreated(subscriber: SubscriberHandle): void {
    this.subscribers.set(subscriber.streamId, subscriber);

    const participant: MediaConferenceParticipant = {
      id: subscriber.connectionId,
      displayName: subscriber.displayName,
      local: false,
      connectionState: 'connected',
      audioEnabled: subscriber.audioActive,
      videoEnabled: subscriber.videoActive,
      mediaStream: subscriber.mediaStream,
    };

    this.participants = [...this.participants, participant];
    this.emitParticipants();
  }

  private handleRemoteStreamDestroyed(streamId: string, connectionId: string): void {
    const sub = this.subscribers.get(streamId);
    if (sub) {
      sub.destroy();
      this.subscribers.delete(streamId);
    }

    this.participants = this.participants.filter((p) => p.id !== connectionId && p.id !== streamId);
    this.emitParticipants();
  }

  private handleSessionDisconnected(): void {
    // Clean up all remote participants
    for (const sub of this.subscribers.values()) {
      try {
        sub.destroy();
      } catch {
        /* ignore */
      }
    }
    this.subscribers.clear();

    this.participants = [];
    this.cameraEnabled = false;
    this.microphoneEnabled = false;
    this.emitParticipants();
    this.setState('disconnected');
  }

  private handleError(message: string): void {
    this.error = message;
    this.events.onError?.(message);
  }

  private updateLocalParticipant(updates: Partial<MediaConferenceParticipant>): void {
    this.participants = this.participants.map((p) => (p.local ? { ...p, ...updates } : p));
    this.emitParticipants();
  }

  private emitParticipants(): void {
    this.events.onParticipantsChange?.([...this.participants]);
  }
}
