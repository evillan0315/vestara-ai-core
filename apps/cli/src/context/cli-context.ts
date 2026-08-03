/**
 * Boots kernel + workspace + conversation + audio + activity services for the CLI.
 * Workspace Runtime runs as an autonomous service in every CLI session,
 * auto-detecting the current working directory and providing project context,
 * filesystem tools, and git integration.
 */

import type { DefaultActionRuntime } from '@vestara/action';
import { ActivityLogStore, ActivityService } from '@vestara/activity-log';
import {
  DefaultMicrophoneProvider,
  DefaultSpeakerProvider,
  SileroVADProvider,
  VestaraAudioService,
} from '@vestara/audio';
import { DefaultConversationService } from '@vestara/conversation';
import {
  DefaultConversationEngine,
  LocalProvider,
  OllamaProvider,
  ProviderRouter,
  SqliteConversationSessionStore,
  SqliteUserProfileStore,
} from '@vestara/conversation-runtime';
import { DefaultKernel } from '@vestara/kernel';
import { OpenCodeProvider } from '@vestara/provider-opencode';
import { DefaultProviderManager } from '@vestara/provider-runtime';
import { DefaultStateRuntime } from '@vestara/state-runtime';
import { VestaraSTTService, WhisperSTTProvider } from '@vestara/stt';
import { createShellTool } from '@vestara/tools-shell';
import { PiperTTSProvider, VestaraTTSService } from '@vestara/tts';
import {
  WorkspaceContextProvider,
  WorkspaceRuntimeService,
  type WorkspaceRuntimeServiceHealth,
} from '@vestara/workspace';
import { CliRuntime } from '../runtime/cli-runtime.js';

export interface CliContext {
  kernel: DefaultKernel;
  stateRuntime: DefaultStateRuntime;
  conversationService: DefaultConversationService;
  conversationEngine: DefaultConversationEngine;
  conversationId: string;
  activityService: ActivityService;
  activityStore: ActivityLogStore;
  audioService: VestaraAudioService;
  sttService: VestaraSTTService;
  ttsService: VestaraTTSService;
  providerRouter: ProviderRouter;
  providerManager: DefaultProviderManager;
  opencode: OpenCodeProvider;
  cliRuntime: CliRuntime;
  workspaceRuntime: WorkspaceRuntimeService;
  workspaceHealth: WorkspaceRuntimeServiceHealth;
  actionRuntime: DefaultActionRuntime;
  close: () => Promise<void>;
}

