/**
 * VES-TG-007: Telegram Identity Pairing
 *
 * Handles pairing of Telegram accounts to Vestara principals.
 * Implements one-time token flow for secure identity binding.
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform (TG-007)
 *   @see docs/blueprint/VES-TG-001-telegram-integration.md
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

// ─── Types ─────────────────────────────────────────────────────

export type PairingStatus = 'pending' | 'approved' | 'expired' | 'revoked';

export interface PairingRequest {
  /** Unique pairing request ID */
  readonly id: string;

  /** Telegram user ID */
  readonly telegramUserId: string;

  /** Telegram display name */
  readonly telegramDisplayName: string;

  /** Pairing token (short-lived, one-time) */
  readonly token: string;

  /** Current status */
  readonly status: PairingStatus;

  /** ISO-8601 timestamp when request was created */
  readonly createdAt: string;

  /** ISO-8601 timestamp when request expires */
  readonly expiresAt: string;

  /** ISO-8601 timestamp when request was approved (if approved) */
  readonly approvedAt?: string;

  /** Vestara principal ID (if approved) */
  readonly principalId?: string;
}

export interface TelegramIdentityBinding {
  /** Binding ID */
  readonly id: string;

  /** Telegram user ID */
  readonly telegramUserId: string;

  /** Telegram display name */
  readonly telegramDisplayName: string;

  /** Vestara principal ID */
  readonly principalId: string;

  /** Vestara principal name */
  readonly principalName: string;

  /** ISO-8601 timestamp when binding was created */
  readonly createdAt: string;

  /** Whether binding is active */
  readonly active: boolean;
}

export interface PairingConfig {
  /** Token length (characters) */
  readonly tokenLength?: number;

  /** Token expiry in milliseconds */
  readonly tokenExpiryMs?: number;

  /** Maximum pending requests per Telegram user */
  readonly maxPendingPerUser?: number;
}

// ─── Default Config ────────────────────────────────────────────

const DEFAULT_CONFIG: Required<PairingConfig> = {
  tokenLength: 8,
  tokenExpiryMs: 10 * 60 * 1000, // 10 minutes
  maxPendingPerUser: 1,
};

// ─── Pairing Service ───────────────────────────────────────────

export class TelegramPairingService {
  private config: Required<PairingConfig>;
  private pendingRequests: Map<string, PairingRequest> = new Map();
  private bindings: Map<string, TelegramIdentityBinding> = new Map();
  private tokenToRequest: Map<string, string> = new Map();

  constructor(config?: PairingConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create a pairing request for a Telegram user.
   * Returns the pairing token to display to the user.
   */
  createPairingRequest(
    telegramUserId: string,
    telegramDisplayName: string,
  ): PairingRequest {
    // Check if already bound
    const existingBinding = this.getBindingByTelegramId(telegramUserId);
    if (existingBinding?.active) {
      throw new Error('Telegram user is already paired');
    }

    // Check pending requests limit
    const pendingCount = Array.from(this.pendingRequests.values()).filter(
      (r) => r.telegramUserId === telegramUserId && r.status === 'pending',
    ).length;

    if (pendingCount >= this.config.maxPendingPerUser) {
      throw new Error('Maximum pending pairing requests reached');
    }

    // Generate token
    const token = this.generateToken();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + this.config.tokenExpiryMs).toISOString();

    const request: PairingRequest = {
      id: `pair-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      telegramUserId,
      telegramDisplayName,
      token,
      status: 'pending',
      createdAt: now,
      expiresAt,
    };

    this.pendingRequests.set(request.id, request);
    this.tokenToRequest.set(token, request.id);

    return request;
  }

  /**
   * Approve a pairing request using the token.
   * Called from the Vestara UI after authenticated approval.
   */
  approvePairing(
    token: string,
    principalId: string,
    principalName: string,
  ): TelegramIdentityBinding {
    const requestId = this.tokenToRequest.get(token);
    if (!requestId) {
      throw new Error('Invalid pairing token');
    }

    const request = this.pendingRequests.get(requestId);
    if (!request) {
      throw new Error('Pairing request not found');
    }

    // Check expiry
    if (new Date(request.expiresAt) < new Date()) {
      throw new Error('Pairing request has expired');
    }

    // Check status
    if (request.status !== 'pending') {
      throw new Error(`Pairing request is ${request.status}`);
    }

    const now = new Date().toISOString();

    // Create binding
    const binding: TelegramIdentityBinding = {
      id: `binding-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      telegramUserId: request.telegramUserId,
      telegramDisplayName: request.telegramDisplayName,
      principalId,
      principalName,
      createdAt: now,
      active: true,
    };

    // Update request status
    const updatedRequest: PairingRequest = {
      ...request,
      status: 'approved',
      approvedAt: now,
      principalId,
    };

    this.pendingRequests.set(request.id, updatedRequest);
    this.tokenToRequest.delete(token);
    this.bindings.set(binding.id, binding);

    return binding;
  }

  /**
   * Revoke a pairing binding.
   */
  revokeBinding(bindingId: string): void {
    const binding = this.bindings.get(bindingId);
    if (binding) {
      this.bindings.delete(bindingId);
    }
  }

  /**
   * Get binding by Telegram user ID.
   */
  getBindingByTelegramId(telegramUserId: string): TelegramIdentityBinding | undefined {
    for (const binding of this.bindings.values()) {
      if (binding.telegramUserId === telegramUserId && binding.active) {
        return binding;
      }
    }
    return undefined;
  }

  /**
   * Get binding by principal ID.
   */
  getBindingByPrincipalId(principalId: string): TelegramIdentityBinding | undefined {
    for (const binding of this.bindings.values()) {
      if (binding.principalId === principalId && binding.active) {
        return binding;
      }
    }
    return undefined;
  }

  /**
   * Get pending pairing request by token.
   */
  getPendingRequest(token: string): PairingRequest | undefined {
    const requestId = this.tokenToRequest.get(token);
    if (!requestId) return undefined;
    return this.pendingRequests.get(requestId);
  }

  /**
   * Check if a Telegram user is paired.
   */
  isPaired(telegramUserId: string): boolean {
    return this.getBindingByTelegramId(telegramUserId) !== undefined;
  }

  /**
   * Resolve Telegram user to Vestara principal ID.
   */
  resolvePrincipalId(telegramUserId: string): string | undefined {
    return this.getBindingByTelegramId(telegramUserId)?.principalId;
  }

  /**
   * Generate a pairing token.
   */
  private generateToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let token = '';
    for (let i = 0; i < this.config.tokenLength; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }
}
