import type { Runtime, RuntimeHealth, RuntimeType } from '@vestara/runtime';
import { DependencyResolver } from './dependency-resolver';
import { type AggregatedHealth, HealthAggregator } from './health-aggregator';

export class DuplicateRuntimeError extends Error {
  readonly runtimeType: RuntimeType;
  constructor(runtimeType: RuntimeType) {
    super(`Runtime already registered: ${runtimeType}`);
    this.name = 'DuplicateRuntimeError';
    this.runtimeType = runtimeType;
  }
}

export interface RuntimeGroupEntry {
  instance: Runtime;
  critical: boolean;
}

export class RuntimeGroup {
  private readonly runtimes: Map<RuntimeType, RuntimeGroupEntry> = new Map();
  private readonly resolver: DependencyResolver;
  private readonly healthAggregator: HealthAggregator;
  private readonly getDependencies: (type: RuntimeType) => readonly RuntimeType[];
  private startOrder: Runtime[] = [];

  constructor(options: {
    getDependencies: (type: RuntimeType) => readonly RuntimeType[];
    resolver?: DependencyResolver;
    healthAggregator?: HealthAggregator;
  }) {
    this.getDependencies = options.getDependencies;
    this.resolver = options.resolver ?? new DependencyResolver();
    this.healthAggregator = options.healthAggregator ?? new HealthAggregator();
  }

  add(type: RuntimeType, runtime: Runtime, critical?: boolean): void {
    if (this.runtimes.has(type)) {
      throw new DuplicateRuntimeError(type);
    }
    this.runtimes.set(type, { instance: runtime, critical: critical ?? false });
  }

  get(type: RuntimeType): Runtime | undefined {
    return this.runtimes.get(type)?.instance;
  }

  has(type: RuntimeType): boolean {
    return this.runtimes.has(type);
  }

  get size(): number {
    return this.runtimes.size;
  }

  async initializeAll(): Promise<void> {
    this.startOrder = this.resolver.resolve(
      new Map(Array.from(this.runtimes.entries()).map(([t, r]) => [t, r.instance])),
      this.getDependencies,
    );

    for (const runtime of this.startOrder) {
      await runtime.initialize();
    }
  }

  async stopAll(): Promise<void> {
    const reverse = [...this.startOrder].reverse();
    for (const runtime of reverse) {
      await runtime.stop();
    }
  }

  getHealth(): AggregatedHealth {
    const healthMap = new Map<RuntimeType, { health: RuntimeHealth; critical: boolean }>();
    for (const [type, entry] of this.runtimes) {
      healthMap.set(type, { health: entry.instance.health, critical: entry.critical });
    }
    return this.healthAggregator.aggregate(healthMap);
  }
}
