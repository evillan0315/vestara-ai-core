import type { ActivityService } from '@vestara/activity-log';
import type { DefaultConversationService } from '@vestara/conversation';
import type { DefaultConversationEngine } from '@vestara/conversation-runtime';
import type { DefaultKernel } from '@vestara/kernel';
import { Runtime, type RuntimeConfig, type RuntimeHooks } from '@vestara/runtime';

export interface CliRuntimeServices {
  kernel: DefaultKernel;
  conversationEngine: DefaultConversationEngine;
  conversationService: DefaultConversationService;
  activity: ActivityService;
  conversationId: string;
}

export class CliRuntime extends Runtime {
  private readonly _services: CliRuntimeServices;

  constructor(config: RuntimeConfig, services: CliRuntimeServices, hooks?: RuntimeHooks) {
    super(
      config,
      hooks
        ? {
            onStop: async () => {
              if (hooks?.onStop) await hooks.onStop();
            },
            onDestroy: hooks?.onDestroy,
          }
        : undefined,
    );
    this._services = services;
  }

  get services(): Readonly<CliRuntimeServices> {
    return this._services;
  }

  get kernel(): DefaultKernel {
    return this._services.kernel;
  }

  get conversationEngine(): DefaultConversationEngine {
    return this._services.conversationEngine;
  }

  get conversationService(): DefaultConversationService {
    return this._services.conversationService;
  }

  get activity(): ActivityService {
    return this._services.activity;
  }

  get conversationId(): string {
    return this._services.conversationId;
  }
}
