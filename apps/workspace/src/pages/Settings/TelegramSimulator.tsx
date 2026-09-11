/**
 * Telegram Simulator
 *
 * Test the Telegram integration without a real bot. Simulates messages
 * through the full execution pipeline (pairing → workspace binding →
 * conversation binding → LLM → response).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { telegramApi, type SimulateResult, type TelegramStatus } from '../../lib/telegram.js';
import { Button, SettingsSection, surface } from './settings-ui.js';

// ─── Types ─────────────────────────────────────────────────────

interface MessageEntry {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  status?: string;
  executionId?: string;
}

// ─── Component ─────────────────────────────────────────────────

export function TelegramSimulator() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [input, setInput] = useState('');
  const [userId, setUserId] = useState('sim-user-1');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<MessageEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load status on mount
  useEffect(() => {
    telegramApi.status().then(setStatus).catch(() => {});
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: MessageEntry = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const result = await telegramApi.simulate({
        text,
        userId,
        displayName: `Simulated User (${userId})`,
      });

      const assistantMsg: MessageEntry = {
        id: `assistant-${Date.now()}`,
        role: result.error ? 'system' : 'assistant',
        content: result.response ?? result.error ?? `Status: ${result.status}`,
        timestamp: new Date().toISOString(),
        status: result.status,
        executionId: result.executionId,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      const errorMsg: MessageEntry = {
        id: `error-${Date.now()}`,
        role: 'system',
        content: err instanceof Error ? err.message : 'Request failed',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }, [input, userId, loading]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return (
    <SettingsSection
      title="Telegram Simulator"
      description="Test the Telegram integration without a real bot. Messages are routed through the full execution pipeline."
    >
      {/* Status Bar */}
      <div className={`mb-4 flex items-center gap-4 rounded-[var(--vestara-radius)] p-3 ${surface}`}>
        <span className="text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-secondary,var(--vestara-text-2))]">
          Status:
        </span>
        {status ? (
          <>
            <span className={`text-[var(--vestara-font-size-xs)] ${status.configured ? 'text-[var(--vestara-green)]' : 'text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]'}`}>
              Bot: {status.configured ? 'Configured' : 'Not configured'}
            </span>
            <span className={`text-[var(--vestara-font-size-xs)] ${status.persistentStore ? 'text-[var(--vestara-green)]' : 'text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]'}`}>
              Store: {status.persistentStore ? 'Connected' : 'In-memory'}
            </span>
          </>
        ) : (
          <span className="text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
            Loading...
          </span>
        )}
      </div>

      {/* User ID Field */}
      <div className="mb-4">
        <label className="mb-1 block text-[var(--vestara-font-size-xs)] font-medium text-[var(--vestara-color-text-secondary,var(--vestara-text-2))]">
          Simulated Telegram User ID
        </label>
        <input
          type="text"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="w-full max-w-xs rounded-[var(--vestara-radius)] border border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] px-3 py-2 text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-primary,var(--vestara-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-color-focus-ring,var(--vestara-accent))]"
          placeholder="e.g. sim-user-1"
        />
        <p className="mt-1 text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
          Different user IDs get separate pairing and conversation bindings.
        </p>
      </div>

      {/* Message History */}
      <div
        className={`mb-4 max-h-96 overflow-y-auto rounded-[var(--vestara-radius)] border p-3 ${surface}`}
      >
        {messages.length === 0 ? (
          <p className="py-8 text-center text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
            Send a message to test the Telegram pipeline.
          </p>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-[var(--vestara-radius)] p-3 ${
                  msg.role === 'user'
                    ? 'ml-8 bg-[var(--vestara-accent)]/10 border border-[var(--vestara-accent)]/20'
                    : msg.role === 'assistant'
                      ? 'mr-8 bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))]'
                      : 'bg-[var(--vestara-red)]/5 border border-[var(--vestara-red)]/20'
                }`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[var(--vestara-font-size-xs)] font-medium text-[var(--vestara-color-text-secondary,var(--vestara-text-2))]">
                    {msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'Assistant' : 'System'}
                  </span>
                  <span className="text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-primary,var(--vestara-text))]">
                  {msg.content}
                </p>
                {msg.executionId && (
                  <p className="mt-1 text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                    Execution: {msg.executionId}
                  </p>
                )}
              </div>
            ))}
            {loading && (
              <div className="mr-8 rounded-[var(--vestara-radius)] border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] p-3">
                <span className="text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                  Thinking...
                </span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 rounded-[var(--vestara-radius)] border border-[var(--vestara-red)]/30 bg-[var(--vestara-red)]/5 p-3 text-[var(--vestara-font-size-sm)] text-[var(--vestara-red)]">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message to simulate..."
          disabled={loading}
          className="flex-1 rounded-[var(--vestara-radius)] border border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] px-3 py-2 text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-primary,var(--vestara-text))] placeholder:text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-color-focus-ring,var(--vestara-accent))]"
        />
        <Button onClick={handleSend} disabled={loading || !input.trim()}>
          {loading ? 'Sending...' : 'Send'}
        </Button>
        {messages.length > 0 && (
          <Button onClick={clearMessages} variant="secondary">
            Clear
          </Button>
        )}
      </div>

      {/* Help */}
      <p className="mt-3 text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
        Messages are auto-paired to a simulated Telegram user and routed through the full
        execution pipeline. The response comes from the same LLM backend used by the
        floating assistant.
      </p>
    </SettingsSection>
  );
}
