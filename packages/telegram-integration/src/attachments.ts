/**
 * VES-TG-021: Telegram Attachments
 *
 * Inbound and outbound attachment policy for Telegram. Files are validated
 * before they cross the channel boundary: size, category, MIME type, and
 * filename. Filenames are sanitized so a crafted name can never traverse
 * paths or smuggle control characters into logs or the filesystem.
 *
 * Attachments are data, not authority: a file never changes which principal
 * or workspace the message routes to (TG-S1/S4).
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform (TG-021)
 *   @see docs/blueprint/VES-TG-001-telegram-integration.md
 */

import { randomBytes } from 'node:crypto';
import type { ChannelAttachment } from '@vestara/channel-types';

// ─── Types ─────────────────────────────────────────────────────

export type AttachmentReason =
  | 'allowed'
  | 'empty'
  | 'too-large'
  | 'category-not-allowed'
  | 'mime-not-allowed'
  | 'blocked-extension'
  | 'invalid-filename';

export interface AttachmentValidation {
  /** Whether the attachment may be accepted/sent */
  readonly allowed: boolean;

  /** Why the decision was made */
  readonly reason: AttachmentReason;

  /** Human-readable detail (for surfaces, not for authorization) */
  readonly detail?: string;
}

export interface AttachmentPolicy {
  /** Maximum size in bytes across all categories */
  readonly maxSizeBytes: number;

  /** Per-category size ceilings (override `maxSizeBytes` when set) */
  readonly categoryMaxBytes?: Readonly<Partial<Record<ChannelAttachment['type'], number>>>;

  /** Allowed categories (empty = all categories) */
  readonly allowedCategories?: readonly ChannelAttachment['type'][];

  /** Allowed MIME types (empty = all MIME types) */
  readonly allowedMimeTypes?: readonly string[];

  /** Blocked file extensions, lower-case and dot-prefixed (e.g. `.exe`) */
  readonly blockedExtensions?: readonly string[];
}

// ─── Defaults ──────────────────────────────────────────────────

/**
 * Conservative defaults aligned with Telegram's own Bot API limits
 * (photos 10 MB, documents 50 MB, voice/video/audio 50 MB).
 */
export const DEFAULT_ATTACHMENT_POLICY: AttachmentPolicy = {
  maxSizeBytes: 50 * 1024 * 1024,
  categoryMaxBytes: {
    image: 10 * 1024 * 1024,
  },
  blockedExtensions: ['.exe', '.bat', '.cmd', '.com', '.scr', '.msi', '.dll', '.sh', '.ps1'],
};

// ─── Filename Sanitization ─────────────────────────────────────

/**
 * Reduce an untrusted filename to a safe basename. Returns null when nothing
 * usable remains. Removes directory components, control characters, and
 * characters that are unsafe on common filesystems.
 */
