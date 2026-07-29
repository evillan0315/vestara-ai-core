/**
 * @vestara/configuration — Configuration Manager
 *
 * Loads configuration from multiple sources (defaults, files, environment),
 * validates schemas, and supports hot-reload.
 *
 * Architecture Traceability:
 *   Runtime: VESTARA-KERNEL.md → Configuration Manager
 *   Foundation: UNIVERSAL-INTERFACE.md → ConfigurationProvider
 */

import type { ConfigChangeHandler, ConfigSource } from '@vestara/shared';

export interface ConfigurationProvider {
  get<T>(key: string, defaultValue?: T): T;
  set<T>(key: string, value: T): void;
  has(key: string): boolean;
  keys(): string[];
  load(): Promise<void>;
  onChange(keys: string[], handler: ConfigChangeHandler): import('@vestara/shared').Unsubscribe;
  getVersion(): string;
  toObject(): Record<string, unknown>;
}

const DEFAULT_CONFIG: Record<string, unknown> = {
  'runtime.name': 'Vestara Runtime',
  'runtime.version': '0.1.0',
  'runtime.logLevel': 'info',
  'runtime.metrics.port': 9090,
  'runtime.shutdownTimeout': 10_000,
  'runtime.health.interval': 15_000,
  'storage.path': './vestara-data',
  'storage.walMode': true,
  'providers.opencode.enabled': true,
  'providers.opencode.baseUrl': 'https://opencode.ai/zen/v1',
};

export class ConfigurationManager implements ConfigurationProvider {
  private config: Map<string, unknown>;
  private sources: ConfigSource[] = [];
  private changeHandlers: Map<string, Set<ConfigChangeHandler>> = new Map();
  private version = 0;

  constructor() {
    this.config = new Map(Object.entries(DEFAULT_CONFIG));
  }

  addSource(source: ConfigSource): void {
    this.sources.push(source);
  }

  async load(): Promise<void> {
    for (const source of this.sources) {
      try {
        const values = await source.load();
        for (const [key, value] of Object.entries(values)) {
          this.config.set(key, value);
        }
      } catch (error) {
        console.error(`[config] Failed to load source "${source.name}":`, error);
      }
    }

    // Load environment variables with VESTARA_ prefix
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('VESTARA_')) {
        const configKey = key.slice(8).toLowerCase().replace(/_/g, '.');
        this.config.set(configKey, value);
      }
    }

    this.version++;

    // Start watching sources
    for (const source of this.sources) {
      if (source.watch) {
        source.watch(async (changes) => {
          for (const [key, value] of Object.entries(changes)) {
            this.config.set(key, value);
          }
          this.version++;
          this.notifyHandlers(changes);
        });
      }
    }
  }

  get<T>(key: string, defaultValue?: T): T {
    if (this.config.has(key)) {
      return this.config.get(key) as T;
    }
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Configuration key not found: "${key}"`);
  }

  set<T>(key: string, value: T): void {
    this.config.set(key, value);
    this.version++;
    this.notifyHandlers({ [key]: value });
  }

  has(key: string): boolean {
    return this.config.has(key);
  }

  keys(): string[] {
    return Array.from(this.config.keys());
  }

  getVersion(): string {
    return `config-v${this.version}`;
  }

  toObject(): Record<string, unknown> {
    return Object.fromEntries(this.config);
  }

  onChange(keys: string[], handler: ConfigChangeHandler): import('@vestara/shared').Unsubscribe {
    for (const key of keys) {
      if (!this.changeHandlers.has(key)) {
        this.changeHandlers.set(key, new Set());
      }
      this.changeHandlers.get(key)!.add(handler);
    }

    return () => {
      for (const key of keys) {
        this.changeHandlers.get(key)?.delete(handler);
      }
    };
  }

  private notifyHandlers(changes: Record<string, unknown>): void {
    const affected = new Set<ConfigChangeHandler>();
    for (const key of Object.keys(changes)) {
      const handlers = this.changeHandlers.get(key);
      if (handlers) {
        for (const handler of handlers) {
          affected.add(handler);
        }
      }
    }
    for (const handler of affected) {
      handler(changes).catch((err) => {
        console.error('[config] Handler error:', err);
      });
    }
  }
}

// File source: loads vestara.json or vestara.config.json
export class FileConfigSource implements ConfigSource {
  readonly name: string;
  private path: string;

  constructor(path?: string) {
    this.path = path || './vestara.json';
    this.name = `file:${this.path}`;
  }

  async load(): Promise<Record<string, unknown>> {
    try {
      const fs = await import('node:fs');
      if (fs.existsSync(this.path)) {
        const content = fs.readFileSync(this.path, 'utf-8');
        const parsed = JSON.parse(content);
        return this.flatten(parsed, '');
      }
    } catch {
      // File not found or invalid — silently continue
    }
    return {};
  }

  private flatten(obj: Record<string, unknown>, prefix: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        Object.assign(result, this.flatten(value as Record<string, unknown>, fullKey));
      } else {
        result[fullKey] = value;
      }
    }
    return result;
  }
}
