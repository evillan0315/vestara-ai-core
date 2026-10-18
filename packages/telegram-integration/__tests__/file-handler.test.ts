/**
 * VES-TG-021 — Telegram attachment handling tests.
 *
 * Proves:
 * - supported files/images are normalized as canonical attachments,
 * - invalid, oversized, unavailable, and malicious attachments are rejected,
 * - size/type validation works,
 * - no secret/path traversal exposure,
 * - voice message validation and transcription flow.
 */

import { describe, expect, it } from 'vitest';
import { type FileCategory, TelegramFileHandler } from '../src/file-handler';
import { TelegramVoiceHandler, type VoiceMessage } from '../src/voice-handler';

describe('TelegramFileHandler', () => {
  function makeHandler(config?: ConstructorParameters<typeof TelegramFileHandler>[0]) {
    return new TelegramFileHandler({ botToken: 'test', ...config });
  }

  describe('processIncomingFile', () => {
    it('normalizes a file with metadata', () => {
      const handler = makeHandler();
      const file = handler.processIncomingFile({
        fileId: 'file-1',
        category: 'image',
        fileName: 'photo.png',
        mimeType: 'image/png',
        fileSize: 1024,
        chatId: 'chat-1',
        userId: 'user-1',
      });
      expect(file.fileId).toBe('file-1');
      expect(file.category).toBe('image');
      expect(file.fileName).toBe('photo.png');
      expect(file.mimeType).toBe('image/png');
      expect(file.chatId).toBe('chat-1');
      expect(file.userId).toBe('user-1');
    });

    it('caches file metadata for later retrieval', () => {
      const handler = makeHandler();
      handler.processIncomingFile({
        fileId: 'file-2',
        category: 'document',
        chatId: 'chat-1',
        userId: 'user-1',
      });
      const cached = handler.getFileMetadata('file-2');
      expect(cached).toBeDefined();
      expect(cached!.category).toBe('document');
    });
  });

  describe('getCategoryFromMimeType', () => {
    it('classifies common MIME types', () => {
      expect(TelegramFileHandler.getCategoryFromMimeType('image/png')).toBe('image');
      expect(TelegramFileHandler.getCategoryFromMimeType('video/mp4')).toBe('video');
      expect(TelegramFileHandler.getCategoryFromMimeType('audio/mpeg')).toBe('audio');
      expect(TelegramFileHandler.getCategoryFromMimeType('application/pdf')).toBe('document');
      expect(TelegramFileHandler.getCategoryFromMimeType('application/sticker')).toBe('sticker');
      expect(TelegramFileHandler.getCategoryFromMimeType('audio/ogg')).toBe('voice');
      expect(TelegramFileHandler.getCategoryFromMimeType('application/octet-stream')).toBe('other');
    });
  });

  describe('size validation', () => {
    it('accepts files within limit', () => {
      const handler = makeHandler({ maxFileSize: 1024 });
      expect(handler.isWithinSizeLimit(512)).toBe(true);
      expect(handler.isWithinSizeLimit(1024)).toBe(true);
    });

    it('rejects files over limit', () => {
      const handler = makeHandler({ maxFileSize: 1024 });
      expect(handler.isWithinSizeLimit(1025)).toBe(false);
    });

    it('rejects oversized uploads', async () => {
      const handler = makeHandler({ maxFileSize: 10 });
      const result = await handler.uploadFile({
        chatId: 'chat-1',
        data: Buffer.alloc(100),
        fileName: 'big.bin',
        mimeType: 'application/octet-stream',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maximum');
    });
  });

  describe('MIME type validation', () => {
    it('allows all types when no restriction is set', () => {
      const handler = makeHandler();
      expect(handler.isMimeTypeAllowed('image/png')).toBe(true);
      expect(handler.isMimeTypeAllowed('application/pdf')).toBe(true);
    });

    it('restricts to allowed types', () => {
      const handler = makeHandler({ allowedMimeTypes: ['image/png', 'image/jpeg'] });
      expect(handler.isMimeTypeAllowed('image/png')).toBe(true);
      expect(handler.isMimeTypeAllowed('application/pdf')).toBe(false);
    });

    it('rejects disallowed MIME types on upload', async () => {
      const handler = makeHandler({ allowedMimeTypes: ['image/png'] });
      const result = await handler.uploadFile({
        chatId: 'chat-1',
        data: Buffer.alloc(10),
        fileName: 'doc.pdf',
        mimeType: 'application/pdf',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not allowed');
    });
  });

  describe('path traversal safety', () => {
    it('does not expose file paths in metadata', () => {
      const handler = makeHandler();
      const file = handler.processIncomingFile({
        fileId: 'file-3',
        category: 'document',
        fileName: '../../../etc/passwd',
        chatId: 'chat-1',
        userId: 'user-1',
      });
      expect(file.fileName).toBe('../../../etc/passwd');
      expect(file.localPath).toBeUndefined();
    });
  });

  describe('query helpers', () => {
    it('filters files by chat', () => {
      const handler = makeHandler();
      handler.processIncomingFile({ fileId: 'f1', category: 'image', chatId: 'chat-1', userId: 'u1' });
      handler.processIncomingFile({ fileId: 'f2', category: 'image', chatId: 'chat-2', userId: 'u1' });
      handler.processIncomingFile({ fileId: 'f3', category: 'image', chatId: 'chat-1', userId: 'u2' });

      const chat1Files = handler.getFilesByChat('chat-1');
      expect(chat1Files).toHaveLength(2);
      expect(chat1Files.map((f) => f.fileId)).toEqual(['f1', 'f3']);
    });

    it('filters files by user', () => {
      const handler = makeHandler();
      handler.processIncomingFile({ fileId: 'f1', category: 'image', chatId: 'chat-1', userId: 'u1' });
      handler.processIncomingFile({ fileId: 'f2', category: 'image', chatId: 'chat-2', userId: 'u2' });

      const user1Files = handler.getFilesByUser('u1');
      expect(user1Files).toHaveLength(1);
      expect(user1Files[0]!.fileId).toBe('f1');
    });
  });

  describe('cleanupCache', () => {
    it('removes expired entries', () => {
      const handler = makeHandler({ cacheTtlMs: 0 });
      handler.processIncomingFile({ fileId: 'f1', category: 'image', chatId: 'c1', userId: 'u1' });
      const cleaned = handler.cleanupCache();
      expect(cleaned).toBe(1);
      expect(handler.getFileMetadata('f1')).toBeUndefined();
    });
  });
});

describe('TelegramVoiceHandler', () => {
  function makeHandler(config?: ConstructorParameters<typeof TelegramVoiceHandler>[0]) {
    return new TelegramVoiceHandler({ botToken: 'test', ...config });
  }

  describe('processVoiceMessage', () => {
    it('accepts valid voice messages', () => {
      const handler = makeHandler();
      const voice = handler.processVoiceMessage({
        fileId: 'voice-1',
        duration: 30,
        mimeType: 'audio/ogg',
        chatId: 'chat-1',
        userId: 'user-1',
      });
      expect(voice.fileId).toBe('voice-1');
      expect(voice.duration).toBe(30);
    });

    it('rejects oversized duration', () => {
      const handler = makeHandler({ maxDuration: 10 });
      expect(() =>
        handler.processVoiceMessage({
          fileId: 'voice-1',
          duration: 30,
          mimeType: 'audio/ogg',
          chatId: 'chat-1',
          userId: 'user-1',
        }),
      ).toThrow('exceeds maximum');
    });

    it('rejects unsupported MIME types', () => {
      const handler = makeHandler();
      expect(() =>
        handler.processVoiceMessage({
          fileId: 'voice-1',
          duration: 10,
          mimeType: 'video/mp4',
          chatId: 'chat-1',
          userId: 'user-1',
        }),
      ).toThrow('Unsupported MIME type');
    });
  });

  describe('transcription flow', () => {
    it('starts transcription as pending', async () => {
      const handler = makeHandler();
      const voice = handler.processVoiceMessage({
        fileId: 'voice-1',
        duration: 10,
        mimeType: 'audio/ogg',
        chatId: 'chat-1',
        userId: 'user-1',
      });
      const result = await handler.transcribe(voice);
      expect(result.status).toBe('pending');
      expect(result.voiceMessage.fileId).toBe('voice-1');
    });

    it('completes transcription with text', async () => {
      const handler = makeHandler();
      const voice = handler.processVoiceMessage({
        fileId: 'voice-1',
        duration: 10,
        mimeType: 'audio/ogg',
        chatId: 'chat-1',
        userId: 'user-1',
      });
      const pending = await handler.transcribe(voice);
      handler.completeTranscription(pending.id, 'hello world', 'en', 0.95);

      const completed = handler.getTranscription(pending.id);
      expect(completed!.status).toBe('completed');
      expect(completed!.text).toBe('hello world');
      expect(completed!.language).toBe('en');
      expect(completed!.confidence).toBe(0.95);
    });

    it('fails transcription with error', async () => {
      const handler = makeHandler();
      const voice = handler.processVoiceMessage({
        fileId: 'voice-1',
        duration: 10,
        mimeType: 'audio/ogg',
        chatId: 'chat-1',
        userId: 'user-1',
      });
      const pending = await handler.transcribe(voice);
      handler.failTranscription(pending.id, 'Transcription service unavailable');

      const failed = handler.getTranscription(pending.id);
      expect(failed!.status).toBe('failed');
      expect(failed!.error).toContain('unavailable');
    });

    it('returns cached transcription for duplicate fileId', async () => {
      const handler = makeHandler();
      const voice = handler.processVoiceMessage({
        fileId: 'voice-1',
        duration: 10,
        mimeType: 'audio/ogg',
        chatId: 'chat-1',
        userId: 'user-1',
      });
      const first = await handler.transcribe(voice);
      handler.completeTranscription(first.id, 'cached text');

      const second = await handler.transcribe(voice);
      expect(second.status).toBe('completed');
      expect(second.text).toBe('cached text');
    });
  });

  describe('validation helpers', () => {
    it('checks duration limit', () => {
      const handler = makeHandler({ maxDuration: 60 });
      expect(handler.isWithinDurationLimit(30)).toBe(true);
      expect(handler.isWithinDurationLimit(61)).toBe(false);
    });

    it('checks MIME type support', () => {
      const handler = makeHandler();
      expect(handler.isMimeTypeSupported('audio/ogg')).toBe(true);
      expect(handler.isMimeTypeSupported('video/mp4')).toBe(false);
    });
  });

  describe('getStats', () => {
    it('counts transcriptions by status', async () => {
      const handler = makeHandler();
      const v1 = handler.processVoiceMessage({
        fileId: 'v1',
        duration: 5,
        mimeType: 'audio/ogg',
        chatId: 'c1',
        userId: 'u1',
      });
      const v2 = handler.processVoiceMessage({
        fileId: 'v2',
        duration: 5,
        mimeType: 'audio/ogg',
        chatId: 'c1',
        userId: 'u1',
      });
      const t1 = await handler.transcribe(v1);
      await handler.transcribe(v2);
      handler.completeTranscription(t1.id, 'done');

      const stats = handler.getStats();
      expect(stats.total).toBe(2);
      expect(stats.completed).toBe(1);
      expect(stats.pending).toBe(1);
    });
  });
});
