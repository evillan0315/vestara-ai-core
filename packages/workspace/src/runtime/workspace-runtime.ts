import { Runtime, type RuntimeConfig } from '@vestara/runtime';
import type { AggregatedHealth } from './health-aggregator';
import type { RuntimeGroup } from './runtime-group';

export class WorkspaceComposition extends Runtime {
  private readonly group: RuntimeGroup;

  constructor(config: RuntimeConfig, group: RuntimeGroup) {
    super(config, {
      onInitialize: async () => {
        await group.initializeAll();
      },
      onStop: async () => {
        await group.stopAll();
      },
    });
    this.group = group;
  }

  getWorkspaceHealth(): AggregatedHealth {
    return this.group.getHealth();
  }

  addExternalRuntime(type: string, runtime: Runtime, critical?: boolean): void {
    this.group.add(type as unknown as import('@vestara/runtime').RuntimeType, runtime, critical);
  }
}