export function sanitizeFileName(name: string): string | null {
  if (typeof name !== 'string') return null;

  // Strip any path component (both separators) before touching the rest.
  const base = name.split(/[/\\]/).pop() ?? '';
  const cleaned = base
    .replace(/\p{Cc}/gu, '')
    .replace(/[<>:"|?*]/g, '_')
    .replace(/^\.+/, '')
    .trim();

  if (cleaned.length === 0 || cleaned === '.' || cleaned === '..') return null;
  return cleaned.slice(0, 255);
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot).toLowerCase();
}

// ─── Validation ────────────────────────────────────────────────

export function validateAttachment(
  attachment: ChannelAttachment,
  policy: AttachmentPolicy = DEFAULT_ATTACHMENT_POLICY,
): AttachmentValidation {
  if (!attachment || typeof attachment.fileName !== 'string' || attachment.fileName.length === 0) {
    return { allowed: false, reason: 'invalid-filename' };
  }

  const safeName = sanitizeFileName(attachment.fileName);
  if (!safeName) {
    return { allowed: false, reason: 'invalid-filename', detail: 'Filename is empty after sanitization' };
  }

  if (typeof attachment.size !== 'number' || !Number.isFinite(attachment.size) || attachment.size <= 0) {
    return { allowed: false, reason: 'empty', detail: 'Attachment reports no size' };
  }

  const categoryLimit = policy.categoryMaxBytes?.[attachment.type] ?? policy.maxSizeBytes;
  if (attachment.size > categoryLimit) {
    return {
      allowed: false,
      reason: 'too-large',
      detail: `${attachment.size} bytes exceeds limit of ${categoryLimit} bytes`,
    };
  }

  if (
    policy.allowedCategories &&
    policy.allowedCategories.length > 0 &&
    !policy.allowedCategories.includes(attachment.type)
  ) {
    return { allowed: false, reason: 'category-not-allowed', detail: `Category ${attachment.type} is not allowed` };
  }

  if (
    policy.allowedMimeTypes &&
    policy.allowedMimeTypes.length > 0 &&
    !policy.allowedMimeTypes.includes(attachment.mimeType)
  ) {
    return { allowed: false, reason: 'mime-not-allowed', detail: `MIME type ${attachment.mimeType} is not allowed` };
  }

  const extension = extensionOf(safeName);
  if (extension && policy.blockedExtensions?.includes(extension)) {
    return { allowed: false, reason: 'blocked-extension', detail: `Extension ${extension} is blocked` };
  }

  return { allowed: true, reason: 'allowed' };
}

// ─── Attachment Service ────────────────────────────────────────

export interface TelegramAttachmentServiceConfig {
  /** Attachment policy */
  readonly policy?: AttachmentPolicy;
}

/**
 * Channel-boundary attachment service. Stateless and deterministic; the
 * caller owns storage and transfer.
 */
export class TelegramAttachmentService {
  private readonly policy: AttachmentPolicy;

  constructor(config?: TelegramAttachmentServiceConfig) {
    this.policy = config?.policy ?? DEFAULT_ATTACHMENT_POLICY;
  }

  /** Validate an attachment received from Telegram. */
  validateIncoming(attachment: ChannelAttachment): AttachmentValidation {
    return validateAttachment(attachment, this.policy);
  }

  /** Validate an attachment before it is sent to Telegram. */
  validateOutbound(attachment: ChannelAttachment): AttachmentValidation {
    return validateAttachment(attachment, this.policy);
  }

  /**
   * Normalize an attachment for outbound delivery: sanitized filename, sized
   * caption, and preserved provenance ID.
   */
  prepareOutbound(attachment: ChannelAttachment): ChannelAttachment {
    const safeName = sanitizeFileName(attachment.fileName) ?? 'attachment';
    return {
      ...attachment,
      fileName: safeName,
      caption: attachment.caption?.slice(0, 1024),
    };
  }

  /**
   * Filter an inbound attachment list to the accepted subset, returning the
   * rejected attachments with their reasons for audit.
   */
  filterIncoming(attachments: readonly ChannelAttachment[]): {
    accepted: ChannelAttachment[];
    rejected: Array<{ attachment: ChannelAttachment; reason: AttachmentReason }>;
  } {
    const accepted: ChannelAttachment[] = [];
    const rejected: Array<{ attachment: ChannelAttachment; reason: AttachmentReason }> = [];

    for (const attachment of attachments) {
      const validation = this.validateIncoming(attachment);
      if (validation.allowed) accepted.push(attachment);
      else rejected.push({ attachment, reason: validation.reason });
    }

    return { accepted, rejected };
  }

  getPolicy(): AttachmentPolicy {
    return this.policy;
  }
}

/**
 * Build a unique, safe storage key for an attachment within a scope.
 * Pure — the caller decides the storage root.
 */
export function buildAttachmentStorageKey(scope: string, fileName: string): string {
  const safeName = sanitizeFileName(fileName) ?? 'attachment';
  const safeScope = sanitizeFileName(scope) ?? 'default';
  return `${safeScope}/${randomBytes(6).toString('hex')}-${safeName}`;
}
