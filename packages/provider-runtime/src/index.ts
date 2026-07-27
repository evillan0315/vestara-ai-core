/**
 * @vestara/provider-runtime — Provider Manager
 *
 * Manages AI provider lifecycle: register, load, unload, health, getProvider.
 * The Kernel imports this package — it never imports individual providers.
 * Providers implement AIProvider; Provider Runtime discovers and manages them.
 *
 * Architecture Traceability:
 *   Foundation: PROVIDER-SDK.md → AIProvider
 *   Specification: AI-CON-004 → Provider Manager
 *   Runtime: LIFECYCLE-SPECIFICATION.md → Provider Lifecycle
 */

import type { EventBus } from '@vestara/event-bus';
import type { Logger } from '@vestara/logger';
import type { AIModel, AIProvider, ProviderHealthStatus, ProviderStatus } from '@vestara/shared';

export interface ProviderManager {
  register(provider: AIProvider): Promise<void>;
  load(providerId: string): Promise<void>;
  unload(providerId: string): Promise<void>;
  health(providerId: string): Promise<ProviderHealthStatus | null>;
  healthAll(): Promise<ProviderHealthStatus[]>;
  getProvider<T extends AIProvider = AIProvider>(providerId: string): T | null;
  getProviderByCapability(capability: string): AIProvider | null;
  listProviders(): ProviderInfo[];
}

export interface ProviderInfo {
  id: string;
  name: string;
  version: string;
  status: ProviderStatus;
  modelCount: number;
  capabilities: string[];
}

export class DefaultProviderManager implements ProviderManager {
  private providers: Map<string, AIProvider> = new Map();
  private logger?: Logger;
  private eventBus?: EventBus;

  constructor(options?: { logger?: Logger; eventBus?: EventBus }) {
    this.logger = options?.logger?.child({ component: 'provider-runtime' });
    this.eventBus = options?.eventBus;
  }

  async register(provider: AIProvider): Promise<void> {
    if (this.providers.has(provider.id)) {
      throw new Error(`Provider already registered: "${provider.id}"`);
    }
    this.providers.set(provider.id, provider);
    this.logger?.info(`Provider registered: ${provider.name}`, {
      id: provider.id,
      version: provider.version,
    });
  }

  async load(providerId: string): Promise<void> {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Provider not found: "${providerId}"`);

    await provider.initialize({});
    this.logger?.info(`Provider loaded: ${provider.name}`, {
      models: provider.models.length,
      capabilities: provider.capabilities.features,
    });

    await this.eventBus?.emit({
      type: 'provider:loaded',
      source: 'provider-runtime',
      payload: {
        providerId: provider.id,
        models: provider.models.map((m: AIModel) => m.id),
      },
    });
  }

  async unload(providerId: string): Promise<void> {
    this.providers.delete(providerId);
    this.logger?.info(`Provider unloaded: ${providerId}`);

    await this.eventBus?.emit({
      type: 'provider:unloaded',
      source: 'provider-runtime',
      payload: { providerId },
    });
  }

  async health(providerId: string): Promise<ProviderHealthStatus | null> {
    const provider = this.providers.get(providerId);
    if (!provider) return null;

    try {
      return await provider.healthCheck();
    } catch {
      return {
        status: 'unhealthy',
        providerId,
        modelCount: 0,
        latency: 0,
        lastHeartbeat: new Date().toISOString(),
        message: 'Health check failed',
      };
    }
  }

  async healthAll(): Promise<ProviderHealthStatus[]> {
    const results: ProviderHealthStatus[] = [];
    for (const [id] of this.providers) {
      const health = await this.health(id);
      if (health) results.push(health);
    }
    return results;
  }

  getProvider<T extends AIProvider = AIProvider>(providerId: string): T | null {
    return (this.providers.get(providerId) as T) ?? null;
  }

  getProviderByCapability(capability: string): AIProvider | null {
    for (const provider of this.providers.values()) {
      if (provider.capabilities.features.includes(capability)) {
        return provider;
      }
    }
    return null;
  }

  listProviders(): ProviderInfo[] {
    return Array.from(this.providers.values()).map((p: AIProvider) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      status: p.status,
      modelCount: p.models.length,
      capabilities: p.capabilities.features,
    }));
  }
}
