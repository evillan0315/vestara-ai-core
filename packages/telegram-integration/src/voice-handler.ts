/**
 * VES-TG-015: Telegram Voice Messages
 *
 * Handles voice message transcription and processing.
 * Converts Telegram voice messages to text for processing by the Global Assistant.
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform (TG-015)
 *   @see docs/blueprint/VES-TG-001-telegram-integration.md
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

// ─── Types ─────────────────────────────────────────────────────

export type TranscriptionStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface VoiceMessage {
  /** Telegram voice file ID */
  readonly fileId: string;

  /** Duration in seconds */
  readonly duration: number;

  /** MIME type (usually audio/ogg) */
  readonly mimeType: string;

  /** Chat ID where voice was sent */
  readonly chatId: string;

  /** User ID who sent the voice */
  readonly userId: string;

  /** ISO-8601 timestamp */
  readonly timestamp: string;
}

export interface TranscriptionResult {
  /** Transcription ID */
  readonly id: string;

  /** Original voice message */
  readonly voiceMessage: VoiceMessage;

  /** Transcription status */
  readonly status: TranscriptionStatus;

  /** Transcribed text (if completed) */
  readonly text?: string;

  /** Detected language (if completed) */
  readonly language?: string;

  /** Confidence score (0-1, if available) */
  readonly confidence?: number;

  /** Error message (if failed) */
  readonly error?: string;

  /** ISO-8601 timestamp when transcription started */
  readonly startedAt: string;

  /** ISO-8601 timestamp when transcription completed */
  readonly completedAt?: string;
}

export interface VoiceHandlerConfig {
  /** Telegram bot token */
  readonly botToken: string;

  /** Transcription provider ('whisper' | 'google' | 'azure' | 'custom') */
  readonly provider?: string;

  /** API key for transcription service */
  readonly apiKey?: string;

  /** Maximum voice duration in seconds */
  readonly maxDuration?: number;

  /** Supported MIME types */
  readonly supportedMimeTypes?: string[];

  /** Whether to auto-transcribe voice messages */
  readonly autoTranscribe?: boolean;
}

// ─── Default Config ────────────────────────────────────────────

const DEFAULT_CONFIG: Required<VoiceHandlerConfig> = {
  botToken: '',
  provider: 'whisper',
  apiKey: '',
  maxDuration: 300, // 5 minutes
  supportedMimeTypes: ['audio/ogg', 'audio/ogg; codecs=opus', 'audio/mpeg', 'audio/wav'],
  autoTranscribe: true,
};

// ─── Voice Handler ─────────────────────────────────────────────

export class TelegramVoiceHandler {
  private config: Required<VoiceHandlerConfig>;
  private transcriptionCache: Map<string, TranscriptionResult> = new Map();

  constructor(config: VoiceHandlerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Process an incoming voice message.
   */
  processVoiceMessage(params: {
    fileId: string;
    duration: number;
    mimeType: string;
    chatId: string;
    userId: string;
  }): VoiceMessage {
    // Validate duration
    if (params.duration > this.config.maxDuration) {
      throw new Error(`Voice duration exceeds maximum of ${this.config.maxDuration} seconds`);
    }

    // Validate MIME type
    if (!this.config.supportedMimeTypes.includes(params.mimeType)) {
      throw new Error(`Unsupported MIME type: ${params.mimeType}`);
    }

    const voiceMessage: VoiceMessage = {
      fileId: params.fileId,
      duration: params.duration,
      mimeType: params.mimeType,
      chatId: params.chatId,
      userId: params.userId,
      timestamp: new Date().toISOString(),
    };

    return voiceMessage;
  }

  /**
   * Transcribe a voice message.
   * In production, this would call the configured transcription provider.
   */
  async transcribe(voiceMessage: VoiceMessage): Promise<TranscriptionResult> {
    const transcriptionId = `trans-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = new Date().toISOString();

    // Check if already transcribed
    const existing = this.getTranscriptionByFileId(voiceMessage.fileId);
    if (existing?.status === 'completed') {
      return existing;
    }

    // In production, would call transcription API:
    // 1. Download voice file from Telegram
    // 2. Send to transcription provider (Whisper, Google, Azure)
    // 3. Return transcribed text

    const result: TranscriptionResult = {
      id: transcriptionId,
      voiceMessage,
      status: 'pending',
      startedAt,
    };

    this.transcriptionCache.set(transcriptionId, result);

    return result;
  }

  /**
   * Complete a transcription with the result text.
   */
  completeTranscription(transcriptionId: string, text: string, language?: string, confidence?: number): void {
    const result = this.transcriptionCache.get(transcriptionId);
    if (!result) return;

    const updated: TranscriptionResult = {
      ...result,
      status: 'completed',
      text,
      language,
      confidence,
      completedAt: new Date().toISOString(),
    };

    this.transcriptionCache.set(transcriptionId, updated);
  }

  /**
   * Mark a transcription as failed.
   */
  failTranscription(transcriptionId: string, error: string): void {
    const result = this.transcriptionCache.get(transcriptionId);
    if (!result) return;

    const updated: TranscriptionResult = {
      ...result,
      status: 'failed',
      error,
      completedAt: new Date().toISOString(),
    };

    this.transcriptionCache.set(transcriptionId, updated);
  }

  /**
   * Get transcription by ID.
   */
  getTranscription(transcriptionId: string): TranscriptionResult | undefined {
    return this.transcriptionCache.get(transcriptionId);
  }

  /**
   * Get transcription by voice file ID.
   */
  getTranscriptionByFileId(fileId: string): TranscriptionResult | undefined {
    for (const result of this.transcriptionCache.values()) {
      if (result.voiceMessage.fileId === fileId) {
        return result;
      }
    }
    return undefined;
  }

  /**
   * Get all transcriptions for a chat.
   */
  getTranscriptionsByChat(chatId: string): readonly TranscriptionResult[] {
    return Array.from(this.transcriptionCache.values()).filter((r) => r.voiceMessage.chatId === chatId);
  }

  /**
   * Check if voice duration is within limits.
   */
  isWithinDurationLimit(duration: number): boolean {
    return duration <= this.config.maxDuration;
  }

  /**
   * Check if MIME type is supported.
   */
  isMimeTypeSupported(mimeType: string): boolean {
    return this.config.supportedMimeTypes.includes(mimeType);
  }

  /**
   * Get transcription stats.
   */
  getStats(): {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  } {
    const results = Array.from(this.transcriptionCache.values());
    return {
      total: results.length,
      pending: results.filter((r) => r.status === 'pending').length,
      processing: results.filter((r) => r.status === 'processing').length,
      completed: results.filter((r) => r.status === 'completed').length,
      failed: results.filter((r) => r.status === 'failed').length,
    };
  }
}
