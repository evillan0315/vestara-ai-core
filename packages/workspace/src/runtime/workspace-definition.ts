import type { Runtime, RuntimeType } from '@vestara/runtime';

export interface RuntimeRegistration {
  type: RuntimeType;
  instance: Runtime;
  critical: boolean;
}

export interface WorkspaceDefinition {
  name: string;
  runtimes: RuntimeRegistration[];
}
