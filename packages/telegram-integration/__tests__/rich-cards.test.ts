/**
 * VES-TG-019 / TG-021: Rich execution cards + attachment policy — tests
 */

import type { ChannelAttachment } from '@vestara/channel-types';
import { describe, expect, it } from 'vitest';
import {
  buildAttachmentStorageKey,
  DEFAULT_ATTACHMENT_POLICY,
  sanitizeFileName,
  TelegramAttachmentService,
  validateAttachment,
} from '../src/attachments';
import {
  buildExecutionCardDelivery,
  buildExecutionCardKeyboard,
  executionUpdateToCardInput,
  formatDuration,
  isTerminalStatus,
  renderExecutionCard,
  renderProgressBar,
} from '../src/rich-cards';

describe('rich execution cards', () => {
  it('renders headline, message, progress and provenance', () => {
    const text = renderExecutionCard({
      executionId: 'exec-1',
      status: 'executing',
      message: 'Running affected tests',
      progressPercent: 42,
      timestamp: '2026-09-16T10:00:00.000Z',
    });
    expect(text).toContain('⚡ Executing');
    expect(text).toContain('exec-1');
    expect(text).toContain('Running affected tests');
    expect(text).toContain('[████░░░░░░] 42%');
  });

  it('renders progress bars at fixed width with clamped values', () => {
    expect(renderProgressBar(0, 4)).toBe('[░░░░] 0%');
    expect(renderProgressBar(100, 4)).toBe('[████] 100%');
    expect(renderProgressBar(150, 4)).toBe('[████] 100%');
    expect(renderProgressBar(-5, 4)).toBe('[░░░░] 0%');
  });

  it('renders an ordered step list', () => {
    const text = renderExecutionCard({
      executionId: 'exec-2',
      status: 'executing',
      steps: [
        { label: 'Plan', state: 'done' },
        { label: 'Implement', state: 'active' },
        { label: 'Verify', state: 'pending' },
      ],
      timestamp: '2026-09-16T10:00:00.000Z',
    });
    expect(text).toContain('✅ Plan');
    expect(text).toContain('▶️ Implement');
    expect(text).toContain('⬜ Verify');
  });

  it('does not offer cancel on terminal executions but keeps status', () => {
    const active = buildExecutionCardKeyboard({ executionId: 'e', status: 'executing', timestamp: 'x' });
    const done = buildExecutionCardKeyboard({ executionId: 'e', status: 'completed', timestamp: 'x' });
    expect(active[0].some((b) => b.callbackData === 'exec:cancel:e')).toBe(true);
    expect(done[0].some((b) => b.callbackData === 'exec:cancel:e')).toBe(false);
    expect(done[0].some((b) => b.callbackData === 'exec:status:e')).toBe(true);
  });

  it('formats durations', () => {
    expect(formatDuration('2026-09-16T10:00:00.000Z', '2026-09-16T10:00:45.000Z')).toBe('45s');
    expect(formatDuration('2026-09-16T10:00:00.000Z', '2026-09-16T10:03:20.000Z')).toBe('3m 20s');
    expect(formatDuration('2026-09-16T10:00:00.000Z', '2026-09-16T12:30:00.000Z')).toBe('2h 30m');
    expect(formatDuration(undefined, undefined)).toBeNull();
  });

  it('classifies terminal statuses', () => {
    expect(isTerminalStatus('completed')).toBe(true);
    expect(isTerminalStatus('failed')).toBe(true);
    expect(isTerminalStatus('cancelled')).toBe(true);
    expect(isTerminalStatus('executing')).toBe(false);
  });

  it('builds an editable delivery when editMessageId is supplied', () => {
    const delivery = buildExecutionCardDelivery(
      { executionId: 'exec-3', status: 'executing', timestamp: '2026-09-16T10:00:00.000Z' },
      'chat-1',
      { editMessageId: 'msg-9' },
    );
    expect(delivery.editMessageId).toBe('msg-9');
    expect(delivery.channel).toBe('telegram');
    expect(delivery.content.inlineKeyboard?.length).toBeGreaterThan(0);
    expect(delivery.metadata?.executionId).toBe('exec-3');
  });

  it('adapts an ExecutionUpdate into card input', () => {
    const input = executionUpdateToCardInput(
      {
        executionId: 'exec-4',
        status: 'executing',
        message: 'go',
        metadata: { progressPercent: 10 },
        timestamp: '2026-09-16T10:00:00.000Z',
      },
      { startedAt: '2026-09-16T09:59:00.000Z' },
    );
    expect(input.progressPercent).toBe(10);
    expect(input.startedAt).toBe('2026-09-16T09:59:00.000Z');
  });
});

function attachment(overrides: Partial<ChannelAttachment> = {}): ChannelAttachment {
  return {
    id: 'file-1',
    type: 'document',
    fileName: 'report.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    url: '',
    ...overrides,
  };
}

describe('attachment policy', () => {
  it('accepts a normal document', () => {
    expect(validateAttachment(attachment()).allowed).toBe(true);
  });

  it('rejects oversized files', () => {
    const result = validateAttachment(attachment({ size: 60 * 1024 * 1024 }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('too-large');
  });

  it('applies category-specific ceilings', () => {
    const result = validateAttachment(attachment({ type: 'image', mimeType: 'image/png', size: 11 * 1024 * 1024 }));
    expect(result.reason).toBe('too-large');
  });

  it('rejects empty files', () => {
    expect(validateAttachment(attachment({ size: 0 })).reason).toBe('empty');
  });

  it('rejects blocked extensions', () => {
    expect(validateAttachment(attachment({ fileName: 'payload.exe' })).reason).toBe('blocked-extension');
  });

  it('rejects disallowed MIME types when restricted', () => {
    const result = validateAttachment(attachment({ mimeType: 'application/x-msdownload' }), {
      ...DEFAULT_ATTACHMENT_POLICY,
      allowedMimeTypes: ['application/pdf'],
    });
    expect(result.reason).toBe('mime-not-allowed');
  });
});

describe('filename sanitization', () => {
  it('strips path traversal and separators', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('C:\\Windows\\system32\\evil.dll')).toBe('evil.dll');
  });

  it('removes control characters and leading dots', () => {
    expect(sanitizeFileName('..hidden\u0000name.txt')).toBe('hiddenname.txt');
  });

  it('returns null for unusable names', () => {
    expect(sanitizeFileName('')).toBeNull();
    expect(sanitizeFileName('...')).toBeNull();
  });

  it('builds a scoped storage key', () => {
    const key = buildAttachmentStorageKey('ws/1', '../secret.txt');
    expect(key.startsWith('1/')).toBe(true);
    expect(key.endsWith('-secret.txt')).toBe(true);
  });
});

describe('TelegramAttachmentService', () => {
  it('partitions incoming attachments into accepted and rejected', () => {
    const service = new TelegramAttachmentService();
    const result = service.filterIncoming([
      attachment(),
      attachment({ id: 'file-2', type: 'other', fileName: 'tool.sh', mimeType: 'text/x-shellscript' }),
    ]);
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toBe('blocked-extension');
  });

  it('sanitizes filenames on outbound preparation', () => {
    const service = new TelegramAttachmentService();
    const prepared = service.prepareOutbound(attachment({ fileName: '../evil.exe' }));
    expect(prepared.fileName).toBe('evil.exe');
  });
});
