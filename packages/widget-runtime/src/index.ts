import type { EventBus } from '@vestara/event-bus';
import type { Logger } from '@vestara/logger';

// ─── Manifest ──────────────────────────────────────────────────

export type WidgetCategory =
  | 'repository'
  | 'health'
  | 'activity'
  | 'memory'
  | 'agents'
  | 'system'
  | 'development'
  | 'custom';

export type WidgetLocation = 'left' | 'center' | 'right' | 'full';

export type WidgetRefreshMode = 'event' | 'interval' | 'manual';

export interface WidgetManifest {
  id: string;
  version: string;
  name: string;
  description: string;
  category: WidgetCategory;
  icon: string;
  permissions: string[];
  events: string[];
  refresh: WidgetRefreshMode;
  intervalMs?: number;
  location: WidgetLocation;
  priority: number;
  subsystem: string;
}

// ─── Lifecycle ─────────────────────────────────────────────────

export type WidgetLifecycleState =
  | 'installed'
  | 'registered'
  | 'loaded'
  | 'initialized'
  | 'subscribed'
  | 'running'
  | 'suspended'
  | 'destroyed';

export interface WidgetLifecycleEvent {
  widgetId: string;
  from: WidgetLifecycleState;
  to: WidgetLifecycleState;
  timestamp: string;
  error?: string;
  [key: string]: unknown;
}

// ─── Instance ──────────────────────────────────────────────────

export interface WidgetInstance {
  readonly manifest: WidgetManifest;
  readonly state: WidgetLifecycleState;
  readonly element: HTMLElement | null;

  initialize(): Promise<void>;
  subscribe(eventBus: EventBus): Promise<void>;
  mount(container: HTMLElement): Promise<void>;
  unmount(): Promise<void>;
  suspend(): Promise<void>;
  resume(): Promise<void>;
  destroy(): Promise<void>;
  refresh(): Promise<void>;
}

export type WidgetFactory = (manifest: WidgetManifest) => WidgetInstance;

// ─── Widget Lifecycle Manager ──────────────────────────────────

export class WidgetLifecycleManager {
  private instances: Map<string, WidgetInstance> = new Map();
  private factories: Map<string, WidgetFactory> = new Map();
  private logger?: Logger;
  private eventBus?: EventBus;

  constructor(opts?: { logger?: Logger; eventBus?: EventBus }) {
    this.logger = opts?.logger?.child({ component: 'widget-lifecycle' });
    this.eventBus = opts?.eventBus;
  }

  registerFactory(category: WidgetCategory, factory: WidgetFactory): void {
    this.factories.set(category, factory);
    this.logger?.info('Widget factory registered', { category });
  }

  async instantiate(manifest: WidgetManifest): Promise<WidgetInstance> {
    const factory = this.factories.get(manifest.category);
    if (!factory) {
      throw new Error(`No factory registered for category: ${manifest.category}`);
    }

    const instance = factory(manifest);
    this.instances.set(manifest.id, instance);
    await this.transition(instance, 'installed', 'registered');
    return instance;
  }

  async initialize(instance: WidgetInstance): Promise<void> {
    await this.transition(instance, 'registered', 'loaded');
    await instance.initialize();
    await this.transition(instance, 'loaded', 'initialized');

    if (this.eventBus) {
      await instance.subscribe(this.eventBus);
      await this.transition(instance, 'initialized', 'subscribed');
    }

    await this.transition(instance, 'subscribed', 'running');
  }

  async suspend(instance: WidgetInstance): Promise<void> {
    await instance.suspend();
    await this.transition(instance, 'running', 'suspended');
  }

  async resume(instance: WidgetInstance): Promise<void> {
    await instance.resume();
    await this.transition(instance, 'suspended', 'running');
  }

  async destroy(instance: WidgetInstance): Promise<void> {
    await instance.destroy();
    await this.transition(instance, instance.state, 'destroyed');
    this.instances.delete(instance.manifest.id);
  }

  get(id: string): WidgetInstance | undefined {
    return this.instances.get(id);
  }

