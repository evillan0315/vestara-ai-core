/**
 * VES-TG-014: Telegram File Handling
 *
 * Handles file upload and download via Telegram Bot API.
 * Supports images, documents, voice messages, and other media.
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform (TG-014)
 *   @see docs/blueprint/VES-TG-001-telegram-integration.md
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

// ─── Types ─────────────────────────────────────────────────────

export type FileCategory = 'image' | 'document' | 'voice' | 'audio' | 'video' | 'sticker' | 'other';

export interface TelegramFile {
  /** Telegram file ID */
  readonly fileId: string;

  /** File category */
  readonly category: FileCategory;

  /** File name (if available) */
  readonly fileName?: string;

  /** MIME type (if available) */
  readonly mimeType?: string;

  /** File size in bytes (if available) */
  readonly fileSize?: number;

  /** File caption (if available) */
  readonly caption?: string;

  /** Telegram chat ID where file was received */
  readonly chatId: string;

  /** Telegram user ID who sent the file */
  readonly userId: string;

  /** ISO-8601 timestamp when file was received */
  readonly receivedAt: string;

  /** URL to download the file (if available) */
  readonly downloadUrl?: string;

  /** Local path where file is cached (if available) */
  readonly localPath?: string;
}

export interface FileDownloadResult {
  /** Whether download was successful */
  readonly success: boolean;

  /** File data as Buffer (if successful) */
  readonly data?: Buffer;

  /** File path on disk (if saved) */
  readonly filePath?: string;

  /** Error message (if failed) */
  readonly error?: string;

  /** File metadata */
  readonly metadata?: TelegramFile;
}

export interface FileUploadParams {
  /** Chat ID to send to */
  readonly chatId: string;

  /** File data */
  readonly data: Buffer;

  /** File name */
  readonly fileName: string;

  /** MIME type */
  readonly mimeType: string;

  /** Optional caption */
  readonly caption?: string;

  /** Optional reply to message ID */
  readonly replyToMessageId?: string;
}

export interface FileUploadResult {
  /** Whether upload was successful */
  readonly success: boolean;

  /** Telegram message ID of sent file */
  readonly messageId?: string;

  /** Telegram file ID of sent file */
  readonly fileId?: string;

  /** Error message (if failed) */
  readonly error?: string;
}

export interface TelegramFileHandlerConfig {
  /** Telegram bot token */
  readonly botToken: string;

  /** Maximum file size in bytes */
  readonly maxFileSize?: number;

  /** Allowed MIME types (if restricted) */
  readonly allowedMimeTypes?: string[];

  /** Local cache directory */
  readonly cacheDir?: string;

  /** Cache TTL in milliseconds */
  readonly cacheTtlMs?: number;
}

// ─── Default Config ────────────────────────────────────────────

const DEFAULT_CONFIG: Required<TelegramFileHandlerConfig> = {
  botToken: '',
  maxFileSize: 20 * 1024 * 1024, // 20MB
  allowedMimeTypes: [],
  cacheDir: '/tmp/telegram-files',
  cacheTtlMs: 24 * 60 * 60 * 1000, // 24 hours
};

// ─── File Handler ──────────────────────────────────────────────

export class TelegramFileHandler {
  private config: Required<TelegramFileHandlerConfig>;
  private fileCache: Map<string, TelegramFile> = new Map();

  constructor(config: TelegramFileHandlerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Process an incoming file from a Telegram message.
   */
  processIncomingFile(params: {
    fileId: string;
    category: FileCategory;
    fileName?: string;
    mimeType?: string;
    fileSize?: number;
    caption?: string;
    chatId: string;
    userId: string;
  }): TelegramFile {
    const file: TelegramFile = {
      fileId: params.fileId,
      category: params.category,
      fileName: params.fileName,
      mimeType: params.mimeType,
      fileSize: params.fileSize,
      caption: params.caption,
      chatId: params.chatId,
      userId: params.userId,
      receivedAt: new Date().toISOString(),
    };

    // Cache the file metadata
    this.fileCache.set(params.fileId, file);

    return file;
  }

  /**
   * Download a file from Telegram.
   * In production, this would call the Telegram Bot API getFilePath endpoint.
   */
  async downloadFile(fileId: string): Promise<FileDownloadResult> {
    // Check cache
    const cached = this.fileCache.get(fileId);
    if (cached?.localPath) {
      // In production, would read from disk
      return {
        success: true,
        metadata: cached,
      };
    }

    // In production, would call:
    // 1. GET https://api.telegram.org/bot{token}/getFile?file_id={fileId}
    // 2. Download from https://api.telegram.org/file/bot{token}/{file_path}

    return {
      success: false,
      error: 'File download not implemented in this environment',
    };
  }

  /**
   * Upload a file to Telegram.
   * In production, this would call the Telegram Bot API sendPhoto/sendDocument endpoint.
   */
  async uploadFile(params: FileUploadParams): Promise<FileUploadResult> {
    // Validate file size
    if (params.data.length > this.config.maxFileSize) {
      return {
        success: false,
        error: `File size exceeds maximum of ${this.config.maxFileSize} bytes`,
      };
    }

    // Validate MIME type
    if (
      this.config.allowedMimeTypes.length > 0 &&
      !this.config.allowedMimeTypes.includes(params.mimeType)
    ) {
      return {
        success: false,
        error: `MIME type ${params.mimeType} is not allowed`,
      };
    }

    // In production, would call:
    // POST https://api.telegram.org/bot{token}/sendDocument or /sendPhoto

    return {
      success: false,
      error: 'File upload not implemented in this environment',
    };
  }

  /**
   * Get file metadata from cache.
   */
  getFileMetadata(fileId: string): TelegramFile | undefined {
    return this.fileCache.get(fileId);
  }

  /**
   * Get all files for a chat.
   */
  getFilesByChat(chatId: string): readonly TelegramFile[] {
    return Array.from(this.fileCache.values()).filter((f) => f.chatId === chatId);
  }

  /**
   * Get all files from a user.
   */
  getFilesByUser(userId: string): readonly TelegramFile[] {
    return Array.from(this.fileCache.values()).filter((f) => f.userId === userId);
  }

  /**
   * Check if a file is within size limits.
   */
  isWithinSizeLimit(fileSize: number): boolean {
    return fileSize <= this.config.maxFileSize;
  }

  /**
   * Check if a MIME type is allowed.
   */
  isMimeTypeAllowed(mimeType: string): boolean {
    if (this.config.allowedMimeTypes.length === 0) return true;
    return this.config.allowedMimeTypes.includes(mimeType);
  }

  /**
   * Get the file category from a MIME type.
   */
  static getCategoryFromMimeType(mimeType: string): FileCategory {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType === 'application/pdf' || mimeType.includes('document')) return 'document';
    if (mimeType.includes('sticker')) return 'sticker';
    if (mimeType.includes('ogg') || mimeType.includes('opus')) return 'voice';
    return 'other';
  }

  /**
   * Clean up expired cache entries.
   */
  cleanupCache(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [fileId, file] of this.fileCache) {
      const age = now - new Date(file.receivedAt).getTime();
      if (age > this.config.cacheTtlMs) {
        this.fileCache.delete(fileId);
        cleaned++;
      }
    }

    return cleaned;
  }
}
