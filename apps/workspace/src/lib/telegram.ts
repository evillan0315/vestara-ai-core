/**
 * Telegram Integration API Client
 *
 * Typed fetch helpers for the Telegram webhook/simulate/pairing endpoints.
 */

import { resolveHttpUrl } from './clientConfig.js';

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = resolveHttpUrl(path);
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Types ─────────────────────────────────────────────────────

export interface TelegramStatus {
  configured: boolean;
  persistentStore: boolean;
  services: {
    pairing: boolean;
    workspaceBindings: boolean;
    conversationBindings: boolean;
    textRouter: boolean;
  };
}

export interface SimulateResult {
  status: string;
  messageId?: string;
  simulation?: boolean;
  response?: string;
  executionId?: string;
  conversationId?: string;
  error?: string;
}

export interface PairingRequest {
  pairingId: string;
  token: string;
  expiresAt: string;
}

export interface PairingApproval {
  bindingId: string;
  telegramUserId: string;
  principalId: string;
}

// ─── API ───────────────────────────────────────────────────────

export const telegramApi = {
  /** Get integration status */
  async status(): Promise<TelegramStatus> {
    return fetchJson<TelegramStatus>('/api/telegram/status');
  },

  /** Simulate a Telegram message (auto-pairs + routes through pipeline) */
  async simulate(params: {
    text: string;
    userId?: string;
    chatId?: string;
    displayName?: string;
  }): Promise<SimulateResult> {
    return fetchJson<SimulateResult>('/api/telegram/simulate', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  /** Create a pairing request */
  async createPairing(telegramUserId: string, telegramDisplayName: string): Promise<PairingRequest> {
    return fetchJson<PairingRequest>('/api/telegram/pairing', {
      method: 'POST',
      body: JSON.stringify({ telegramUserId, telegramDisplayName }),
    });
  },

  /** Approve a pairing request */
  async approvePairing(token: string, principalId: string, principalName: string): Promise<PairingApproval> {
    return fetchJson<PairingApproval>('/api/telegram/pairing/approve', {
      method: 'POST',
      body: JSON.stringify({ token, principalId, principalName }),
    });
  },
};
