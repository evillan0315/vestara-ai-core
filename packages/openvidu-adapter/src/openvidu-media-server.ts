/**
 * @vestara/openvidu-adapter — OpenVidu MediaServer Adapter
 *
 * Implements the MediaServer port against the native OpenVidu 2.25 REST API.
 *
 * This is the adapter boundary:
 *   - Maps OpenVidu objects → Vestara domain objects
 *   - Maps Vestara capabilities → OpenVidu roles
 *   - Normalizes OpenVidu errors → MediaError hierarchy
 *   - Constructs credentials via OVR-011 factory
 *   - Never exports OpenVidu Session, Connection, role enums, or SDK classes
 *
 * Security:
 *   - Basic Auth credentials never logged or included in errors
 *   - Connection credentials never ambiently serialized
 *   - Provider response tokens consumed ephemerally
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-000 → OVR-011 → OVR-002
 */

import type {
  CreateMediaConnectionOptions,
  CreateMediaConnectionResult,
  CreateMediaSessionOptions,
  MediaConnection,
  MediaProviderCapabilities,
  MediaServer,
  MediaSession,
} from '@vestara/media-runtime';
import {
  createMediaConnectionCredential,
  createProviderCapabilities,
  MediaCapabilityNotSupportedError,
  MediaConnectionNotFoundError,
  MediaSessionAlreadyClosedError,
  MediaSessionNotFoundError,
} from '@vestara/media-runtime';
import { isOpenViduError, normalizeToMediaError, OpenViduError } from './openvidu-errors';
import type { OpenViduTransport } from './openvidu-transport';
import { createOpenViduTransport } from './openvidu-transport';
import type { OpenViduConfig, OpenViduConnectionResponse, OpenViduSessionResponse } from './openvidu-types';
import { OPENVIDU_PATHS } from './openvidu-types';
import { capabilitiesToOpenViduRole, openViduRoleToCapabilities } from './role-mapping';

/**
 * OpenVidu 2.25 adapter behind the MediaServer port.
 *
 * Creates a provider-neutral MediaServer that delegates to the
 * native OpenVidu REST API via HTTP transport.
 */
export class OpenViduMediaServer implements MediaServer {
  readonly provider = 'openvidu';
  readonly version = '2.25.0';

  private readonly transport: OpenViduTransport;
  private readonly config: OpenViduConfig;

  /** In-memory session registry (Vestara domain objects). */
  private readonly sessions = new Map<string, MediaSession>();

  /** In-memory connection registry (Vestara domain objects). */
  private readonly connections = new Map<string, MediaConnection>();

  constructor(config: OpenViduConfig, transport?: OpenViduTransport) {
    this.config = config;
    this.transport = transport ?? createOpenViduTransport(config);
  }

  // ─── Capabilities ──────────────────────────────────────────

  getCapabilities(): MediaProviderCapabilities {
    return createProviderCapabilities(this.provider, this.version, {
      sessions: true,
      connections: true,
      webrtcAudio: true,
      webrtcVideo: true,
      publish: true,
      subscribe: true,
      screenShare: false, // Browser capability, not server
      recording: false, // VidUK deployment disabled
      transcoding: false, // Server config: allowTranscoding=false
      simulcast: false, // Server config: OPENVIDU_WEBRTC_SIMULCAST=false
      moderation: true, // MODERATOR role available
      metadata: true, // OpenVidu supports metadata on sessions/connections
    });
  }

  // ─── Health ────────────────────────────────────────────────

  async healthCheck(): Promise<boolean> {
    try {
      // Use GET sessions as a health probe
      await this.transport.request<OpenViduSessionResponse[]>('GET', OPENVIDU_PATHS.sessions);
      return true;
    } catch {
      return false;
    }
  }

  // ─── Session Operations ────────────────────────────────────

  async createSession(options?: CreateMediaSessionOptions): Promise<MediaSession> {
    const vestaraId = options?.id ?? generateId('sess');

    try {
      const response = await this.transport.request<OpenViduSessionResponse>('POST', OPENVIDU_PATHS.sessions, {
        customSessionId: vestaraId,
        ...(options?.metadata ? { metadata: options.metadata } : {}),
      });

      const session: MediaSession = {
        id: vestaraId,
        provider: this.provider,
        externalSessionId: response.id ?? response.sessionId,
        status: 'active',
        customId: !!options?.id,
        createdAt: Date.now(),
        ...(response.createdAt ? { createdAt: response.createdAt } : {}),
      };

      this.sessions.set(vestaraId, session);
      return session;
    } catch (error) {
      throw normalizeError(error, 'createSession');
    }
  }

  async getSession(sessionId: string): Promise<MediaSession | undefined> {
    // Check local registry first
    const local = this.sessions.get(sessionId);
    if (local?.status === 'closed') return undefined;

    if (local?.externalSessionId) {
      try {
        // Sync with provider
        const response = await this.transport.request<OpenViduSessionResponse>(
          'GET',
          OPENVIDU_PATHS.sessionById(local.externalSessionId),
        );

        // Update local state from provider
        const updated: MediaSession = {
          ...local,
          status: 'active',
          updatedAt: Date.now(),
        };

        this.sessions.set(sessionId, updated);
        return updated;
      } catch (error) {
        if (isOpenViduError(error) && error.category === 'NOT_FOUND') {
          // Session no longer exists on provider
          const closed: MediaSession = { ...local, status: 'closed', closedAt: Date.now() };
          this.sessions.set(sessionId, closed);
          return undefined;
        }
        throw normalizeError(error, 'getSession');
      }
    }

    return local;
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new MediaSessionNotFoundError(sessionId, this.provider);
    }
    if (session.status === 'closed') {
      throw new MediaSessionAlreadyClosedError(sessionId, this.provider);
    }

