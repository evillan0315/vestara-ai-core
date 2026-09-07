/**
 * @vestara/media-conference — OpenVidu Browser Adapter
 *
 * Implements the BrowserAdapter interface using openvidu-browser.
 * This is the ONLY file in the media-conference package that
 * references openvidu-browser types. All other code depends on
 * the BrowserAdapter interface.
 *
 * Architecture:
 *   MediaConferenceClient → BrowserAdapter → OpenViduBrowserAdapter → openvidu-browser
 *
 * openvidu-browser is accessed through the global `window.OpenVidu`
 * constructor (loaded via script tag or bundled separately).
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-006 Media Conference
 */

import type { BrowserAdapter, BrowserAdapterEvents, PublisherHandle, SubscriberHandle } from './types.js';

/**
 * Resolve the OpenVidu constructor at connect-time.
 *
 * Strategy (browser): openvidu-browser is CJS — Vite pre-bundles it into an ESM
 * wrapper via optimizeDeps.include.  We dynamic-import it so the side-effect of
 * bundling happens, then grab the named `OpenVidu` export.
 *
 * Strategy (Node/tests): The import may fail — we fall back to window.OpenVidu
 * (set by a script tag in non-Vite environments).
 */
let _ovModule: any = null;

async function resolveOpenViduCtor(): Promise<any> {
  if (_ovModule?.OpenVidu) return _ovModule.OpenVidu;

  // Browser path — Vite resolves the CJS → ESM wrapper
  if (typeof window !== 'undefined') {
    try {
      _ovModule = await import('openvidu-browser');
      if (_ovModule?.OpenVidu) return _ovModule.OpenVidu;
    } catch {
      /* may fail in non-Vite environments */
    }
    // Fallback: script-tag loading (sets window.OpenVidu)
    if ((window as any).OpenVidu) return (window as any).OpenVidu;
  }

  throw new Error('openvidu-browser not loaded. Ensure the OpenVidu browser SDK is included.');
}

// ─── OpenViduBrowserAdapter ──────────────────────────────────

/**
 * OpenVidu browser adapter.
 *
 * Wraps openvidu-browser behind the BrowserAdapter interface.
 * Never exposes OpenVidu Session, Publisher, Subscriber, or Stream
 * objects to the caller.
 */
export class OpenViduBrowserAdapter implements BrowserAdapter {
  private events: BrowserAdapterEvents = {};
  private ov: any = null;
  private session: any = null;
  private publisherHandle: OpenViduPublisherHandle | null = null;
  private readonly subscriberHandles = new Map<string, OpenViduSubscriberHandle>();

  on(events: BrowserAdapterEvents): void {
    this.events = { ...this.events, ...events };
  }

  async connect(url: string, token: string): Promise<void> {
    // Resolve OpenVidu constructor — dynamic import so Vite bundles openvidu-browser.
    const Ctor = await resolveOpenViduCtor();

    this.ov = new Ctor();
    this.session = this.ov.initSession();

    // Wire up session events
    this.setupSessionEvents();

    // Connect to session
    await this.session.connect(token, {});
  }

  disconnect(): void {
    if (this.session) {
      try {
        this.session.off();
        this.session.disconnect();
      } catch {
        /* best-effort */
      }
      this.session = null;
    }
    this.ov = null;
  }

  async publish(options: {
    audioSource?: MediaStreamTrack | false;
    videoSource?: MediaStreamTrack | false;
    publishAudio: boolean;
    publishVideo: boolean;
  }): Promise<PublisherHandle> {
    if (!this.ov || !this.session) {
      throw new Error('Not connected');
    }

    const publisher = await this.ov.initPublisherAsync(undefined, {
      audioSource: options.audioSource === false ? false : options.audioSource,
      videoSource: options.videoSource === false ? false : options.videoSource,
      publishAudio: options.publishAudio,
      publishVideo: options.publishVideo,
    });

    await this.session.publish(publisher);

    this.publisherHandle = new OpenViduPublisherHandle(publisher);
    return this.publisherHandle;
  }

  unpublish(): void {
    if (this.publisherHandle) {
      this.publisherHandle.destroy();
      this.publisherHandle = null;
    }
  }

