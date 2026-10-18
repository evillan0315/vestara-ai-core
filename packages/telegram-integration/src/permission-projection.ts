/**
 * VES-TG-016: Telegram Governed Permission Requests
 *
 * Projects canonical approval/permission requests from the Vestara backend
 * to Telegram inline keyboards, and parses approval intents back. Telegram is
 * a channel — it can receive and submit approval intents but can never
 * authorize directly (TG-S3/S5). All authorization decisions remain with the
 * Vestara Policy Authority.
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform (TG-016)
 *   @see docs/blueprint/VES-TG-001-telegram-integration.md
 */

import { randomBytes } from 'node:crypto';
import type { ChannelButton, ChannelDelivery } from '@vestara/channel-types';

// ─── Types ─────────────────────────────────────────────────────

/** Risk levels from the canonical policy authority. */
export type PermissionRisk = 'low' | 'medium' | 'high' | 'critical';

/** Status of a permission request. */
export type PermissionRequestStatus = 'pending' | 'approved' | 'denied' | 'expired';

/** Minimal approval request shape required for projection. Structural —
 *  callers adapt their own ApprovalRequestPayload onto this. */
export interface ProjectablePermissionRequest {
  readonly approvalId: string;
  readonly callId: string;
  readonly toolName: string;
  readonly reason: string;
  readonly risk: PermissionRisk;
  readonly status: PermissionRequestStatus;
  readonly conversationId?: string;
  readonly executionId?: string;
  readonly workspaceId?: string;
  readonly requestedAt: string;
  readonly expiresAt?: string;
}

/** Parsed approval callback from Telegram. */
export type ParsedApprovalCallback =
  | { readonly kind: 'approve'; readonly approvalId: string }
  | { readonly kind: 'deny'; readonly approvalId: string }
  | { readonly kind: 'view'; readonly approvalId: string }
  | { readonly kind: 'noop' };

export interface PermissionProjectionConfig {
  /** Whether to include the reason in the projected text */
  readonly includeReason?: boolean;
  /** Whether to include risk level in the projected text */
  readonly includeRisk?: boolean;
  /** Whether to include a "View in Vestara" button */
  readonly includeViewButton?: boolean;
  /** Base URL for deep links */
  readonly vestaraBaseUrl?: string;
}

// ─── Defaults ──────────────────────────────────────────────────

const DEFAULT_CONFIG: Required<PermissionProjectionConfig> = {
  includeReason: true,
  includeRisk: true,
  includeViewButton: true,
  vestaraBaseUrl: 'https://vestara.ai',
};

/** Callback data namespace for permission requests. */
export const PERMISSION_CALLBACK_PREFIX = 'perm';

/** Maximum callback data bytes (Telegram limit). */
const MAX_CALLBACK_BYTES = 64;

// ─── Risk Metadata ────────────────────────────────────────────

const RISK_EMOJI: Record<PermissionRisk, string> = {
  low: '🟢',
  medium: '🟡',
  high: '🟠',
  critical: '🔴',
};

const RISK_LABEL: Record<PermissionRisk, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

// ─── Permission Projection Service ─────────────────────────────

export class TelegramPermissionProjection {
  private config: Required<PermissionProjectionConfig>;
  private pendingRequests: Map<string, ProjectablePermissionRequest> = new Map();