    if (session.externalSessionId) {
      try {
        await this.transport.request<void>('DELETE', OPENVIDU_PATHS.sessionById(session.externalSessionId));
      } catch (error) {
        if (isOpenViduError(error) && error.category === 'NOT_FOUND') {
          // Already gone on provider — treat as closed
        } else {
          throw normalizeError(error, 'closeSession');
        }
      }
    }

    const closed: MediaSession = {
      ...session,
      status: 'closed',
      closedAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.sessions.set(sessionId, closed);

    // Close all connections for this session
    for (const [connId, conn] of this.connections) {
      if (conn.sessionId === sessionId && conn.status !== 'disconnected') {
        this.connections.set(connId, {
          ...conn,
          status: 'disconnected',
          disconnectedAt: Date.now(),
          disconnectReason: 'session_closed',
        });
      }
    }
  }

  async listSessions(): Promise<ReadonlyArray<MediaSession>> {
    return Array.from(this.sessions.values()).filter((s) => s.status !== 'closed');
  }

  // ─── Connection Operations ─────────────────────────────────

  async createConnection(
    sessionId: string,
    options: CreateMediaConnectionOptions,
  ): Promise<CreateMediaConnectionResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new MediaSessionNotFoundError(sessionId, this.provider);
    }
    if (session.status === 'closed') {
      throw new MediaSessionAlreadyClosedError(sessionId, this.provider);
    }
    if (!session.externalSessionId) {
      throw new OpenViduError('PROVIDER_ERROR', `Session has no external ID: ${sessionId}`, {
        operation: 'createConnection',
      });
    }

    // Map capabilities → OpenVidu role
    const role = capabilitiesToOpenViduRole(options.capabilities);
    if (role === undefined) {
      throw new MediaCapabilityNotSupportedError(
        `capabilities(${JSON.stringify(options.capabilities)})`,
        this.provider,
      );
    }

    const vestaraId = options.id ?? generateId('conn');

    try {
      const response = await this.transport.request<OpenViduConnectionResponse>(
        'POST',
        OPENVIDU_PATHS.connection(session.externalSessionId),
        {
          role,
          ...(options.metadata ? { metadata: options.metadata } : {}),
        },
      );

      // Construct credential via OVR-001 factory
      // Provider response token consumed ephemerally — not persisted
      const credential = createMediaConnectionCredential({
        value: response.token,
        connectionId: vestaraId,
        sessionId,
        provider: this.provider,
      });

      const connection: MediaConnection = {
        id: vestaraId,
        sessionId,
        externalConnectionId: response.id ?? response.connectionId,
        status: 'active',
        capabilities: openViduRoleToCapabilities(role),
        customId: !!options.id,
        createdAt: Date.now(),
        ...(response.createdAt ? { createdAt: response.createdAt } : {}),
      };

      this.connections.set(vestaraId, connection);

      return { connection, credential };
    } catch (error) {
      throw normalizeError(error, 'createConnection');
    }
  }

  async closeConnection(connectionId: string, reason?: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new MediaConnectionNotFoundError(connectionId, this.provider);
    }
    if (connection.status === 'disconnected') {
      return; // Already disconnected — idempotent
    }

    // Authoritative provider-side force-disconnect
    if (connection.externalConnectionId) {
      const session = this.sessions.get(connection.sessionId);
      if (session?.externalSessionId) {
        try {
          await this.transport.request<void>(
            'DELETE',
            OPENVIDU_PATHS.connectionById(session.externalSessionId, connection.externalConnectionId),
          );
          // 204 = success, provider has disconnected the participant
        } catch (error) {
          if (isOpenViduError(error) && error.category === 'NOT_FOUND') {
            // Connection already gone on provider — treat as disconnected
          } else {
            throw normalizeError(error, 'closeConnection');
          }
        }
      }
    }

    const disconnected: MediaConnection = {
      ...connection,
      status: 'disconnected',
      disconnectedAt: Date.now(),
      disconnectReason: reason ?? 'server_close',
      updatedAt: Date.now(),
    };
    this.connections.set(connectionId, disconnected);
  }

  async getConnection(connectionId: string): Promise<MediaConnection | undefined> {
    const conn = this.connections.get(connectionId);
    if (conn?.status === 'disconnected') return undefined;
    return conn;
  }

  async listConnections(sessionId: string): Promise<ReadonlyArray<MediaConnection>> {
    return Array.from(this.connections.values()).filter(
      (c) => c.sessionId === sessionId && c.status !== 'disconnected',
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

let idCounter = 0;

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${++idCounter}`;
}

/**
 * Normalizes any error into a MediaError at the adapter boundary.
 */
function normalizeError(error: unknown, operation: string): never {
  if (isOpenViduError(error)) {
    throw normalizeToMediaError(error);
  }

  if (error instanceof Error) {
    throw new MediaError('MEDIA_PROVIDER_REJECTED', `${operation} failed: ${error.message}`, {
      provider: 'openvidu',
      cause: error,
    });
  }

  throw new MediaError('MEDIA_PROVIDER_REJECTED', `${operation} failed: unknown error`, {
    provider: 'openvidu',
  });
}

// Re-export for type compatibility
import { MediaError } from '@vestara/media-runtime';