  async subscribe(streamId: string): Promise<SubscriberHandle> {
    if (!this.session) {
      throw new Error('Not connected');
    }

    // Find the stream by ID from the session's remote streams
    // openvidu-browser stores streams internally
    const remoteStreams = this.session.remoteStreams ?? new Map();
    const stream = remoteStreams.get?.(streamId) ?? remoteStreams[streamId];

    if (!stream) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    const subscriber = this.session.subscribe(stream, undefined, {
      insertMode: 'APPEND',
    });

    // Wait for MediaStream to be available
    const mediaStream = await this.waitForMediaStream(stream);

    const handle = new OpenViduSubscriberHandle(
      subscriber,
      streamId,
      stream.connection?.connectionId ?? streamId,
      this.extractDisplayName(stream),
      stream.audioActive ?? false,
      stream.videoActive ?? false,
      mediaStream,
    );

    this.subscriberHandles.set(streamId, handle);
    return handle;
  }

  unsubscribe(streamId: string): void {
    const handle = this.subscriberHandles.get(streamId);
    if (handle) {
      handle.destroy();
      this.subscriberHandles.delete(streamId);
    }
  }

  destroy(): void {
    this.disconnect();

    if (this.publisherHandle) {
      this.publisherHandle.destroy();
      this.publisherHandle = null;
    }

    for (const handle of this.subscriberHandles.values()) {
      handle.destroy();
    }
    this.subscriberHandles.clear();

    this.events = {};
  }

  // ─── Private ──────────────────────────────────────────────

  private setupSessionEvents(): void {
    if (!this.session) return;

    // Remote stream created
    this.session.on('streamCreated', (event: any) => {
      const stream = event.stream;

      // Subscribe
      const subscriber = this.session.subscribe(stream, undefined, {
        insertMode: 'APPEND',
      });

      // Wait for MediaStream and emit
      this.waitForMediaStream(stream).then((mediaStream) => {
        const handle = new OpenViduSubscriberHandle(
          subscriber,
          stream.streamId,
          stream.connection?.connectionId ?? stream.streamId,
          this.extractDisplayName(stream),
          stream.audioActive ?? false,
          stream.videoActive ?? false,
          mediaStream,
        );

        this.subscriberHandles.set(stream.streamId, handle);
        this.events.onRemoteStreamCreated?.(handle);
      });
    });

    // Remote stream destroyed
    this.session.on('streamDestroyed', (event: any) => {
      const streamId = event.stream.streamId;
      const connectionId = event.stream.connection?.connectionId ?? streamId;

      const handle = this.subscriberHandles.get(streamId);
      if (handle) {
        handle.destroy();
        this.subscriberHandles.delete(streamId);
      }

      this.events.onRemoteStreamDestroyed?.(streamId, connectionId);
    });

    // Session disconnected
    this.session.on('sessionDisconnected', () => {
      this.events.onSessionDisconnected?.();
    });
  }

  private async waitForMediaStream(stream: any, maxAttempts = 20): Promise<MediaStream | null> {
    for (let i = 0; i < maxAttempts; i++) {
      const ms = stream.getMediaStream?.();
      if (ms) return ms;
      await new Promise((r) => setTimeout(r, 100));
    }
    return null;
  }

  private extractDisplayName(stream: any): string {
    try {
      if (stream.connection?.data) {
        const data = JSON.parse(stream.connection.data);
        return data.clientData ?? 'Remote';
      }
    } catch {
      /* ignore */
    }
    return 'Remote';
  }
}

// ─── Internal Handles ────────────────────────────────────────

class OpenViduPublisherHandle implements PublisherHandle {
  constructor(private readonly publisher: any) {}

  get mediaStream(): MediaStream | null {
    return this.publisher.stream?.getMediaStream?.() ?? null;
  }

  publishVideo(enabled: boolean): void {
    this.publisher.publishVideo(enabled);
  }

  publishAudio(enabled: boolean): void {
    this.publisher.publishAudio(enabled);
  }

  destroy(): void {
    try {
      this.publisher.off?.();
    } catch {
      /* ignore */
    }
  }
}

class OpenViduSubscriberHandle implements SubscriberHandle {
  constructor(
    private readonly subscriber: any,
    readonly streamId: string,
    readonly connectionId: string,
    readonly displayName: string,
    readonly audioActive: boolean,
    readonly videoActive: boolean,
    readonly mediaStream: MediaStream | null,
  ) {}

  destroy(): void {
    try {
      this.subscriber?.off?.();
    } catch {
      /* ignore */
    }
  }
}
