/**
 * M11C Forward to Telegram Dialog
 *
 * Explicit per-message forward from the Activity Room to a linked Telegram
 * chat. Nothing leaves the room unless the operator picks a message and a
 * chat — there is no auto-mirroring. Fail-closed: unconfigured bot, no
 * linked chats, and delivery failures all surface as guidance, never
 * silent success.
 */

import { useCallback, useEffect, useState } from 'react';
import { Pill } from '@vestara/ui';
import { telegramApi, type TelegramChat } from '../../lib/telegram';

interface M11CForwardDialogProps {
  /** Stream item id — sent alongside text for server-truth resolution. */
  readonly activityId: string;
  /** Resolved actor name for the `[actor] content` forward format. */
  readonly actorName: string;
  /** Visible message content to forward. */
  readonly content: string;
  readonly onClose: () => void;
}

type Phase = 'loading' | 'pick' | 'sending' | 'done';

export default function M11CForwardDialog({ activityId, actorName, content, onClose }: M11CForwardDialogProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [chats, setChats] = useState<readonly TelegramChat[]>([]);
  const [configured, setConfigured] = useState(true);
  const [selectedChatId, setSelectedChatId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [sentChunks, setSentChunks] = useState<{ sent: number; total: number } | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    telegramApi
      .chats()
      .then((result) => {
        if (cancelled) return;
        setChats(result.chats);
        setConfigured(result.configured);
        if (result.chats.length === 1 && result.chats[0]) setSelectedChatId(result.chats[0].chatId);
        setPhase('pick');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load Telegram chats');
        setPhase('pick');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSend = useCallback(async () => {
    if (!selectedChatId) return;
    setPhase('sending');
    setError(null);
    try {
      const result = await telegramApi.forward({
        chatId: selectedChatId,
        text: `[${actorName}] ${content}`.trim(),
        activityId,
      });
      setSentChunks(result.chunks);
      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Forward failed');
      setPhase('pick');
    }
  }, [selectedChatId, actorName, content, activityId]);

  const preview = content.length > 280 ? `${content.slice(0, 280)}…` : content;

  return (
    <div className="ar-backdrop" role="dialog" aria-modal="true" aria-label="Forward to Telegram" onClick={onClose}>
      <div className="ar-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ar-modal__head">
          <h2 className="ar-modal__title">Forward to Telegram</h2>
          <button type="button" onClick={onClose} className="ar-modal__close" aria-label="Close">
            ×
          </button>
        </div>
        <div className="p-4">
          <div className="mb-3 rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel-raised)] px-3 py-2">
            <div className="mb-1 text-[11px] font-medium text-[var(--vestara-text-secondary)]">{actorName}</div>
            <div className="line-clamp-3 text-[12px] leading-relaxed text-[var(--vestara-text-muted)]">{preview}</div>
          </div>

          {phase === 'loading' && (
            <div className="flex flex-col gap-2" aria-label="Loading Telegram chats">
              {[0, 1].map((i) => (
                <div key={i} className="ar-skeleton" />
              ))}
            </div>
          )}

          {phase !== 'loading' && !configured && (
            <p className="mb-3 rounded-[var(--vestara-radius)] border border-[var(--vestara-status-warning-border)] bg-[var(--vestara-status-warning-bg)] px-2 py-1 text-xs text-[var(--vestara-status-warning)]" role="alert">
              Telegram bot is not configured. Set TELEGRAM_BOT_TOKEN on the API server first.
            </p>
          )}

          {phase !== 'loading' && configured && chats.length === 0 && !error && (
            <p className="mb-3 text-xs leading-relaxed text-[var(--vestara-text-muted)]">
              No linked Telegram chats yet. Send a message to your bot from Telegram first — the chat appears here
              once it is linked.
            </p>
          )}

          {chats.length > 0 && phase !== 'done' && (
            <div className="mb-3 flex flex-col gap-1" role="radiogroup" aria-label="Telegram chats">
              {chats.map((chat) => (
                <button
                  key={chat.chatId}
                  type="button"
                  role="radio"
                  aria-checked={selectedChatId === chat.chatId}
                  onClick={() => setSelectedChatId(chat.chatId)}
                  className={`flex w-full items-center gap-2 rounded-[var(--vestara-radius)] border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset ${
                    selectedChatId === chat.chatId
                      ? 'border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)]'
                      : 'border-[var(--vestara-border-subtle)] hover:bg-[var(--vestara-accent-bg)]'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`grid size-4 shrink-0 place-items-center rounded-[var(--vestara-radius-full)] border text-[10px] ${
                      selectedChatId === chat.chatId
                        ? 'border-[var(--vestara-accent)] text-[var(--vestara-accent-text)]'
                        : 'border-[var(--vestara-border-subtle)] text-transparent'
                    }`}
                  >
                    ✓
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-[var(--vestara-text)]">
                      {chat.title ?? chat.chatId}
                    </span>
                    <span className="block text-[10px] capitalize text-[var(--vestara-text-muted)]">
                      {chat.type} chat
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {phase === 'done' && sentChunks && (
            <p className="mb-3 rounded-[var(--vestara-radius)] border border-[var(--vestara-status-success-border)] bg-[var(--vestara-status-success-bg)] px-2 py-1 text-xs text-[var(--vestara-status-success)]" role="status">
              Sent to Telegram ({sentChunks.sent}/{sentChunks.total} {sentChunks.total === 1 ? 'part' : 'parts'}).
            </p>
          )}

          {error && (
            <p className="mb-3 rounded-[var(--vestara-radius)] border border-[var(--vestara-status-error-border)] bg-[var(--vestara-status-error-bg)] px-2 py-1 text-xs text-[var(--vestara-status-error)]" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Pill variant="default" size="sm" onClick={onClose}>
              {phase === 'done' ? 'Close' : 'Cancel'}
            </Pill>
            {phase !== 'done' && (
              <Pill variant="gold" size="sm" onClick={() => void handleSend()} disabled={!selectedChatId || phase === 'sending' || !configured} loading={phase === 'sending'}>
                Send
              </Pill>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