export async function createCliContext(workspacePath?: string): Promise<CliContext> {
  const kernel = new DefaultKernel();
  const providerManager = new DefaultProviderManager();
  const opencode = new OpenCodeProvider();
  await providerManager.register(opencode);

  await kernel.boot({
    providers: [{ manager: providerManager, providerId: 'opencode' }],
    logLevel: 'warn',
  });

  // State runtime
  const stateRuntime = new DefaultStateRuntime({
    logger: kernel.logger,
    eventBus: kernel.eventBus,
  });
  await stateRuntime.initialize('./vestara-state.db');

  // Workspace Runtime — auto-detect current directory
  const rootDir = workspacePath ?? process.cwd();
  const workspaceRuntime = new WorkspaceRuntimeService({
    id: 'workspace-runtime' as any,
    type: 'workspace' as any,
    name: 'CLI Workspace Runtime',
    rootDir,
    eventBus: kernel.eventBus,
    logger: kernel.logger,
  });
  await workspaceRuntime.initialize();
  const workspaceHealth = workspaceRuntime.getRuntimeHealth();

  // Context provider with workspace awareness
  const contextAssembler = workspaceRuntime.contextProvider;

  // Try local Ollama; fall back to OpenCode
  const ollamaProvider = new OllamaProvider({
    baseUrl: 'http://127.0.0.1:11434',
    defaultModel: 'deepseek-coder:1.3b',
  });
  await ollamaProvider.health();

  const providerRouter = new ProviderRouter();
  if (ollamaProvider.available) {
    providerRouter.registerOnline(ollamaProvider);
  } else {
    const { OpenCodeCloudProvider } = await import('@vestara/conversation-runtime');
    providerRouter.registerOnline(new OpenCodeCloudProvider(opencode));
  }
  providerRouter.registerOffline(new LocalProvider());

  const routedConversationService = new DefaultConversationService({
    contextAssembler,
    providerExecutor: providerRouter,
    eventBus: kernel.eventBus,
    logger: kernel.logger,
  });

  // Conversation engine
  const profileStore = new SqliteUserProfileStore({
    dbPath: './vestara-state.db',
    logger: kernel.logger,
  });
  const sessionStore = new SqliteConversationSessionStore({
    dbPath: './vestara-state.db',
    logger: kernel.logger,
  });

  const conversationEngine = new DefaultConversationEngine({
    conversationService: routedConversationService,
    profileStore,
    sessionStore,
    providerRouter,
    eventBus: kernel.eventBus,
    logger: kernel.logger,
  });
  await conversationEngine.initialize();

  // Restore or create conversation
  const previousConversations = await stateRuntime.conversations.listConversations(5);
  let conversation;
  if (previousConversations.length > 0) {
    conversation = await stateRuntime.conversations.getConversation(previousConversations[0].id);
    if (!conversation) {
      conversation = await routedConversationService.createConversation();
    }
  } else {
    conversation = await routedConversationService.createConversation();
  }

  // Start session
  await conversationEngine.startSession();

  // Persist conversations after each exchange
  const persistUnsub = kernel.eventBus.subscribe(
    'conversation:response.completed',
    async (event: { payload: Record<string, unknown> }) => {
      const convId = event.payload.conversationId as string;
      if (typeof convId !== 'string') return;
      const conv = await routedConversationService.getConversation(convId);
      if (conv) {
        await stateRuntime.conversations.saveConversation(conv);
        for (const msg of conv.messages) {
          await stateRuntime.conversations.saveMessage(convId, msg);
        }
      }
    },
  );

  // Activity log
  const activityStore = new ActivityLogStore({
    dbPath: './vestara-activity.db',
    logger: kernel.logger,
  });
  await activityStore.initialize();
  const activityService = new ActivityService({
    store: activityStore,
    eventBus: kernel.eventBus,
    logger: kernel.logger,
  });
  activityService.start();

  // Register activity with events-server (best-effort)
  try {
    const { registerActivityService } = await import('@vestara/events-server');
    registerActivityService(activityService);
  } catch {
    // events-server may not be available
  }

  // Audio services
  const audioService = new VestaraAudioService({ logger: kernel.logger });
  audioService.registerMicrophone(new DefaultMicrophoneProvider());
  audioService.registerSpeaker(new DefaultSpeakerProvider());
  audioService.registerVAD(new SileroVADProvider());

  const sttService = new VestaraSTTService({ logger: kernel.logger });
  sttService.registerProvider(new WhisperSTTProvider());

  const ttsService = new VestaraTTSService({ logger: kernel.logger });
  ttsService.registerProvider(new PiperTTSProvider());

  // Action Runtime — register workspace tools + shell tool
  const { DefaultActionRuntime } = await import('@vestara/action');
  const actionRuntime = new DefaultActionRuntime({
    permissionEngine: kernel.permissions as any,
    eventBus: kernel.eventBus,
    logger: kernel.logger,
  });

  // Register workspace tools (filesystem, git, etc.)
  for (const tool of workspaceRuntime.getAllTools()) {
    actionRuntime.registerTool(tool);
  }

  // Register agent filesystem capabilities as tools (capability model path).
  // Execution flows through FilesystemRuntime: workspace root sandbox, approval
  // gates, dry-run, and operation logging.
  const { FilesystemRuntime } = await import('@vestara/filesystem-runtime');
  const { AgentCapabilityManager, createFilesystemCapabilityTools } = await import('@vestara/workspace');
  const capabilityManager = new AgentCapabilityManager({ filesystem: new FilesystemRuntime({ rootDir }) });
  for (const tool of createFilesystemCapabilityTools(capabilityManager)) {
    actionRuntime.registerTool(tool);
  }

  // Register shell/bash execution tool
  actionRuntime.registerTool(createShellTool());

  // Pass tool definitions to the context provider so the AI knows what tools are available
  contextAssembler.setTools(actionRuntime.listTools());

  // Create CliRuntime — managed lifecycle for CLI services
  const cliRuntime = new CliRuntime(
    {
      id: 'cli-runtime' as any,
      type: 'runtime' as any,
      name: 'CLI Runtime',
      eventBus: kernel.eventBus,
      permissionManager: kernel.permissions as any,
    },
    {
      kernel,
      conversationEngine,
      conversationService: routedConversationService,
      activity: activityService,
      conversationId: conversation.id,
      stateRuntime,
      audioService,
      sttService,
      ttsService,
      providerRouter,
      workspaceRuntime,
    },
  );

  return {
    kernel,
    stateRuntime,
    conversationService: routedConversationService,
    conversationEngine,
    conversationId: conversation.id,
    activityService,
    activityStore,
    audioService,
    sttService,
    ttsService,
    providerRouter,
    providerManager,
    opencode,
    cliRuntime,
    workspaceRuntime,
    workspaceHealth,
    actionRuntime,
    close: async () => {
      persistUnsub();
      await conversationEngine.endSession();
      activityService.stop();
      if (workspaceRuntime.state !== 'stopped') {
        await workspaceRuntime.stop();
        await workspaceRuntime.destroy();
      }
      await stateRuntime.checkpoint();
      await stateRuntime.shutdown();
      await kernel.shutdown();
    },
  };
}