  getAll(): WidgetInstance[] {
    return Array.from(this.instances.values());
  }

  private async transition(
    instance: WidgetInstance,
    from: WidgetLifecycleState,
    to: WidgetLifecycleState,
  ): Promise<void> {
    const event: WidgetLifecycleEvent = {
      widgetId: instance.manifest.id,
      from,
      to,
      timestamp: new Date().toISOString(),
    };
    (instance as unknown as Record<string, unknown>).state = to;
    this.logger?.debug('Widget lifecycle transition', event);
    if (this.eventBus) {
      await this.eventBus.emit({
        type: 'widget:lifecycle',
        source: 'widget-lifecycle-manager',
        payload: event,
      });
    }
  }
}

// ─── Dashboard Runtime ─────────────────────────────────────────

export interface DashboardRuntimeOptions {
  logger?: Logger;
  eventBus: EventBus;
  lifecycleManager: WidgetLifecycleManager;
}

export interface DashboardLayout {
  left: string[];
  center: string[];
  right: string[];
  full: string[];
}

export class DashboardRuntime {
  private logger?: Logger;
  private eventBus: EventBus;
  private lifecycle: WidgetLifecycleManager;
  private manifests: Map<string, WidgetManifest> = new Map();
  private layout: DashboardLayout = { left: [], center: [], right: [], full: [] };

  constructor(opts: DashboardRuntimeOptions) {
    this.logger = opts.logger?.child({ component: 'dashboard-runtime' });
    this.eventBus = opts.eventBus;
    this.lifecycle = opts.lifecycleManager;
  }

  registerManifest(manifest: WidgetManifest): void {
    if (this.manifests.has(manifest.id)) {
      this.logger?.warn('Widget manifest already registered, skipping', { id: manifest.id });
      return;
    }
    this.manifests.set(manifest.id, manifest);
    this.layout[manifest.location].push(manifest.id);
    this.layout[manifest.location].sort((a, b) => {
      const mA = this.manifests.get(a)!;
      const mB = this.manifests.get(b)!;
      return mA.priority - mB.priority;
    });
    this.logger?.info('Widget manifest registered', { id: manifest.id, location: manifest.location });
  }

  registerManifests(manifests: WidgetManifest[]): void {
    const sorted = [...manifests].sort((a, b) => a.priority - b.priority);
    for (const m of sorted) {
      this.registerManifest(m);
    }
  }

  async boot(): Promise<void> {
    this.logger?.info('Dashboard runtime booting', { widgets: this.manifests.size });
    await this.eventBus.emit({
      type: 'dashboard:booting',
      source: 'dashboard-runtime',
      payload: { widgetCount: this.manifests.size },
    });
  }

  async mountAll(containerMap: Record<WidgetLocation, HTMLElement>): Promise<void> {
    for (const [location, container] of Object.entries(containerMap)) {
      const ids = this.layout[location as WidgetLocation];
      for (const id of ids) {
        const manifest = this.manifests.get(id);
        if (!manifest) continue;
        try {
          const instance = await this.lifecycle.instantiate(manifest);
          await this.lifecycle.initialize(instance);
          await instance.mount(container);
          this.logger?.info('Widget mounted', { id, location });
        } catch (error) {
          this.logger?.error('Widget mount failed', {
            id,
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }
    await this.eventBus.emit({
      type: 'dashboard:ready',
      source: 'dashboard-runtime',
      payload: { mounted: this.manifests.size },
    });
  }

  async destroyAll(): Promise<void> {
    for (const instance of this.lifecycle.getAll()) {
      try {
        await this.lifecycle.destroy(instance);
      } catch (error) {
        this.logger?.error('Widget destroy failed', {
          id: instance.manifest.id,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
    this.manifests.clear();
    this.layout = { left: [], center: [], right: [], full: [] };
  }

  getLayout(): DashboardLayout {
    return { ...this.layout };
  }

  getManifests(): WidgetManifest[] {
    return Array.from(this.manifests.values());
  }
}
