import type { RuntimeConfig, RuntimeId, RuntimeType } from '@vestara/runtime';
import { RuntimeGroup } from './runtime-group';
import type { WorkspaceDefinition } from './workspace-definition';
import { WorkspaceComposition } from './workspace-runtime';

export class WorkspaceFactory {
  static create(
    definition: WorkspaceDefinition,
    getDependencies: (type: RuntimeType) => readonly RuntimeType[] = () => [],
  ): { runtime: WorkspaceComposition; group: RuntimeGroup } {
    const group = new RuntimeGroup({ getDependencies });

    const config: RuntimeConfig = {
      id: `workspace:${definition.name}` as unknown as RuntimeId,
      type: 'workspace' as RuntimeType,
      name: definition.name,
    };

    for (const reg of definition.runtimes) {
      group.add(reg.type, reg.instance, reg.critical);
    }

    const runtime = new WorkspaceComposition(config, group);
    return { runtime, group };
  }
}
