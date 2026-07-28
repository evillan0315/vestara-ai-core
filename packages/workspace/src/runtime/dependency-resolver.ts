import type { Runtime, RuntimeType } from '@vestara/runtime';

export class RuntimeDependencyCycleError extends Error {
  readonly cycle: RuntimeType[];
  constructor(cycle: RuntimeType[]) {
    super(`Circular runtime dependency: ${cycle.join(' → ')}`);
    this.name = 'RuntimeDependencyCycleError';
    this.cycle = cycle;
  }
}

export class MissingDependencyError extends Error {
  readonly missingType: RuntimeType;
  readonly consumerType: RuntimeType;
  constructor(missingType: RuntimeType, consumerType: RuntimeType) {
    super(`Missing dependency: ${consumerType} depends on ${missingType} which is not registered`);
    this.name = 'MissingDependencyError';
    this.missingType = missingType;
    this.consumerType = consumerType;
  }
}

export interface DependencyResolverConfig {
  strict?: boolean;
}

export class DependencyResolver {
  private readonly strict: boolean;

  constructor(config?: DependencyResolverConfig) {
    this.strict = config?.strict ?? false;
  }

  resolve(
    runtimes: Map<RuntimeType, Runtime>,
    getDependencies: (type: RuntimeType) => readonly RuntimeType[],
  ): Runtime[] {
    const visited = new Set<RuntimeType>();
    const visiting = new Set<RuntimeType>();
    const order: RuntimeType[] = [];

    const visit = (type: RuntimeType): void => {
      if (visiting.has(type)) {
        const cycle = [...visiting];
        throw new RuntimeDependencyCycleError(cycle);
      }
      if (visited.has(type)) return;

      visiting.add(type);

      const deps = getDependencies(type);
      for (const dep of deps) {
        if (runtimes.has(dep)) {
          visit(dep);
        } else if (this.strict) {
          throw new MissingDependencyError(dep, type);
        }
      }

      visiting.delete(type);
      visited.add(type);
      order.push(type);
    };

    for (const type of runtimes.keys()) {
      visit(type);
    }

    return order.map((type) => runtimes.get(type)!);
  }
}
