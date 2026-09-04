import type { VestaraAudioService } from '@vestara/audio';
import type { DefaultConversationService } from '@vestara/conversation';
import type { DefaultConversationEngine, ProviderRouter } from '@vestara/conversation-runtime';
import type { DefaultKernel } from '@vestara/kernel';
import { Runtime, type RuntimeConfig, type RuntimeHooks } from '@vestara/runtime';
import type { DefaultStateRuntime } from '@vestara/state-runtime';
import type { VestaraSTTService } from '@vestara/stt';
import type { VestaraTTSService } from '@vestara/tts';
import type { WorkspaceRuntimeService } from '@vestara/workspace';

export interface CliRuntimeServices {
  kernel: DefaultKernel;
  conversationEngine: DefaultConversationEngine;
  conversationService: DefaultConversationService;
  conversationId: string;
  stateRuntime: DefaultStateRuntime;
  audioService: VestaraAudioService;
  sttService: VestaraSTTService;
  ttsService: VestaraTTSService;
  providerRouter: ProviderRouter;
  workspaceRuntime?: WorkspaceRuntimeService;
}

export class CliRuntime extends Runtime {
  private readonly _services: CliRuntimeServices;

  constructor(config: RuntimeConfig, services: CliRuntimeServices, hooks?: RuntimeHooks) {
    const defaultOnStop = async () => {
      if (services.workspaceRuntime && services.workspaceRuntime.state !== 'stopped') {
        await services.workspaceRuntime.stop();
        await services.workspaceRuntime.destroy();
      }
      await services.conversationEngine?.endSession();
      await services.stateRuntime?.checkpoint();
      await services.stateRuntime?.shutdown();
      await services.kernel?.shutdown();
    };
    super(config, {
      onStop: async () => {
        await defaultOnStop();
        if (hooks?.onStop) await hooks.onStop();
      },
      onDestroy: hooks?.onDestroy,
    });
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

  get conversationId(): string {
    return this._services.conversationId;
  }

  get stateRuntime(): DefaultStateRuntime {
    return this._services.stateRuntime;
  }

  get audioService(): VestaraAudioService {
    return this._services.audioService;
  }

  get sttService(): VestaraSTTService {
    return this._services.sttService;
  }

  get ttsService(): VestaraTTSService {
    return this._services.ttsService;
  }

  get providerRouter(): ProviderRouter {
    return this._services.providerRouter;
  }

  get workspaceRuntime(): WorkspaceRuntimeService | undefined {
    return this._services.workspaceRuntime;
  }
}
