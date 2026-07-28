import type { ActivityService } from '@vestara/activity-log';
import type { EventBus } from '@vestara/event-bus';
import type { DefaultKernel } from '@vestara/kernel';
import { Runtime, type RuntimeConfig, type RuntimeHooks } from '@vestara/runtime';
import type { MemoryService, PlanningService, SessionService, WorkspaceRuntime } from '@vestara/workspace';

export interface ApiRuntimeServices {
  kernel: DefaultKernel;
  workspaceRuntime: WorkspaceRuntime;
  eventBus: EventBus;
  planning: PlanningService;
  sessions: SessionService;
  memory: MemoryService;
  activity?: ActivityService;
}

export class ApiRuntime extends Runtime {
  private readonly _services: ApiRuntimeServices;

  constructor(config: RuntimeConfig, services: ApiRuntimeServices, hooks?: RuntimeHooks) {
    super(
      config,
      hooks
        ? {
            onStop: async () => {
              await services.activity?.stop();
              if (hooks?.onStop) await hooks.onStop();
            },
            onDestroy: hooks?.onDestroy,
          }
        : {
            onStop: async () => {
              await services.activity?.stop();
            },
          },
    );
    this._services = services;
  }

  get services(): Readonly<ApiRuntimeServices> {
    return this._services;
  }

  get planning(): PlanningService {
    return this._services.planning;
  }

  get sessions(): SessionService {
    return this._services.sessions;
  }

  get memory(): MemoryService {
    return this._services.memory;
  }

  get activity(): ActivityService | undefined {
    return this._services.activity;
  }

  get kernel(): DefaultKernel {
    return this._services.kernel;
  }

  get workspaceRuntime(): WorkspaceRuntime {
    return this._services.workspaceRuntime;
  }

  get eventBus(): EventBus {
    return this._services.eventBus;
  }
}
