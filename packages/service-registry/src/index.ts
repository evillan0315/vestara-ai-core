/**
 * @vestara/service-registry — Service Registry & Discovery
 *
 * Manages service registration, capability-based discovery, and
 * lifecycle tracking. Every VestaraService registers here.
 *
 * Architecture Traceability:
 *   Foundation: UNIVERSAL-INTERFACE.md → ServiceRegistry
 *   Runtime: LIFECYCLE-SPECIFICATION.md → Service Lifecycle
 */

import type { EventBus } from '@vestara/event-bus';
import type { Logger } from '@vestara/logger';
import type { ServiceInfo, ServiceRegistryEvent, ServiceStatus, VestaraService } from '@vestara/shared';

export interface ServiceRegistry {
  register(service: VestaraService, capabilities?: string[]): Promise<void>;
  unregister(serviceId: string): Promise<void>;
  get<T extends VestaraService>(serviceId: string): T | null;
  findByCapability<T extends VestaraService>(capability: string): T | null;
  findAllByCapability<T extends VestaraService>(capability: string): T[];
  listServices(): ServiceInfo[];
  watch(callback: (event: ServiceRegistryEvent) => void): () => void;
  updateStatus(serviceId: string, status: ServiceStatus): Promise<void>;
  getDependencyGraph(): DependencyGraph;
  setDependencies(serviceId: string, dependencies: string[]): void;
}

export interface ServiceEntry {
  service: VestaraService;
  capabilities: string[];
  registeredAt: string;
}

export interface DependencyGraph {
  nodes: string[];
  edges: Array<{ from: string; to: string }>;
  layers: string[][];
}

export class DefaultServiceRegistry implements ServiceRegistry {
  private services: Map<string, ServiceEntry> = new Map();
  private watchers: Set<(event: ServiceRegistryEvent) => void> = new Set();
  private dependencyMap: Map<string, string[]> = new Map();
  private logger?: Logger;
  private eventBus?: EventBus;

  constructor(options?: { logger?: Logger; eventBus?: EventBus }) {
    this.logger = options?.logger;
    this.eventBus = options?.eventBus;
  }

  setDependencies(serviceId: string, dependencies: string[]): void {
    this.dependencyMap.set(serviceId, dependencies);
  }

  async register(service: VestaraService, capabilities: string[] = []): Promise<void> {
    if (this.services.has(service.id)) {
      throw new Error(`Service already registered: "${service.id}"`);
    }

    this.services.set(service.id, {
      service,
      capabilities,
      registeredAt: new Date().toISOString(),
    });

    this.logger?.info(`Service registered: ${service.id}`, {
      capabilities,
      version: service.version,
    });

    this.notifyWatchers({ type: 'registered', serviceId: service.id, timestamp: new Date().toISOString() });

    if (this.eventBus) {
      await this.eventBus.emit({
        type: 'service:registered',
        version: 1,
        source: 'service-registry',
        payload: { serviceId: service.id, capabilities, version: service.version },
      });
    }
  }

  async unregister(serviceId: string): Promise<void> {
    this.services.delete(serviceId);
    this.logger?.info(`Service unregistered: ${serviceId}`);
    this.notifyWatchers({ type: 'unregistered', serviceId, timestamp: new Date().toISOString() });
  }

  get<T extends VestaraService>(serviceId: string): T | null {
    const entry = this.services.get(serviceId);
    return entry ? (entry.service as T) : null;
  }

  findByCapability<T extends VestaraService>(capability: string): T | null {
    for (const entry of this.services.values()) {
      if (entry.capabilities.includes(capability)) {
        return entry.service as T;
      }
    }
    return null;
  }

  findAllByCapability<T extends VestaraService>(capability: string): T[] {
    const results: T[] = [];
    for (const entry of this.services.values()) {
      if (entry.capabilities.includes(capability)) {
        results.push(entry.service as T);
      }
    }
    return results;
  }

  listServices(): ServiceInfo[] {
    const result: ServiceInfo[] = [];
    for (const [id, entry] of this.services) {
      result.push({
        id,
        version: entry.service.version,
        status: entry.service.status,
        capabilities: entry.capabilities,
        dependencies: this.dependencyMap.get(id) ?? [],
        uptime:
          entry.service.status === 'running'
            ? Math.floor((Date.now() - new Date(entry.registeredAt).getTime()) / 1000)
            : 0,
      });
    }
    return result;
  }

  watch(callback: (event: ServiceRegistryEvent) => void): () => void {
    this.watchers.add(callback);
    return () => this.watchers.delete(callback);
  }

  async updateStatus(serviceId: string, status: ServiceStatus): Promise<void> {
    this.logger?.debug(`Service status changed: ${serviceId} → ${status}`);
    this.notifyWatchers({ type: 'status-changed', serviceId, timestamp: new Date().toISOString() });
  }

  getDependencyGraph(): DependencyGraph {
    const nodes: string[] = [];
    const edges: Array<{ from: string; to: string }> = [];
    const layers: string[][] = [];
    const _visited = new Set<string>();

    // Topological sort
    const inDegree = new Map<string, number>();
    for (const [id] of this.services) {
      inDegree.set(id, 0);
      nodes.push(id);
    }
    for (const [id, deps] of this.dependencyMap) {
      for (const dep of deps) {
        edges.push({ from: dep, to: id });
        inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
      }
    }

    // Kahn's algorithm for layer assignment
    let queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
    }

    while (queue.length > 0) {
      layers.push([...queue]);
      const next: string[] = [];
      for (const node of queue) {
        for (const edge of edges) {
          if (edge.from === node) {
            const target = edge.to;
            const newDegree = (inDegree.get(target) ?? 1) - 1;
            inDegree.set(target, newDegree);
            if (newDegree === 0) next.push(target);
          }
        }
      }
      queue = next;
    }

    return { nodes, edges, layers };
  }

  private notifyWatchers(event: ServiceRegistryEvent): void {
    for (const watcher of this.watchers) {
      try {
        watcher(event);
      } catch {
        // Watcher errors shouldn't crash the registry
      }
    }
  }
}
