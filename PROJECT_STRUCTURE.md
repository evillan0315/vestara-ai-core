# Project Structure

```text
.
├── apps
│   ├── api
│   │   ├── docs
│   │   │   └── api.yaml
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── src
│   │   │   ├── index.d.ts
│   │   │   ├── index.js
│   │   │   ├── index.js.map
│   │   │   ├── index.ts
│   │   │   ├── routes
│   │   │   ├── server.d.ts
│   │   │   ├── server.js
│   │   │   ├── server.js.map
│   │   │   ├── server.ts
│   │   │   ├── sql.d.ts
│   │   │   ├── workspace-context.d.ts
│   │   │   ├── workspace-context.js
│   │   │   ├── workspace-context.js.map
│   │   │   └── workspace-context.ts
│   │   ├── __tests__
│   │   │   ├── index.test.d.ts
│   │   │   ├── index.test.js
│   │   │   ├── index.test.js.map
│   │   │   └── index.test.ts
│   │   ├── tests
│   │   │   ├── health.test.d.ts
│   │   │   ├── health.test.js
│   │   │   ├── health.test.js.map
│   │   │   └── health.test.ts
│   │   ├── tsconfig.json
│   │   └── .vestara
│   │       ├── knowledge
│   │       │   └── chunks.db
│   │       ├── memory
│   │       ├── plans
│   │       │   └── plans.db
│   │       ├── prefs.db
│   │       ├── sessions
│   │       └── workspace.json
│   ├── cli
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── src
│   │   │   ├── commands
│   │   │   │   ├── open.d.ts
│   │   │   │   ├── open.js
│   │   │   │   ├── open.js.map
│   │   │   │   └── open.ts
│   │   │   ├── index.d.ts
│   │   │   ├── index.js
│   │   │   ├── index.js.map
│   │   │   ├── index.ts
│   │   │   ├── repl-workspace.d.ts
│   │   │   ├── repl-workspace.js
│   │   │   ├── repl-workspace.js.map
│   │   │   └── repl-workspace.ts
│   │   ├── __tests__
│   │   │   ├── index.test.d.ts
│   │   │   ├── index.test.js
│   │   │   ├── index.test.js.map
│   │   │   └── index.test.ts
│   │   └── tsconfig.json
│   ├── onboarding-lab
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── src
│   │   │   ├── index.d.ts
│   │   │   ├── index.js
│   │   │   ├── index.js.map
│   │   │   └── index.ts
│   │   ├── __tests__
│   │   │   ├── index.test.d.ts
│   │   │   ├── index.test.js
│   │   │   ├── index.test.js.map
│   │   │   └── index.test.ts
│   │   └── tsconfig.json
│   └── workspace
│       ├── biome.json
│       ├── generate_layout.sh
│       ├── generate_screen_structure.sh
│       ├── .gitignore
│       ├── index.html
│       ├── package.json
│       ├── public
│       │   ├── favicon.svg
│       │   └── logo.svg
│       ├── README.md
│       ├── src
│       │   ├── App.tsx
│       │   ├── components
│       │   │   ├── ActionPanel.tsx
│       │   │   ├── charts
│       │   │   │   ├── AreaChartCard.tsx
│       │   │   │   ├── BarChartCard.tsx
│       │   │   │   ├── index.ts
│       │   │   │   └── PieChartCard.tsx
│       │   │   ├── chat
│       │   │   │   ├── AssistantMessage.tsx
│       │   │   │   ├── AttachmentPreview.tsx
│       │   │   │   ├── ChatComposer.tsx
│       │   │   │   ├── ChatEmptyState.tsx
│       │   │   │   ├── ChatError.tsx
│       │   │   │   ├── ChatLayout.tsx
│       │   │   │   ├── ChatSearch.tsx
│       │   │   │   ├── ChatSidebar.tsx
│       │   │   │   ├── CodeBlock.tsx
│       │   │   │   ├── ConversationHeader.tsx
│       │   │   │   ├── ConversationItem.tsx
│       │   │   │   ├── ConversationList.tsx
│       │   │   │   ├── MarkdownRenderer.tsx
│       │   │   │   ├── MessageActions.tsx
│       │   │   │   ├── MessageList.tsx
│       │   │   │   ├── ModelSelector.tsx
│       │   │   │   ├── ScrollToLatest.tsx
│       │   │   │   ├── ThinkingIndicator.tsx
│       │   │   │   ├── ToolCallDisplay.tsx
│       │   │   │   ├── types.ts
│       │   │   │   ├── useChat.ts
│       │   │   │   ├── UserMessage.tsx
│       │   │   │   └── utils.ts
│       │   │   ├── ConnectionStatus.tsx
│       │   │   ├── dashboard
│       │   │   │   ├── ActivityStream.tsx
│       │   │   │   ├── constants.ts
│       │   │   │   ├── DashboardListCard.tsx
│       │   │   │   ├── DashboardListItem.tsx
│       │   │   │   ├── index.ts
│       │   │   │   ├── MilestoneEraSection.tsx
│       │   │   │   ├── Section.tsx
│       │   │   │   ├── StatCard.tsx
│       │   │   │   └── useDashboardDrag.ts
│       │   │   ├── EmptyState.tsx
│       │   │   ├── ErrorBoundary.tsx
│       │   │   ├── ExecutionDetailModal.tsx
│       │   │   ├── layout
│       │   │   │   ├── AppHeader
│       │   │   │   │   ├── AppHeader.tsx
│       │   │   │   │   ├── HeaderActions.tsx
│       │   │   │   │   ├── HeaderConnection.tsx
│       │   │   │   │   ├── HeaderNotifications.tsx
│       │   │   │   │   ├── HeaderSearch.tsx
│       │   │   │   │   └── HeaderUserMenu.tsx
│       │   │   │   ├── AppSidebar
│       │   │   │   │   ├── AppSidebar.tsx
│       │   │   │   │   ├── SidebarBrand.tsx
│       │   │   │   │   ├── SidebarFooter.tsx
│       │   │   │   │   ├── SidebarNavigationItem.tsx
│       │   │   │   │   ├── SidebarNavigation.tsx
│       │   │   │   │   ├── SidebarSection.tsx
│       │   │   │   │   ├── SidebarUser.tsx
│       │   │   │   │   └── SidebarWorkspace.tsx
│       │   │   │   ├── CommandPalette
│       │   │   │   │   └── CommandPalette.tsx
│       │   │   │   └── Page
│       │   │   │       ├── PageBreadcrumb.tsx
│       │   │   │       ├── PageContainer.tsx
│       │   │   │       └── PageHeader.tsx
│       │   │   ├── Logo.tsx
│       │   │   ├── OperationalWidgets.tsx
│       │   │   ├── SessionTimeline.tsx
│       │   │   ├── ShellLayout-tobe-deleted.tsx
│       │   │   ├── Sidebar.tsx
│       │   │   ├── terminal
│       │   │   │   ├── TerminalEmptyState.tsx
│       │   │   │   ├── TerminalPane.tsx
│       │   │   │   ├── TerminalStatusBar.tsx
│       │   │   │   ├── TerminalTabs.tsx
│       │   │   │   ├── TerminalWorkspace.tsx
│       │   │   │   ├── types.ts
│       │   │   │   └── useTerminalSessions.ts
│       │   │   ├── Toast.tsx
│       │   │   └── WorkflowPipeline.tsx
│       │   ├── features
│       │   ├── layouts
│       │   │   └── ShellLayout.tsx
│       │   ├── lib
│       │   │   ├── api.ts
│       │   │   ├── auth.tsx
│       │   │   ├── connection.tsx
│       │   │   ├── theme.tsx
│       │   │   ├── useEventStream.ts
│       │   │   └── ws.ts
│       │   ├── main.tsx
│       │   ├── operations
│       │   │   └── operations.tsx
│       │   ├── pages
│       │   │   ├── Agents.tsx
│       │   │   ├── ApiBuilder.tsx
│       │   │   ├── Artifacts.tsx
│       │   │   ├── ChatPage.tsx
│       │   │   ├── Dashboard.tsx
│       │   │   ├── FeatureRequests.tsx
│       │   │   ├── Login.tsx
│       │   │   ├── Logs.tsx
│       │   │   ├── Memory.tsx
│       │   │   ├── NotFound.tsx
│       │   │   ├── OpsCenter.tsx
│       │   │   ├── Projects.tsx
│       │   │   ├── SessionList.tsx
│       │   │   ├── Settings
│       │   │   │   ├── api
│       │   │   │   │   ├── index.ts
│       │   │   │   │   ├── providers.api.ts
│       │   │   │   │   └── settings.api.ts
│       │   │   │   ├── assets
│       │   │   │   │   └── provider-icons
│       │   │   │   ├── components
│       │   │   │   │   ├── appearance
│       │   │   │   │   │   ├── AccentSelector.tsx
│       │   │   │   │   │   ├── AppearanceMode.tsx
│       │   │   │   │   │   ├── index.ts
│       │   │   │   │   │   ├── LayoutSettings.tsx
│       │   │   │   │   │   ├── ProfileSelector.tsx
│       │   │   │   │   │   ├── ThemePreview.tsx
│       │   │   │   │   │   ├── ThemeSettings.tsx
│       │   │   │   │   │   └── TypographySettings.tsx
│       │   │   │   │   ├── charts
│       │   │   │   │   │   ├── index.ts
│       │   │   │   │   │   └── ProviderHealthChart.tsx
│       │   │   │   │   ├── common
│       │   │   │   │   │   ├── Badge.tsx
│       │   │   │   │   │   ├── Card.tsx
│       │   │   │   │   │   ├── index.ts
│       │   │   │   │   │   ├── NumberInput.tsx
│       │   │   │   │   │   ├── Select.tsx
│       │   │   │   │   │   ├── SettingGroup.tsx
│       │   │   │   │   │   ├── SettingRow.tsx
│       │   │   │   │   │   ├── TextInput.tsx
│       │   │   │   │   │   └── Toggle.tsx
│       │   │   │   │   ├── layout
│       │   │   │   │   │   ├── index.ts
│       │   │   │   │   │   ├── Section.tsx
│       │   │   │   │   │   ├── SettingsGrid.tsx
│       │   │   │   │   │   ├── SettingsHeader.tsx
│       │   │   │   │   │   └── StatusBanner.tsx
│       │   │   │   │   ├── preferences
│       │   │   │   │   │   ├── index.ts
│       │   │   │   │   │   ├── Preferences.tsx
│       │   │   │   │   │   ├── PreferenceToggle.tsx
│       │   │   │   │   │   └── ResetSettings.tsx
│       │   │   │   │   ├── providers
│       │   │   │   │   │   ├── ConnectionTester.tsx
│       │   │   │   │   │   ├── index.ts
│       │   │   │   │   │   ├── ModelSelector.tsx
│       │   │   │   │   │   ├── ProviderArchitecture.tsx
│       │   │   │   │   │   ├── ProviderCard.tsx
│       │   │   │   │   │   ├── ProviderConfiguration.tsx
│       │   │   │   │   │   └── ProviderMatrix.tsx
│       │   │   │   │   └── routing
│       │   │   │   │       ├── index.ts
│       │   │   │   │       ├── IntentModelRow.tsx
│       │   │   │   │       └── IntentRouting.tsx
│       │   │   │   ├── constants.ts
│       │   │   │   ├── context
│       │   │   │   │   └── SettingsContext.tsx
│       │   │   │   ├── hooks
│       │   │   │   │   ├── index.ts
│       │   │   │   │   ├── useConnectionTest.ts
│       │   │   │   │   ├── useProviderHealth.ts
│       │   │   │   │   ├── useSettings.ts
│       │   │   │   │   └── useThemeSettings.ts
│       │   │   │   ├── index.tsx
│       │   │   │   ├── models
│       │   │   │   │   ├── appearance.ts
│       │   │   │   │   ├── intentModels.ts
│       │   │   │   │   ├── preferences.ts
│       │   │   │   │   └── providers.ts
│       │   │   │   ├── README.md
│       │   │   │   ├── services
│       │   │   │   │   ├── connectionTester.ts
│       │   │   │   │   ├── providerHealth.ts
│       │   │   │   │   └── settingsStorage.ts
│       │   │   │   ├── SettingsPage.tsx
│       │   │   │   ├── types.ts
│       │   │   │   └── utils.ts
│       │   │   ├── Settings.tsx
│       │   │   └── Terminal.tsx
│       │   └── styles
│       │       └── index.css
│       ├── tsconfig.json
│       └── vite.config.ts
├── biome.json
├── build-order.sh
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── docs
│   ├── AI-OS-ARCHITECTURE.md
│   ├── AI-OS-ROADMAP.md
│   ├── api
│   │   ├── assets
│   │   │   ├── hierarchy.js
│   │   │   ├── highlight.css
│   │   │   ├── icons.js
│   │   │   ├── icons.svg
│   │   │   ├── main.js
│   │   │   ├── navigation.js
│   │   │   ├── search.js
│   │   │   └── style.css
│   │   ├── classes
│   │   │   ├── action_src.DefaultActionRuntime.html
│   │   │   ├── cognitive_src.DefaultCognitiveEngine.html
│   │   │   ├── cognitive_src.DefaultObservationEngine.html
│   │   │   ├── cognitive_src.DefaultUnderstandingEngine.html
│   │   │   ├── configuration_src.ConfigurationManager.html
│   │   │   ├── configuration_src.FileConfigSource.html
│   │   │   ├── context_src.DefaultContextAssembler.html
│   │   │   ├── conversation_src.DefaultConversationService.html
│   │   │   ├── event-bus_src.InProcessEventBus.html
│   │   │   ├── health_src.DefaultHealthManager.html
│   │   │   ├── kernel_src.DefaultKernel.html
│   │   │   ├── knowledge_src.DefaultChunkEngine.html
│   │   │   ├── knowledge_src.DefaultDocumentParser.html
│   │   │   ├── knowledge_src.DefaultKnowledgeEngine.html
│   │   │   ├── knowledge_src.DefaultKnowledgeIndexer.html
│   │   │   ├── knowledge_src.DefaultRepositoryAnalyzer.html
│   │   │   ├── knowledge_src.KnowledgeStorage.html
│   │   │   ├── logger_src.ConsoleSink.html
│   │   │   ├── logger_src.FileSink.html
│   │   │   ├── logger_src.StructuredLogger.html
│   │   │   ├── memory_src.DefaultMemoryRuntime.html
│   │   │   ├── metrics_src.MetricsRegistry.html
│   │   │   ├── os-controller_src.LifecycleController.html
│   │   │   ├── permission_src.DefaultPermissionEngine.html
│   │   │   ├── provider-runtime_src.DefaultProviderManager.html
│   │   │   ├── providers_opencode_src.OpenCodeProvider.html
│   │   │   ├── reasoning_src.ConsensusStrategy.html
│   │   │   ├── reasoning_src.DeepAnalysisStrategy.html
│   │   │   ├── reasoning_src.DefaultReasoningRuntime.html
│   │   │   ├── reasoning_src.DefaultStrategySelector.html
│   │   │   ├── reasoning_src.DelegationStrategy.html
│   │   │   ├── reasoning_src.FastResponseStrategy.html
│   │   │   ├── reasoning_src.MultiStepPlanningStrategy.html
│   │   │   ├── reasoning_src.ReflectionStrategy.html
│   │   │   ├── reasoning_src.SelfCritiqueStrategy.html
│   │   │   ├── reasoning_src.VerificationStrategy.html
│   │   │   ├── service-registry_src.DefaultServiceRegistry.html
│   │   │   ├── state-runtime_src.DefaultStateRuntime.html
│   │   │   ├── stream_src.DefaultStreamProcessor.html
│   │   │   ├── workspace_src.AccuracyStorage.html
│   │   │   ├── workspace_src.AgentCoordinator.html
│   │   │   ├── workspace_src.AgentDaemonService.html
│   │   │   ├── workspace_src.AgentPermissionEngine.html
│   │   │   ├── workspace_src.AgentRuntime.html
│   │   │   ├── workspace_src.AgentService.html
│   │   │   ├── workspace_src.AgentStorage.html
│   │   │   ├── workspace_src.AgentWorkflowService.html
│   │   │   ├── workspace_src.AnalyticsService.html
│   │   │   ├── workspace_src.AutoIndex.html
│   │   │   ├── workspace_src.CapabilityService.html
│   │   │   ├── workspace_src.ChangeSetStorage.html
│   │   │   ├── workspace_src.CloudControllerService.html
│   │   │   ├── workspace_src.CloudService.html
│   │   │   ├── workspace_src.CloudStorage.html
│   │   │   ├── workspace_src.CollaborationService.html
│   │   │   ├── workspace_src.CollaborationStorage.html
│   │   │   ├── workspace_src.DecisionService.html
│   │   │   ├── workspace_src.DecisionStorage.html
│   │   │   ├── workspace_src.DesktopService.html
│   │   │   ├── workspace_src.EngineeringMemory.html
│   │   │   ├── workspace_src.EnterpriseService.html
│   │   │   ├── workspace_src.EnterpriseStorage.html
│   │   │   ├── workspace_src.ExecutionEngine.html
│   │   │   ├── workspace_src.ExecutionPlanner.html
│   │   │   ├── workspace_src.ExplainService.html
│   │   │   ├── workspace_src.HelpService.html
│   │   │   ├── workspace_src.ImpactStorage.html
│   │   │   ├── workspace_src.ImplementationService.html
│   │   │   ├── workspace_src.KernelService.html
│   │   │   ├── workspace_src.KnowledgeGraphStorage.html
│   │   │   ├── workspace_src.MemoryService.html
│   │   │   ├── workspace_src.MilestoneService.html
│   │   │   ├── workspace_src.MonitorService.html
│   │   │   ├── workspace_src.OrganizationService.html
│   │   │   ├── workspace_src.OrganizationStorage.html
│   │   │   ├── workspace_src.OSSystemService.html
│   │   │   ├── workspace_src.PlanningService.html
│   │   │   ├── workspace_src.PlanStorage.html
│   │   │   ├── workspace_src.PluginRegistry.html
│   │   │   ├── workspace_src.PluginRuntime.html
│   │   │   ├── workspace_src.PluginRuntimeService.html
│   │   │   ├── workspace_src.PredictionService.html
│   │   │   ├── workspace_src.PreferenceService.html
│   │   │   ├── workspace_src.ProjectService.html
│   │   │   ├── workspace_src.ProjectStorage.html
│   │   │   ├── workspace_src.RepositoryIntelligence.html
│   │   │   ├── workspace_src.RepositoryPresenter.html
│   │   │   ├── workspace_src.SessionOrchestrator.html
│   │   │   ├── workspace_src.SessionService.html
│   │   │   ├── workspace_src.SessionStorage.html
│   │   │   ├── workspace_src.SuggestionService.html
│   │   │   ├── workspace_src.SuggestionStorage.html
│   │   │   ├── workspace_src.VerificationService.html
│   │   │   ├── workspace_src.VerificationStorage.html
│   │   │   ├── workspace_src.WorkflowService.html
│   │   │   ├── workspace_src.WorkspaceAnalyst.html
│   │   │   ├── workspace_src.WorkspaceManagerService.html
│   │   │   ├── workspace_src.WorkspaceManifest.html
│   │   │   ├── workspace_src.WorkspacePersistence.html
│   │   │   ├── workspace_src.WorkspaceRuntime.html
│   │   │   └── workspace_src.WorkspaceSession.html
│   │   ├── functions
│   │   │   ├── events-server_src.registerActivityService.html
│   │   │   ├── events-server_src.registerSession.html
│   │   │   ├── events-server_src.startServer.html
│   │   │   ├── events-server_src.subscribeToEventBus.html
│   │   │   ├── events_src.categorizeEvent.html
│   │   │   ├── os-controller_src.createDefaultManifest.html
│   │   │   ├── os-controller_src.generateSystemdUnits.html
│   │   │   ├── os-controller_src.generateTarget.html
│   │   │   ├── os-controller_src.getServicesByLayer.html
│   │   │   ├── os-controller_src.getServiceStatus.html
│   │   │   ├── os-controller_src.renderManifest.html
│   │   │   ├── os-controller_src.renderServiceStatus.html
│   │   │   ├── tools_filesystem_src.createReadFileTool.html
│   │   │   ├── tools_filesystem_src.createWriteFileTool.html
│   │   │   ├── workspace_src.collectSystemState.html
│   │   │   ├── workspace_src.createFingerprint.html
│   │   │   └── workspace_src.renderSystemState.html
│   │   ├── hierarchy.html
│   │   ├── index.html
│   │   ├── interfaces
│   │   │   ├── action_src.ActionContext.html
│   │   │   ├── action_src.ActionRuntime.html
│   │   │   ├── action_src.Tool.html
│   │   │   ├── cognitive_src.CognitiveEngine.html
│   │   │   ├── cognitive_src.MemoryExtraction.html
│   │   │   ├── cognitive_src.ObservationEngine.html
│   │   │   ├── cognitive_src.Observation.html
│   │   │   ├── cognitive_src.ProcessingResult.html
│   │   │   ├── cognitive_src.UnderstandingEngine.html
│   │   │   ├── cognitive_src.UnderstandingResult.html
│   │   │   ├── configuration_src.ConfigurationProvider.html
│   │   │   ├── context_src.ContextAssembler.html
│   │   │   ├── context_src.ContextOptions.html
│   │   │   ├── conversation_src.ConversationService.html
│   │   │   ├── conversation_src.ProviderExecutor.html
│   │   │   ├── conversation_src.SendOptions.html
│   │   │   ├── conversation_src.SendResult.html
│   │   │   ├── event-bus_src.EventBus.html
│   │   │   ├── event-bus_src.EventBusMetrics.html
│   │   │   ├── event-bus_src.SubscribeOptions.html
│   │   │   ├── events_src.WorkspaceEventActor.html
│   │   │   ├── events_src.WorkspaceEvent.html
│   │   │   ├── events_src.WorkspaceEventResource.html
│   │   │   ├── events_src.WsClientMessage.html
│   │   │   ├── events_src.WsServerMessage.html
│   │   │   ├── health_src.HealthCheckResult.html
│   │   │   ├── health_src.HealthCheckSummary.html
│   │   │   ├── health_src.HealthManager.html
│   │   │   ├── health_src.OverallHealth.html
│   │   │   ├── kernel_src.BootOptions.html
│   │   │   ├── kernel_src.VestaraKernel.html
│   │   │   ├── knowledge_src.ChunkEngine.html
│   │   │   ├── knowledge_src.DocumentParser.html
│   │   │   ├── knowledge_src.IndexReport.html
│   │   │   ├── knowledge_src.KnowledgeChunk.html
│   │   │   ├── knowledge_src.KnowledgeDocument.html
│   │   │   ├── knowledge_src.KnowledgeEngine.html
│   │   │   ├── knowledge_src.KnowledgeIndexer.html
│   │   │   ├── knowledge_src.ProjectInfo.html
│   │   │   ├── knowledge_src.RepositoryAnalyzer.html
│   │   │   ├── knowledge_src.SearchResult.html
│   │   │   ├── logger_src.Logger.html
│   │   │   ├── logger_src.LogSink.html
│   │   │   ├── memory_src.ConsolidationReport.html
│   │   │   ├── memory_src.Memory.html
│   │   │   ├── memory_src.MemoryInput.html
│   │   │   ├── memory_src.MemoryRuntime.html
│   │   │   ├── memory_src.MemorySearchResult.html
│   │   │   ├── memory_src.MemoryStats.html
│   │   │   ├── metrics_src.MetricsCollector.html
│   │   │   ├── os-controller_src.AIOSManifest.html
│   │   │   ├── os-controller_src.AIOSServiceDef.html
│   │   │   ├── os-controller_src.ServiceStatus.html
│   │   │   ├── permission_src.PermissionContext.html
│   │   │   ├── permission_src.PermissionDecision.html
│   │   │   ├── permission_src.PermissionEngine.html
│   │   │   ├── provider-runtime_src.ProviderInfo.html
│   │   │   ├── provider-runtime_src.ProviderManager.html
│   │   │   ├── reasoning_src.ProviderExecutor.html
│   │   │   ├── reasoning_src.ReasoningContext.html
│   │   │   ├── reasoning_src.ReasoningMetrics.html
│   │   │   ├── reasoning_src.ReasoningResult.html
│   │   │   ├── reasoning_src.ReasoningRuntime.html
│   │   │   ├── reasoning_src.ReasoningStrategy.html
│   │   │   ├── reasoning_src.StrategySelector.html
│   │   │   ├── service-registry_src.DependencyGraph.html
│   │   │   ├── service-registry_src.ServiceEntry.html
│   │   │   ├── service-registry_src.ServiceRegistry.html
│   │   │   ├── shared_src.ActionExecution.html
│   │   │   ├── shared_src.ActionRequest.html
│   │   │   ├── shared_src.ActiveRoute.html
│   │   │   ├── shared_src.AIModel.html
│   │   │   ├── shared_src.AIProvider.html
│   │   │   ├── shared_src.AudioConfig.html
│   │   │   ├── shared_src.AudioPipelineStatus.html
│   │   │   ├── shared_src.AudioTimelineEntry.html
│   │   │   ├── shared_src.BootError.html
│   │   │   ├── shared_src.BootReport.html
│   │   │   ├── shared_src.ChunkMetadata.html
│   │   │   ├── shared_src.CompletionRequest.html
│   │   │   ├── shared_src.CompletionResponse.html
│   │   │   ├── shared_src.ConfigSource.html
│   │   │   ├── shared_src.ConversationEngine.html
│   │   │   ├── shared_src.Conversation.html
│   │   │   ├── shared_src.ConversationProvider.html
│   │   │   ├── shared_src.ConversationRequest.html
│   │   │   ├── shared_src.ConversationResponse.html
│   │   │   ├── shared_src.ConversationSession.html
│   │   │   ├── shared_src.ConversationSummary.html
│   │   │   ├── shared_src.HealthDependency.html
│   │   │   ├── shared_src.HealthStatus.html
│   │   │   ├── shared_src.HistogramSummary.html
│   │   │   ├── shared_src.IntentModelMap.html
│   │   │   ├── shared_src.LifecycleEvent.html
│   │   │   ├── shared_src.LogEntry.html
│   │   │   ├── shared_src.Message.html
│   │   │   ├── shared_src.MetricDefinition.html
│   │   │   ├── shared_src.MetricSnapshot.html
│   │   │   ├── shared_src.ModelInfo.html
│   │   │   ├── shared_src.OnboardingState.html
│   │   │   ├── shared_src.ProviderCapabilities.html
│   │   │   ├── shared_src.ProviderHealth.html
│   │   │   ├── shared_src.ProviderHealthStatus.html
│   │   │   ├── shared_src.ProviderRouterStatus.html
│   │   │   ├── shared_src.ResourceDiagnosis.html
│   │   │   ├── shared_src.ServiceDiagnosis.html
│   │   │   ├── shared_src.ServiceInfo.html
│   │   │   ├── shared_src.ServiceRegistryEvent.html
│   │   │   ├── shared_src.StreamChunk.html
│   │   │   ├── shared_src.StreamEvent.html
│   │   │   ├── shared_src.STTProvider.html
│   │   │   ├── shared_src.SystemDiagnosis.html
│   │   │   ├── shared_src.ToolDefinition.html
│   │   │   ├── shared_src.ToolResult.html
│   │   │   ├── shared_src.TTSProvider.html
│   │   │   ├── shared_src.UserProfile.html
│   │   │   ├── shared_src.VADConfig.html
│   │   │   ├── shared_src.VADProvider.html
│   │   │   ├── shared_src.VestaraEvent.html
│   │   │   ├── shared_src.VestaraService.html
│   │   │   ├── state-runtime_src.ConversationStore.html
│   │   │   ├── state-runtime_src.SettingsStore.html
│   │   │   ├── state-runtime_src.StateRuntime.html
│   │   │   ├── stream_src.ChunkOptions.html
│   │   │   ├── stream_src.StreamOptions.html
│   │   │   ├── stream_src.StreamProcessor.html
│   │   │   ├── workspace_src.AgentDefinition.html
│   │   │   ├── workspace_src.AgentExecution.html
│   │   │   ├── workspace_src.AgentPermission.html
│   │   │   ├── workspace_src.AgentTeam.html
│   │   │   ├── workspace_src.AgentWorkflow.html
│   │   │   ├── workspace_src.Approval.html
│   │   │   ├── workspace_src.ChangeSet.html
│   │   │   ├── workspace_src.CollaborationComment.html
│   │   │   ├── workspace_src.CollaborationRecord.html
│   │   │   ├── workspace_src.DependencyEdge.html
│   │   │   ├── workspace_src.DependencyGraph.html
│   │   │   ├── workspace_src.DetectedRisk.html
│   │   │   ├── workspace_src.DiscoveryResult.html
│   │   │   ├── workspace_src.EngineeringSession.html
│   │   │   ├── workspace_src.EntryPoint.html
│   │   │   ├── workspace_src.FileChange.html
│   │   │   ├── workspace_src.HealthCheckResult.html
│   │   │   ├── workspace_src.KnowledgeNode.html
│   │   │   ├── workspace_src.KnowledgeRelation.html
│   │   │   ├── workspace_src.LayerAssignment.html
│   │   │   ├── workspace_src.Milestone.html
│   │   │   ├── workspace_src.OpenResult.html
│   │   │   ├── workspace_src.Ownership.html
│   │   │   ├── workspace_src.PackageNode.html
│   │   │   ├── workspace_src.Plan.html
│   │   │   ├── workspace_src.PresentedSummary.html
│   │   │   ├── workspace_src.Project.html
│   │   │   ├── workspace_src.ProjectTask.html
│   │   │   ├── workspace_src.RepositoryFingerprint.html
│   │   │   ├── workspace_src.RepositoryProfile.html
│   │   │   ├── workspace_src.RepositoryWorkspace.html
│   │   │   ├── workspace_src.ServiceContract.html
│   │   │   ├── workspace_src.SessionParticipant.html
│   │   │   ├── workspace_src.Sprint.html
│   │   │   ├── workspace_src.SystemState.html
│   │   │   ├── workspace_src.Task.html
│   │   │   ├── workspace_src.VerificationCheck.html
│   │   │   ├── workspace_src.VerificationReport.html
│   │   │   ├── workspace_src.WorkerConfig.html
│   │   │   ├── workspace_src.WorkerEvent.html
│   │   │   ├── workspace_src.WorkflowInstance.html
│   │   │   ├── workspace_src.WorkflowStepDef.html
│   │   │   ├── workspace_src.WorkflowStep.html
│   │   │   ├── workspace_src.WorkflowStepResult.html
│   │   │   └── workspace_src.WorkspaceEvent.html
│   │   ├── modules
│   │   │   ├── action_src.html
│   │   │   ├── cognitive_src.html
│   │   │   ├── configuration_src.html
│   │   │   ├── context_src.html
│   │   │   ├── conversation_src.html
│   │   │   ├── event-bus_src.html
│   │   │   ├── events-server_src.html
│   │   │   ├── events_src.html
│   │   │   ├── health_src.html
│   │   │   ├── kernel_src.html
│   │   │   ├── knowledge_src.html
│   │   │   ├── logger_src.html
│   │   │   ├── memory_src.html
│   │   │   ├── metrics_src.html
│   │   │   ├── os-controller_src.html
│   │   │   ├── permission_src.html
│   │   │   ├── provider-runtime_src.html
│   │   │   ├── providers_opencode_src.html
│   │   │   ├── reasoning_src.html
│   │   │   ├── service-registry_src.html
│   │   │   ├── shared_src.html
│   │   │   ├── state-runtime_src.html
│   │   │   ├── stream_src.html
│   │   │   ├── tools_filesystem_src.html
│   │   │   └── workspace_src.html
│   │   ├── .nojekyll
│   │   ├── PACKAGE_CATALOG.md
│   │   ├── types
│   │   │   ├── cognitive_src.ObservationSource.html
│   │   │   ├── event-bus_src.EmitEvent.html
│   │   │   ├── events_src.EventCategory.html
│   │   │   ├── events_src.WorkspaceEventActorType.html
│   │   │   ├── events_src.WorkspaceEventChannel.html
│   │   │   ├── events_src.WorkspaceEventType.html
│   │   │   ├── memory_src.MemoryLayer.html
│   │   │   ├── memory_src.MemoryType.html
│   │   │   ├── reasoning_src.ReasoningStrategyId.html
│   │   │   ├── shared_src.ActionStatus.html
│   │   │   ├── shared_src.ChunkType.html
│   │   │   ├── shared_src.ConfigChangeHandler.html
│   │   │   ├── shared_src.ConversationIntent.html
│   │   │   ├── shared_src.ConversationStatus.html
│   │   │   ├── shared_src.EventHandler.html
│   │   │   ├── shared_src.KernelStatus.html
│   │   │   ├── shared_src.LogLevel.html
│   │   │   ├── shared_src.MessageRole.html
│   │   │   ├── shared_src.MetricType.html
│   │   │   ├── shared_src.OnboardingStage.html
│   │   │   ├── shared_src.PermissionLevel.html
│   │   │   ├── shared_src.ProviderRouteSource.html
│   │   │   ├── shared_src.ProviderStatus.html
│   │   │   ├── shared_src.ServiceRegistryEventType.html
│   │   │   ├── shared_src.ServiceStatus.html
│   │   │   ├── shared_src.Unsubscribe.html
│   │   │   ├── shared_src.UserProfileUpdate.html
│   │   │   ├── shared_src.VADState.html
│   │   │   ├── workspace_src.AgentCapability.html
│   │   │   ├── workspace_src.AgentExecutionStatus.html
│   │   │   ├── workspace_src.AgentRole.html
│   │   │   ├── workspace_src.ChangeSetStatus.html
│   │   │   ├── workspace_src.FileChangeStatus.html
│   │   │   ├── workspace_src.KnowledgeNodeType.html
│   │   │   ├── workspace_src.KnowledgeRelationType.html
│   │   │   ├── workspace_src.Layer.html
│   │   │   ├── workspace_src.MilestoneStatus.html
│   │   │   ├── workspace_src.PlanStatus.html
│   │   │   ├── workspace_src.ProjectStatus.html
│   │   │   ├── workspace_src.ProjectTaskPriority.html
│   │   │   ├── workspace_src.ProjectTaskStatus.html
│   │   │   ├── workspace_src.ReviewStatus.html
│   │   │   ├── workspace_src.RiskCategory.html
│   │   │   ├── workspace_src.ServiceStatus.html
│   │   │   ├── workspace_src.SessionStatus.html
│   │   │   ├── workspace_src.SprintStatus.html
│   │   │   ├── workspace_src.TaskStatus.html
│   │   │   ├── workspace_src.VerificationStatus.html
│   │   │   ├── workspace_src.VerificationType.html
│   │   │   ├── workspace_src.WorkerType.html
│   │   │   └── workspace_src.WorkspaceStatus.html
│   │   └── variables
│   │       ├── events_src.DOMAIN_EVENT_CATEGORIES.html
│   │       ├── events_src.WORKSPACE_EVENT_CHANNELS.html
│   │       ├── tools_filesystem_src.filesystemToolDefinitions.html
│   │       └── workspace_src.WORKFLOWS.html
│   ├── ARCHITECTURE_TRACEABILITY.md
│   ├── ARTIFACT-CATALOG.md
│   ├── artifacts
│   │   ├── ChangeSet.md
│   │   ├── CollaborationRecord.md
│   │   ├── Decision.md
│   │   ├── ImpactAssessment.md
│   │   ├── Plan.md
│   │   ├── RepositoryWorkspace.md
│   │   └── VerificationReport.md
│   ├── ATS-002-explain.md
│   ├── ATS-010-workspace-ui.md
│   ├── ATS-011-conversational-onboarding.md
│   ├── ATS-012-conversation-platform-validation.md
│   ├── capabilities
│   │   ├── CSP-001-open
│   │   │   ├── ATS.md
│   │   │   ├── CLI.md
│   │   │   ├── DATA-MODEL.md
│   │   │   ├── PCS.md
│   │   │   └── README.md
│   │   ├── CSP-002-explain
│   │   │   ├── DATA-MODEL.md
│   │   │   ├── PCS.md
│   │   │   └── README.md
│   │   ├── CSP-003-plan
│   │   │   ├── ATS.md
│   │   │   ├── CLI.md
│   │   │   └── README.md
│   │   ├── CSP-004-implement
│   │   │   ├── ATS.md
│   │   │   ├── CLI.md
│   │   │   └── README.md
│   │   ├── CSP-005-verify
│   │   │   └── README.md
│   │   ├── CSP-006-collaborate
│   │   │   ├── ATS.md
│   │   │   ├── CLI.md
│   │   │   └── README.md
│   │   ├── CSP-007-agent-runtime
│   │   │   └── README.md
│   │   ├── CSP-008-memory
│   │   │   └── README.md
│   │   ├── CSP-009-engineering-session
│   │   │   └── README.md
│   │   ├── CSP-010-workspace-ui
│   │   │   └── README.md
│   │   ├── CSP-011-agent-execution
│   │   │   └── README.md
│   │   ├── CSP-012-multi-repository
│   │   │   └── README.md
│   │   ├── CSP-013-enterprise
│   │   │   └── README.md
│   │   ├── CSP-014-plugin-ecosystem
│   │   │   └── README.md
│   │   ├── CSP-015-cloud-execution
│   │   │   └── README.md
│   │   ├── CSP-016-os-integration
│   │   │   └── README.md
│   │   ├── CSP-017-verify
│   │   │   ├── 14-checklist.md
│   │   │   ├── ARCHITECTURE.md
│   │   │   ├── ATS.md
│   │   │   ├── CLI.md
│   │   │   ├── DATA-MODEL.md
│   │   │   ├── PCS.md
│   │   │   └── README.md
│   │   ├── CSP-018-predictive-engineering
│   │   │   └── README.md
│   │   └── CSP-019-decision-intelligence
│   │       └── README.md
│   ├── CAPABILITY-REGISTRY.md
│   ├── CHANGELOG.md
│   ├── CONTRACT-CATALOG.md
│   ├── CONTRACT-ENTERPRISE.md
│   ├── DECISIONS.md
│   ├── DEFINITION_OF_LIVING.md
│   ├── IMPLEMENTATION_STATUS.md
│   ├── MILESTONES.md
│   ├── OPERATIONAL-PRINCIPLES.md
│   ├── PCS-001-repository-comprehension.md
│   ├── PCS-002-explain.md
│   ├── PCS-003-plan.md
│   ├── PCS-004-implement.md
│   ├── PCS-005-verify.md
│   ├── PCS-006-collaboration.md
│   ├── PCS-007-agent-runtime.md
│   ├── PCS-008-memory.md
│   ├── PCS-009-engineering-session.md
│   ├── PCS-010-workspace-ui.md
│   ├── PCS-011-agent-execution.md
│   ├── PCS-012-multi-repository.md
│   ├── PCS-013-enterprise.md
│   ├── PCS-014-plugin-ecosystem.md
│   ├── PCS-015-cloud-execution.md
│   ├── PCS-016-os-integration.md
│   ├── PCS-017-execution-engine.md
│   ├── PCS-018-predictive-engineering.md
│   ├── PCS-019-decision-intelligence.md
│   ├── PCS-020-conversational-onboarding.md
│   ├── PCS-021-agent-scheduling.md
│   ├── PCS-022-conversation-platform-validation.md
│   ├── PCS-023-theme-system.md
│   ├── PERFORMANCE_BASELINES.md
│   ├── PRODUCT-PRINCIPLES.md
│   ├── ROADMAP-GOVERNANCE.md
│   ├── standards
│   │   └── VSDE.md
│   ├── UX-002-explain.md
│   ├── UX-010-workspace-ui.md
│   ├── UX-011-conversational-onboarding.md
│   ├── UX-012-conversation-platform-validation.md
│   └── VSDE
│       ├── README.md
│       ├── VSDE-001-lifecycle.md
│       ├── VSDE-002-capability-package.md
│       ├── VSDE-003-artifact-contracts.md
│       ├── VSDE-004-review-gates.md
│       ├── VSDE-005-ci-pipeline.md
│       └── VSDE-006-capability-states.md
├── .github
│   ├── ISSUE_TEMPLATE
│   │   ├── bug-report.md
│   │   └── feature-request.md
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── workflows
│       └── ci.yml
├── .gitignore
├── package.json
├── packages
│   ├── action
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── src
│   │   │   ├── index.d.ts
│   │   │   ├── index.js
│   │   │   ├── index.js.map
│   │   │   └── index.ts
│   │   ├── __tests__
│   │   │   ├── index.test.d.ts
│   │   │   ├── index.test.js
│   │   │   ├── index.test.js.map
│   │   │   └── index.test.ts
│   │   └── tsconfig.json
│   ├── activity-log
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── src
│   │   │   ├── index.d.ts
│   │   │   ├── index.js
│   │   │   ├── index.js.map
│   │   │   ├── index.ts
│   │   │   ├── service.d.ts
│   │   │   ├── service.js
│   │   │   ├── service.js.map
│   │   │   ├── service.ts
│   │   │   ├── sql.d.ts
│   │   │   ├── store.d.ts
│   │   │   ├── store.js
│   │   │   ├── store.js.map
│   │   │   └── store.ts
│   │   ├── __tests__
│   │   │   ├── index.test.d.ts
│   │   │   ├── index.test.js
│   │   │   ├── index.test.js.map
│   │   │   └── index.test.ts
│   │   └── tsconfig.json
│   ├── audio
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── src
│   │   │   ├── index.d.ts
│   │   │   ├── index.js
│   │   │   ├── index.js.map
│   │   │   └── index.ts
│   │   ├── __tests__
│   │   │   ├── index.test.d.ts
│   │   │   ├── index.test.js
│   │   │   ├── index.test.js.map
│   │   │   └── index.test.ts
│   │   └── tsconfig.json
│   ├── cognitive
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── src
│   │   │   ├── index.d.ts
│   │   │   ├── index.js
│   │   │   ├── index.js.map
│   │   │   └── index.ts
│   │   ├── __tests__
│   │   │   ├── index.test.d.ts
│   │   │   ├── index.test.js
│   │   │   ├── index.test.js.map
│   │   │   └── index.test.ts
│   │   └── tsconfig.json
│   ├── configuration
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── src
│   │   │   ├── index.d.ts
│   │   │   ├── index.js
│   │   │   ├── index.js.map
│   │   │   └── index.ts
│   │   ├── test
│   │   ├── __tests__
│   │   │   ├── index.test.d.ts
│   │   │   ├── index.test.js
│   │   │   ├── index.test.js.map
│   │   │   └── index.test.ts
│   │   └── tsconfig.json
│   ├── context
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── src
│   │   │   ├── index.d.ts
│   │   │   ├── index.js
│   │   │   ├── index.js.map
│   │   │   └── index.ts
│   │   ├── __tests__
│   │   │   ├── index.test.d.ts
│   │   │   ├── index.test.js
│   │   │   ├── index.test.js.map
│   │   │   └── index.test.ts
│   │   └── tsconfig.json
│   ├── conversation
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── src
│   │   │   ├── index.d.ts
│   │   │   ├── index.js
│   │   │   ├── index.js.map
│   │   │   └── index.ts
│   │   ├── __tests__
│   │   │   ├── index.test.d.ts
│   │   │   ├── index.test.js
│   │   │   ├── index.test.js.map
│   │   │   └── index.test.ts
│   │   └── tsconfig.json
│   ├── conversation-runtime
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── src
│   │   │   ├── audit
│   │   │   │   ├── cli.d.ts
│   │   │   │   ├── cli.js
│   │   │   │   ├── cli.js.map
│   │   │   │   ├── cli.ts
│   │   │   │   ├── scanner.d.ts
│   │   │   │   ├── scanner.js
│   │   │   │   ├── scanner.js.map
│   │   │   │   └── scanner.ts
│   │   │   ├── index.d.ts
│   │   │   ├── index.js
│   │   │   ├── index.js.map
│   │   │   ├── index.ts
│   │   │   ├── provider
│   │   │   │   ├── factory.d.ts
│   │   │   │   ├── factory.js
│   │   │   │   ├── factory.js.map
│   │   │   │   ├── factory.ts
│   │   │   │   ├── gemini.d.ts
│   │   │   │   ├── gemini.js
│   │   │   │   ├── gemini.js.map
│   │   │   │   ├── gemini.ts
│   │   │   │   ├── index.d.ts
│   │   │   │   ├── index.js
│   │   │   │   ├── index.js.map
│   │   │   │   ├── index.ts
│   │   │   │   ├── local.d.ts
│   │   │   │   ├── local.js
│   │   │   │   ├── local.js.map
│   │   │   │   ├── local.ts
│   │   │   │   ├── ollama.d.ts
│   │   │   │   ├── ollama.js
│   │   │   │   ├── ollama.js.map
│   │   │   │   ├── ollama.ts
│   │   │   │   ├── openai-compat.d.ts
│   │   │   │   ├── openai-compat.js
│   │   │   │   ├── openai-compat.js.map
│   │   │   │   ├── openai-compat.ts
│   │   │   │   ├── opencode-adapter.d.ts
│   │   │   │   ├── opencode-adapter.js
│   │   │   │   ├── opencode-adapter.js.map
│   │   │   │   ├── opencode-adapter.ts
│   │   │   │   ├── opencode.d.ts
│   │   │   │   ├── opencode.js
│   │   │   │   ├── opencode.js.map
│   │   │   │   ├── opencode.ts
│   │   │   │   ├── router.d.ts
│   │   │   │   ├── router.js
│   │   │   │   ├── router.js.map
│   │   │   │   └── router.ts
│   │   │   ├── session-store.d.ts
│   │   │   ├── session-store.js
│   │   │   ├── session-store.js.map
│   │   │   ├── session-store.ts
│   │   │   ├── sql.d.ts
│   │   │   ├── user-profile-store.d.ts
│   │   │   ├── user-profile-store.js
│   │   │   ├── user-profile-store.js.map
│   │   │   └── user-profile-store.ts
│   │   ├── __tests__
│   │   │   ├── index.test.d.ts
│   │   │   ├── index.test.js
│   │   │   ├── index.test.js.map
│   │   │   ├── index.test.ts
│   │   │   ├── provider-independence.test.d.ts
│   │   │   ├── provider-independence.test.js
│   │   │   ├── provider-independence.test.js.map
│   │   │   └── provider-independence.test.ts
│   │   └── tsconfig.json
│   ├── event-bus
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── src
│   │   │   ├── index.d.ts
│   │   │   ├── index.js
│   │   │   ├── index.js.map
│   │   │   └── index.ts
│   │   ├── test
│   │   ├── __tests__
│   │   │   ├── index.test.d.ts
│   │   │   ├── index.test.js
│   │   │   ├── index.test.js.map
│   │   │   └── index.test.ts
│   │   └── tsconfig.json
│   ├── events
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── src
│   │   │   ├── index.d.ts
│   │   │   ├── index.js
│   │   │   ├── index.js.map
│   │   │   └── index.ts
│   │   ├── __tests__
│   │   │   ├── index.test.d.ts
│   │   │   ├── index.test.js
│   │   │   ├── index.test.js.map
│   │   │   └── index.test.ts
│   │   └── tsconfig.json
│   ├── events-server
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── src
│   │   │   ├── index.d.ts
│   │   │   ├── index.js
│   │   │   ├── index.js.map
│   │   │   └── index.ts
│   │   ├── __tests__
│   │   │   ├── index.test.d.ts
│   │   │   ├── index.test.js
│   │   │   ├── index.test.js.map
│   │   │   └── index.test.ts
│   │   └── tsconfig.json
│   ├── health
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── src
│   │   │   ├── index.d.ts
│   │   │   ├── index.js
│   │   │   ├── index.js.map
│   │   │   └── index.ts
│   │   ├── test
│   │   ├── __tests__
│   │   │   ├── index.test.d.ts
│   │   │   ├── index.test.js
│   │   │   ├── index.test.js.map
│   │   │   └── index.test.ts
│   │   └── tsconfig.json
│   ├── kernel
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── src
│   │   │   ├── index.d.ts
│   │   │   ├── index.js
│   │   │   ├── index.js.map
│   │   │   └── index.ts
│   │   ├── test
│   │   ├── __tests__
│   │   │   ├── index.test.d.ts
│   │   │   ├── index.test.js
│   │   │   ├── index.test.js.map
│   │   │   └── index.test.ts
│   │   └── tsconfig.json
│   ├── knowledge
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── src
│   │   │   ├── chunk
│   │   │   ├── embeddings
│   │   │   ├── engine
│   │   │   ├── fs
│   │   │   ├── index.d.ts
│   │   │   ├── indexer
│   │   │   ├── index.js
│   │   │   ├── index.js.map
│   │   │   ├── index.ts
│   │   │   ├── parser
│   │   │   ├── rag
│   │   │   ├── search
│   │   │   ├── sql.d.ts
│   │   │   └── storage
│   │   ├── test
│   │   ├── __tests__
│   │   │   ├── index.test.d.ts
│   │   │   ├── index.test.js
│   │   │   ├── index.test.js.map
│   │   │   └── index.test.ts
│   │   └── tsconfig.json
│   ├── logger
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── src
│   │   │   ├── index.d.ts
│   │   │   ├── index.js
│   │   │   ├── index.js.map
│   │   │   └── index.ts
│   │   ├── test
│   │   ├── __tests__
│   │   │   ├── index.test.d.ts
│   │   │   ├── index.test.js
│   │   │   ├── index.test.js.map
│   │   │   └── index.test.ts
│   │   └── tsconfig.json
│   ├── memory
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── src
│   │   │   ├── index.d.ts
│   │   │   ├── index.js
│   │   │   ├── index.js.map
│   │   │   ├── index.ts
│   │   │   └── sql.d.ts
│   │   ├── __tests__
│   │   │   ├── index.test.d.ts
│   │   │   ├── index.test.js
│   │   │   ├── index.test.js.map
│   │   │   └── index.test.ts
│   │   └── tsconfig.json
│   ├── metrics
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── src
│   │   │   ├── index.d.ts
│   │   │   ├── index.js
│   │   │   ├── index.js.map
│   │   │   └── index.ts
│   │   ├── test
│   │   ├── __tests__
│   │   │   ├── index.test.d.ts
│   │   │   ├── index.test.js
│   │   │   ├── index.test.js.map
│   │   │   └── index.test.ts
│   │   └── tsconfig.json
│   ├── os-controller
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── src
│   │   │   ├── index.d.ts
│   │   │   ├── index.js
│   │   │   ├── index.js.map
│   │   │   ├── index.ts
│   │   │   ├── lifecycle.d.ts
│   │   │   ├── lifecycle.js
│   │   │   ├── lifecycle.js.map
│   │   │   ├── lifecycle.ts
│   │   │   ├── manifest.d.ts
│   │   │   ├── manifest.js
│   │   │   ├── manifest.js.map
│   │   │   └── manifest.ts
│   │   ├── systemd
│   │   ├── __tests__
│   │   │   ├── index.test.d.ts
│   │   │   ├── index.test.js
│   │   │   ├── index.test.js.map
│   │   │   ├── index.test.ts
│   │   │   ├── lifecycle.test.d.ts
│   │   │   ├── lifecycle.test.js
│   │   │   ├── lifecycle.test.js.map
│   │   │   ├── lifecycle.test.ts
│   │   │   ├── manifest.test.d.ts
│   │   │   ├── manifest.test.js
│   │   │   ├── manifest.test.js.map
│   │   │   └── manifest.test.ts
│   │   └── tsconfig.json
│   ├── permission
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── src
│   │   │   ├── index.d.ts
│   │   │   ├── index.js
│   │   │   ├── index.js.map
│   │   │   └── index.ts
│   │   ├── __tests__
│   │   │   ├── index.test.d.ts
│   │   │   ├── index.test.js
│   │   │   ├── index.test.js.map
│   │   │   └── index.test.ts
│   │   └── tsconfig.json
│   ├── provider-runtime
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── src
│   │   │   ├── index.d.ts
│   │   │   ├── index.js
│   │   │   ├── index.js.map
│   │   │   └── index.ts
│   │   ├── test
│   │   ├── __tests__
│   │   │   ├── index.test.d.ts
│   │   │   ├── index.test.js
│   │   │   ├── index.test.js.map
│   │   │   └── index.test.ts
│   │   └── tsconfig.json
│   ├── providers
│   │   └── opencode
│   │       ├── package.json
│   │       ├── README.md
│   │       ├── src
│   │       │   ├── index.d.ts
│   │       │   ├── index.js
│   │       │   ├── index.js.map
│   │       │   └── index.ts
│   │       ├── __tests__
│   │       │   ├── index.test.d.ts
│   │       │   ├── index.test.js
│   │       │   ├── index.test.js.map
│   │       │   └── index.test.ts
│   │       └── tsconfig.json
│   ├── reasoning
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── src
│   │   │   ├── index.d.ts
│   │   │   ├── index.js
│   │   │   ├── index.js.map
│   │   │   └── index.ts
│   │   ├── __tests__
│   │   │   ├── index.test.d.ts
│   │   │   ├── index.test.js
│   │   │   ├── index.test.js.map
│   │   │   └── index.test.ts
│   │   └── tsconfig.json
│   ├── service-registry
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── src
│   │   │   ├── index.d.ts
│   │   │   ├── index.js
│   │   │   ├── index.js.map
│   │   │   └── index.ts
│   │   ├── test
│   │   ├── __tests__
│   │   │   ├── index.test.d.ts
│   │   │   ├── index.test.js
│   │   │   ├── index.test.js.map
│   │   │   └── index.test.ts
│   │   └── tsconfig.json
│   ├── shared
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── src
│   │   │   ├── index.d.ts
│   │   │   ├── index.js
│   │   │   ├── index.js.map
│   │   │   └── index.ts
│   │   ├── test
│   │   ├── __tests__
│   │   │   ├── index.test.d.ts
│   │   │   ├── index.test.js
│   │   │   ├── index.test.js.map
│   │   │   └── index.test.ts
│   │   └── tsconfig.json
│   ├── state-runtime
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── src
│   │   │   ├── index.d.ts
│   │   │   ├── index.js
│   │   │   ├── index.js.map
│   │   │   ├── index.ts
│   │   │   └── sql.d.ts
│   │   ├── __tests__
│   │   │   ├── index.test.d.ts
│   │   │   ├── index.test.js
│   │   │   ├── index.test.js.map
│   │   │   └── index.test.ts
│   │   └── tsconfig.json
│   ├── storage
│   ├── stream
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── src
│   │   │   ├── index.d.ts
│   │   │   ├── index.js
│   │   │   ├── index.js.map
│   │   │   └── index.ts
│   │   ├── __tests__
│   │   │   ├── index.test.d.ts
│   │   │   ├── index.test.js
│   │   │   ├── index.test.js.map
│   │   │   └── index.test.ts
│   │   └── tsconfig.json
│   ├── stt
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── src
│   │   │   ├── index.d.ts
│   │   │   ├── index.js
│   │   │   ├── index.js.map
│   │   │   └── index.ts
│   │   ├── __tests__
│   │   │   ├── index.test.d.ts
│   │   │   ├── index.test.js
│   │   │   ├── index.test.js.map
│   │   │   └── index.test.ts
│   │   └── tsconfig.json
│   ├── tool-runtime
│   ├── tools
│   │   ├── filesystem
│   │   │   ├── package.json
│   │   │   ├── README.md
│   │   │   ├── src
│   │   │   │   ├── index.d.ts
│   │   │   │   ├── index.js
│   │   │   │   ├── index.js.map
│   │   │   │   └── index.ts
│   │   │   ├── __tests__
│   │   │   │   ├── index.test.d.ts
│   │   │   │   ├── index.test.js
│   │   │   │   ├── index.test.js.map
│   │   │   │   └── index.test.ts
│   │   │   └── tsconfig.json
│   │   ├── knowledge
│   │   │   ├── package.json
│   │   │   ├── README.md
│   │   │   ├── src
│   │   │   │   ├── index.d.ts
│   │   │   │   ├── index.js
│   │   │   │   ├── index.js.map
│   │   │   │   └── index.ts
│   │   │   ├── __tests__
│   │   │   │   ├── index.test.d.ts
│   │   │   │   ├── index.test.js
│   │   │   │   ├── index.test.js.map
│   │   │   │   └── index.test.ts
│   │   │   └── tsconfig.json
│   │   ├── memory
│   │   │   ├── package.json
│   │   │   ├── README.md
│   │   │   ├── src
│   │   │   │   ├── index.d.ts
│   │   │   │   ├── index.js
│   │   │   │   ├── index.js.map
│   │   │   │   └── index.ts
│   │   │   ├── __tests__
│   │   │   │   ├── index.test.d.ts
│   │   │   │   ├── index.test.js
│   │   │   │   ├── index.test.js.map
│   │   │   │   └── index.test.ts
│   │   │   └── tsconfig.json
│   │   ├── project
│   │   │   ├── package.json
│   │   │   ├── README.md
│   │   │   ├── src
│   │   │   │   ├── index.d.ts
│   │   │   │   ├── index.js
│   │   │   │   ├── index.js.map
│   │   │   │   └── index.ts
│   │   │   ├── __tests__
│   │   │   │   ├── index.test.d.ts
│   │   │   │   ├── index.test.js
│   │   │   │   ├── index.test.js.map
│   │   │   │   └── index.test.ts
│   │   │   └── tsconfig.json
│   │   └── shell
│   │       ├── package.json
│   │       ├── README.md
│   │       ├── src
│   │       │   ├── index.d.ts
│   │       │   ├── index.js
│   │       │   ├── index.js.map
│   │       │   └── index.ts
│   │       ├── __tests__
│   │       │   ├── index.test.d.ts
│   │       │   ├── index.test.js
│   │       │   ├── index.test.js.map
│   │       │   └── index.test.ts
│   │       └── tsconfig.json
│   ├── tts
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── src
│   │   │   ├── index.d.ts
│   │   │   ├── index.js
│   │   │   ├── index.js.map
│   │   │   └── index.ts
│   │   ├── __tests__
│   │   │   ├── index.test.d.ts
│   │   │   ├── index.test.js
│   │   │   ├── index.test.js.map
│   │   │   └── index.test.ts
│   │   └── tsconfig.json
│   └── workspace
│       ├── package.json
│       ├── README.md
│       ├── src
│       │   ├── accuracy-storage.d.ts
│       │   ├── accuracy-storage.js
│       │   ├── accuracy-storage.js.map
│       │   ├── accuracy-storage.ts
│       │   ├── agent-coordinator.d.ts
│       │   ├── agent-coordinator.js
│       │   ├── agent-coordinator.js.map
│       │   ├── agent-coordinator.ts
│       │   ├── agent-permission.d.ts
│       │   ├── agent-permission.js
│       │   ├── agent-permission.js.map
│       │   ├── agent-permission.ts
│       │   ├── agent-runtime.d.ts
│       │   ├── agent-runtime.js
│       │   ├── agent-runtime.js.map
│       │   ├── agent-runtime.ts
│       │   ├── agent-service.d.ts
│       │   ├── agent-service.js
│       │   ├── agent-service.js.map
│       │   ├── agent-service.ts
│       │   ├── agent-storage.d.ts
│       │   ├── agent-storage.js
│       │   ├── agent-storage.js.map
│       │   ├── agent-storage.ts
│       │   ├── agent-worker.d.ts
│       │   ├── agent-worker.js
│       │   ├── agent-worker.js.map
│       │   ├── agent-worker.ts
│       │   ├── agent-workflow-service.d.ts
│       │   ├── agent-workflow-service.js
│       │   ├── agent-workflow-service.js.map
│       │   ├── agent-workflow-service.ts
│       │   ├── analytics-service.d.ts
│       │   ├── analytics-service.js
│       │   ├── analytics-service.js.map
│       │   ├── analytics-service.ts
│       │   ├── auto-index.d.ts
│       │   ├── auto-index.js
│       │   ├── auto-index.js.map
│       │   ├── auto-index.ts
│       │   ├── capability-service.d.ts
│       │   ├── capability-service.js
│       │   ├── capability-service.js.map
│       │   ├── capability-service.ts
│       │   ├── change-set-storage.d.ts
│       │   ├── change-set-storage.js
│       │   ├── change-set-storage.js.map
│       │   ├── change-set-storage.ts
│       │   ├── cloud-service.d.ts
│       │   ├── cloud-service.js
│       │   ├── cloud-service.js.map
│       │   ├── cloud-service.ts
│       │   ├── cloud-storage.d.ts
│       │   ├── cloud-storage.js
│       │   ├── cloud-storage.js.map
│       │   ├── cloud-storage.ts
│       │   ├── collaboration-service.d.ts
│       │   ├── collaboration-service.js
│       │   ├── collaboration-service.js.map
│       │   ├── collaboration-service.ts
│       │   ├── collaboration-storage.d.ts
│       │   ├── collaboration-storage.js
│       │   ├── collaboration-storage.js.map
│       │   ├── collaboration-storage.ts
│       │   ├── decision-service.d.ts
│       │   ├── decision-service.js
│       │   ├── decision-service.js.map
│       │   ├── decision-service.ts
│       │   ├── decision-storage.d.ts
│       │   ├── decision-storage.js
│       │   ├── decision-storage.js.map
│       │   ├── decision-storage.ts
│       │   ├── desktop-service.d.ts
│       │   ├── desktop-service.js
│       │   ├── desktop-service.js.map
│       │   ├── desktop-service.ts
│       │   ├── engineering-memory.d.ts
│       │   ├── engineering-memory.js
│       │   ├── engineering-memory.js.map
│       │   ├── engineering-memory.ts
│       │   ├── enterprise-service.d.ts
│       │   ├── enterprise-service.js
│       │   ├── enterprise-service.js.map
│       │   ├── enterprise-service.ts
│       │   ├── enterprise-storage.d.ts
│       │   ├── enterprise-storage.js
│       │   ├── enterprise-storage.js.map
│       │   ├── enterprise-storage.ts
│       │   ├── execution-engine.d.ts
│       │   ├── execution-engine.js
│       │   ├── execution-engine.js.map
│       │   ├── execution-engine.ts
│       │   ├── execution-planner.d.ts
│       │   ├── execution-planner.js
│       │   ├── execution-planner.js.map
│       │   ├── execution-planner.ts
│       │   ├── explain-service.d.ts
│       │   ├── explain-service.js
│       │   ├── explain-service.js.map
│       │   ├── explain-service.ts
│       │   ├── help-service.d.ts
│       │   ├── help-service.js
│       │   ├── help-service.js.map
│       │   ├── help-service.ts
│       │   ├── impact-storage.d.ts
│       │   ├── impact-storage.js
│       │   ├── impact-storage.js.map
│       │   ├── impact-storage.ts
│       │   ├── implementation-service.d.ts
│       │   ├── implementation-service.js
│       │   ├── implementation-service.js.map
│       │   ├── implementation-service.ts
│       │   ├── index.d.ts
│       │   ├── index.js
│       │   ├── index.js.map
│       │   ├── index.ts
│       │   ├── knowledge-graph-storage.d.ts
│       │   ├── knowledge-graph-storage.js
│       │   ├── knowledge-graph-storage.js.map
│       │   ├── knowledge-graph-storage.ts
│       │   ├── memory-service.d.ts
│       │   ├── memory-service.js
│       │   ├── memory-service.js.map
│       │   ├── memory-service.ts
│       │   ├── milestone-service.d.ts
│       │   ├── milestone-service.js
│       │   ├── milestone-service.js.map
│       │   ├── milestone-service.ts
│       │   ├── monitor-service.d.ts
│       │   ├── monitor-service.js
│       │   ├── monitor-service.js.map
│       │   ├── monitor-service.ts
│       │   ├── organization-service.d.ts
│       │   ├── organization-service.js
│       │   ├── organization-service.js.map
│       │   ├── organization-service.ts
│       │   ├── organization-storage.d.ts
│       │   ├── organization-storage.js
│       │   ├── organization-storage.js.map
│       │   ├── organization-storage.ts
│       │   ├── os-service.d.ts
│       │   ├── os-service.js
│       │   ├── os-service.js.map
│       │   ├── os-service.ts
│       │   ├── planning-service.d.ts
│       │   ├── planning-service.js
│       │   ├── planning-service.js.map
│       │   ├── planning-service.ts
│       │   ├── plan-storage.d.ts
│       │   ├── plan-storage.js
│       │   ├── plan-storage.js.map
│       │   ├── plan-storage.ts
│       │   ├── plugin-registry.d.ts
│       │   ├── plugin-registry.js
│       │   ├── plugin-registry.js.map
│       │   ├── plugin-registry.ts
│       │   ├── plugin-runtime.d.ts
│       │   ├── plugin-runtime.js
│       │   ├── plugin-runtime.js.map
│       │   ├── plugin-runtime.ts
│       │   ├── prediction-service.d.ts
│       │   ├── prediction-service.js
│       │   ├── prediction-service.js.map
│       │   ├── prediction-service.ts
│       │   ├── preference-service.d.ts
│       │   ├── preference-service.js
│       │   ├── preference-service.js.map
│       │   ├── preference-service.ts
│       │   ├── project-service.d.ts
│       │   ├── project-service.js
│       │   ├── project-service.js.map
│       │   ├── project-service.ts
│       │   ├── project-storage.d.ts
│       │   ├── project-storage.js
│       │   ├── project-storage.js.map
│       │   ├── project-storage.ts
│       │   ├── project-types.d.ts
│       │   ├── project-types.js
│       │   ├── project-types.js.map
│       │   ├── project-types.ts
│       │   ├── repository-discovery.d.ts
│       │   ├── repository-discovery.js
│       │   ├── repository-discovery.js.map
│       │   ├── repository-discovery.ts
│       │   ├── repository-fingerprint.d.ts
│       │   ├── repository-fingerprint.js
│       │   ├── repository-fingerprint.js.map
│       │   ├── repository-fingerprint.ts
│       │   ├── repository-intelligence.d.ts
│       │   ├── repository-intelligence.js
│       │   ├── repository-intelligence.js.map
│       │   ├── repository-intelligence.ts
│       │   ├── repository-presenter.d.ts
│       │   ├── repository-presenter.js
│       │   ├── repository-presenter.js.map
│       │   ├── repository-presenter.ts
│       │   ├── service-contract.d.ts
│       │   ├── service-contract.js
│       │   ├── service-contract.js.map
│       │   ├── service-contract.ts
│       │   ├── services.d.ts
│       │   ├── services.js
│       │   ├── services.js.map
│       │   ├── services.ts
│       │   ├── session-orchestrator.d.ts
│       │   ├── session-orchestrator.js
│       │   ├── session-orchestrator.js.map
│       │   ├── session-orchestrator.ts
│       │   ├── session-service.d.ts
│       │   ├── session-service.js
│       │   ├── session-service.js.map
│       │   ├── session-service.ts
│       │   ├── session-storage.d.ts
│       │   ├── session-storage.js
│       │   ├── session-storage.js.map
│       │   ├── session-storage.ts
│       │   ├── suggestion-service.d.ts
│       │   ├── suggestion-service.js
│       │   ├── suggestion-service.js.map
│       │   ├── suggestion-service.ts
│       │   ├── suggestion-storage.d.ts
│       │   ├── suggestion-storage.js
│       │   ├── suggestion-storage.js.map
│       │   ├── suggestion-storage.ts
│       │   ├── system-state.d.ts
│       │   ├── system-state.js
│       │   ├── system-state.js.map
│       │   ├── system-state.ts
│       │   ├── types.d.ts
│       │   ├── types.js
│       │   ├── types.js.map
│       │   ├── types.ts
│       │   ├── verification-service.d.ts
│       │   ├── verification-service.js
│       │   ├── verification-service.js.map
│       │   ├── verification-service.ts
│       │   ├── verification-storage.d.ts
│       │   ├── verification-storage.js
│       │   ├── verification-storage.js.map
│       │   ├── verification-storage.ts
│       │   ├── worker-bootstrap.d.ts
│       │   ├── worker-bootstrap.js
│       │   ├── worker-bootstrap.js.map
│       │   ├── worker-bootstrap.ts
│       │   ├── workflow-service.d.ts
│       │   ├── workflow-service.js
│       │   ├── workflow-service.js.map
│       │   ├── workflow-service.ts
│       │   ├── workspace-analyst.d.ts
│       │   ├── workspace-analyst.js
│       │   ├── workspace-analyst.js.map
│       │   ├── workspace-analyst.ts
│       │   ├── workspace-manifest.d.ts
│       │   ├── workspace-manifest.js
│       │   ├── workspace-manifest.js.map
│       │   ├── workspace-manifest.ts
│       │   ├── workspace-persistence.d.ts
│       │   ├── workspace-persistence.js
│       │   ├── workspace-persistence.js.map
│       │   ├── workspace-persistence.ts
│       │   ├── workspace-runtime.d.ts
│       │   ├── workspace-runtime.js
│       │   ├── workspace-runtime.js.map
│       │   ├── workspace-runtime.ts
│       │   ├── workspace-session.d.ts
│       │   ├── workspace-session.js
│       │   ├── workspace-session.js.map
│       │   ├── workspace-session.ts
│       │   ├── workspace-ui-watcher.d.ts
│       │   ├── workspace-ui-watcher.js
│       │   ├── workspace-ui-watcher.js.map
│       │   └── workspace-ui-watcher.ts
│       └── tsconfig.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── project-tree.txt
├── README.md
├── scripts
│   ├── benchmark-index.sh
│   ├── benchmark.sh
│   ├── ensure-docs.sh
│   ├── generate-docs.sh
│   └── milestone-status.sh
├── SECURITY.md
├── tsconfig.json
├── typedoc.json
├── .vestara
│   ├── knowledge
│   │   └── chunks.db
│   ├── memory
│   ├── plans
│   │   └── plans.db
│   ├── prefs.db
│   ├── sessions
│   │   └── last.session.json
│   └── workspace.json
├── vestara-state.db
└── vitest.config.ts

224 directories, 1461 files

```