  constructor(config?: PermissionProjectionConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Project a permission request to a Telegram delivery with inline
   * approve/deny buttons. Returns null when the request is not pending
   * (already approved, denied, or expired).
   */
  projectRequest(request: ProjectablePermissionRequest, chatId: string): ChannelDelivery | null {
    if (request.status !== 'pending') return null;

    if (this.isExpired(request)) {
      this.pendingRequests.delete(request.approvalId);
      return null;
    }

    this.pendingRequests.set(request.approvalId, request);

    const text = this.renderRequestText(request);
    const keyboard = this.buildKeyboard(request);

    return {
      id: `perm-${Date.now()}-${randomBytes(4).toString('hex')}`,
      channel: 'telegram',
      conversation: {
        channel: 'telegram',
        externalId: chatId,
        type: 'direct',
      },
      content: {
        text,
        inlineKeyboard: keyboard.length > 0 ? keyboard : undefined,
      },
      priority: request.risk === 'critical' || request.risk === 'high' ? 'high' : 'normal',
      metadata: {
        approvalId: request.approvalId,
        callId: request.callId,
        toolName: request.toolName,
        risk: request.risk,
        ...(request.workspaceId ? { workspaceId: request.workspaceId } : {}),
      },
    };
  }

  /**
   * Parse an approval callback from Telegram. Fail-closed: unknown or
   * malformed callbacks return null. Only approve/deny/view intents are
   * supported — Telegram cannot authorize directly.
   */
  parseApprovalCallback(callbackData: string | undefined): ParsedApprovalCallback | null {
    if (!callbackData) return null;
    const parts = callbackData.split(':');
    if (parts[0] !== PERMISSION_CALLBACK_PREFIX) return null;

    const op = parts[1];
    const approvalId = parts[2];

    if (!approvalId || approvalId.length === 0) return null;

    if (op === 'approve') return { kind: 'approve', approvalId };
    if (op === 'deny') return { kind: 'deny', approvalId };
    if (op === 'view') return { kind: 'view', approvalId };
    if (op === 'noop') return { kind: 'noop' };

    return null;
  }

  /**
   * Check whether a request is known to this projection (was previously
   * projected and is still pending).
   */
  isPending(approvalId: string): boolean {
    return this.pendingRequests.has(approvalId);
  }

  /**
   * Get a pending request by ID.
   */
  getPending(approvalId: string): ProjectablePermissionRequest | undefined {
    return this.pendingRequests.get(approvalId);
  }

  /**
   * Mark a request as resolved (approved/denied). Removes from pending.
   */
  resolveRequest(approvalId: string): void {
    this.pendingRequests.delete(approvalId);
  }

  /**
   * Check whether a request has expired.
   */
  isExpired(request: ProjectablePermissionRequest, now: Date = new Date()): boolean {
    if (!request.expiresAt) return false;
    const expiry = Date.parse(request.expiresAt);
    if (Number.isNaN(expiry)) return false;
    return now.getTime() > expiry;
  }

  /**
   * Get all pending requests.
   */
  getPendingRequests(): readonly ProjectablePermissionRequest[] {
    return Array.from(this.pendingRequests.values());
  }

  // ─── Internal Methods ───────────────────────────────────────

  private renderRequestText(request: ProjectablePermissionRequest): string {
    const lines: string[] = ['🔐 **Approval Required**', ''];

    lines.push(`Tool: \`${request.toolName}\``);

    if (this.config.includeRisk) {
      lines.push(`Risk: ${RISK_EMOJI[request.risk]} ${RISK_LABEL[request.risk]}`);
    }

    if (this.config.includeReason && request.reason) {
      lines.push('', request.reason);
    }

    if (request.executionId) {
      lines.push('', `_Execution: ${request.executionId}_`);
    }

    return lines.join('\n');
  }

  private buildKeyboard(request: ProjectablePermissionRequest): ChannelButton[][] {
    const rows: ChannelButton[][] = [
      [
        { text: '✅ Approve', callbackData: this.buildCallback('approve', request.approvalId) },
        { text: '❌ Deny', callbackData: this.buildCallback('deny', request.approvalId) },
      ],
    ];

    if (this.config.includeViewButton) {
      const deepLink = this.buildDeepLink(request);
      rows.push([
        {
          text: '🔗 View in Vestara',
          callbackData: this.buildCallback('view', request.approvalId),
          url: deepLink,
        },
      ]);
    }

    return rows;
  }

  private buildCallback(op: string, approvalId: string): string {
    const data = `${PERMISSION_CALLBACK_PREFIX}:${op}:${approvalId}`;
    if (new TextEncoder().encode(data).length > MAX_CALLBACK_BYTES) {
      return `${PERMISSION_CALLBACK_PREFIX}:${op}`;
    }
    return data;
  }

  private buildDeepLink(request: ProjectablePermissionRequest): string {
    const base = this.config.vestaraBaseUrl.replace(/\/+$/, '');
    return `${base}/approvals/${request.approvalId}`;
  }
}

// ─── Pure Helpers ─────────────────────────────────────────────

/**
 * Validate that an approval callback is for a known pending request.
 * Returns null when the request is unknown or no longer pending.
 */
export function validateApprovalIntent(
  callback: ParsedApprovalCallback,
  isPending: (approvalId: string) => boolean,
): ParsedApprovalCallback | null {
  if (callback.kind === 'noop') return null;
  if (!isPending(callback.approvalId)) return null;
  return callback;
}
