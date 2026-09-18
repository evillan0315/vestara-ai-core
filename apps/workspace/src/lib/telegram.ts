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

// ─── Settings (TG-023) ─────────────────────────────────────────

export type NotificationSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface NotificationPreferences {
  enabled: Record<string, boolean>;
  minSeverity: NotificationSeverity;
  filters: {
    workspaceIds?: string[];
    projectIds?: string[];
    agentIds?: string[];
  };
  quietHours: {
    enabled: boolean;
    startHour: number;
    endHour: number;
  };
}

export interface NotificationEventDescriptor {
  type: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
}

export interface TelegramSettings {
  notifications: NotificationPreferences;
  eventCatalog: NotificationEventDescriptor[];
  integration: {
    enabled: boolean;
    configured: boolean;
    persistentStore: boolean;
    runtimeProfile: string;
  };
  tunnel: TelegramTunnel;
}

// ─── Tunnel (TG-030) ───────────────────────────────────────────

export type TunnelProviderKind = 'manual' | 'cloudflared' | 'ngrok';

export type TunnelStatus = 'disabled' | 'starting' | 'active' | 'error';

export interface TunnelConfig {
  provider: TunnelProviderKind;
  publicUrl?: string;
  localPort: number;
}

export interface TunnelState {
  status: TunnelStatus;
  provider: TunnelProviderKind;
  publicUrl?: string;
  webhookUrl?: string;
  webhookRegistered: boolean;
  lastError?: string;
  changedAt: string;
}

export interface TelegramTunnel {
  config: TunnelConfig;
  state: TunnelState;
  availability: Record<TunnelProviderKind, boolean>;
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

  /** Get the Telegram integration settings read model (notifications + catalog) */
  async settings(): Promise<TelegramSettings> {
    return fetchJson<TelegramSettings>('/api/telegram/settings');
  },

  /** Persist notification preferences; returns the normalized result */
  async updateSettings(notifications: NotificationPreferences): Promise<{ notifications: NotificationPreferences }> {
    return fetchJson<{ notifications: NotificationPreferences }>('/api/telegram/settings', {
      method: 'PUT',
      body: JSON.stringify({ notifications }),
    });
  },

  /** Read the webhook tunnel configuration and runtime state */
  async tunnel(): Promise<TelegramTunnel> {
    return fetchJson<TelegramTunnel>('/api/telegram/tunnel');
  },

  /** Configure and/or enable/disable the webhook tunnel */
  async updateTunnel(patch: {
    enabled?: boolean;
    provider?: TunnelProviderKind;
    publicUrl?: string;
    localPort?: number;
  }): Promise<TelegramTunnel> {
    return fetchJson<TelegramTunnel>('/api/telegram/tunnel', {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  },
};
