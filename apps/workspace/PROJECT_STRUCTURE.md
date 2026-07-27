```text
.
├── biome.json
├── generate_layout.sh
├── generate_screen_structure.sh
├── .gitignore
├── index.html
├── package.json
├── public
│   ├── favicon.svg
│   └── logo.svg
├── README.md
├── src
│   ├── App.tsx
│   ├── components
│   │   ├── ActionPanel.tsx
│   │   ├── charts
│   │   │   ├── AreaChartCard.tsx
│   │   │   ├── BarChartCard.tsx
│   │   │   ├── index.ts
│   │   │   └── PieChartCard.tsx
│   │   ├── chat
│   │   │   ├── AssistantMessage.tsx
│   │   │   ├── AttachmentPreview.tsx
│   │   │   ├── ChatComposer.tsx
│   │   │   ├── ChatEmptyState.tsx
│   │   │   ├── ChatError.tsx
│   │   │   ├── ChatLayout.tsx
│   │   │   ├── ChatSearch.tsx
│   │   │   ├── ChatSidebar.tsx
│   │   │   ├── CodeBlock.tsx
│   │   │   ├── ConversationHeader.tsx
│   │   │   ├── ConversationItem.tsx
│   │   │   ├── ConversationList.tsx
│   │   │   ├── MarkdownRenderer.tsx
│   │   │   ├── MessageActions.tsx
│   │   │   ├── MessageList.tsx
│   │   │   ├── ModelSelector.tsx
│   │   │   ├── ScrollToLatest.tsx
│   │   │   ├── ThinkingIndicator.tsx
│   │   │   ├── ToolCallDisplay.tsx
│   │   │   ├── types.ts
│   │   │   ├── useChat.ts
│   │   │   ├── UserMessage.tsx
│   │   │   └── utils.ts
│   │   ├── ConnectionStatus.tsx
│   │   ├── dashboard
│   │   │   ├── ActivityStream.tsx
│   │   │   ├── constants.ts
│   │   │   ├── DashboardListCard.tsx
│   │   │   ├── DashboardListItem.tsx
│   │   │   ├── index.ts
│   │   │   ├── MilestoneEraSection.tsx
│   │   │   ├── Section.tsx
│   │   │   ├── StatCard.tsx
│   │   │   └── useDashboardDrag.ts
│   │   ├── EmptyState.tsx
│   │   ├── ErrorBoundary.tsx
│   │   ├── ExecutionDetailModal.tsx
│   │   ├── layout
│   │   │   ├── AppHeader
│   │   │   │   ├── AppHeader.tsx
│   │   │   │   ├── HeaderActions.tsx
│   │   │   │   ├── HeaderConnection.tsx
│   │   │   │   ├── HeaderNotifications.tsx
│   │   │   │   ├── HeaderSearch.tsx
│   │   │   │   └── HeaderUserMenu.tsx
│   │   │   ├── AppSidebar
│   │   │   │   ├── AppSidebar.tsx
│   │   │   │   ├── SidebarBrand.tsx
│   │   │   │   ├── SidebarFooter.tsx
│   │   │   │   ├── SidebarNavigationItem.tsx
│   │   │   │   ├── SidebarNavigation.tsx
│   │   │   │   ├── SidebarSection.tsx
│   │   │   │   ├── SidebarUser.tsx
│   │   │   │   └── SidebarWorkspace.tsx
│   │   │   ├── CommandPalette
│   │   │   │   └── CommandPalette.tsx
│   │   │   └── Page
│   │   │       ├── PageBreadcrumb.tsx
│   │   │       ├── PageContainer.tsx
│   │   │       └── PageHeader.tsx
│   │   ├── Logo.tsx
│   │   ├── OperationalWidgets.tsx
│   │   ├── SessionTimeline.tsx
│   │   ├── ShellLayout-tobe-deleted.tsx
│   │   ├── Sidebar.tsx
│   │   ├── terminal
│   │   │   ├── TerminalEmptyState.tsx
│   │   │   ├── TerminalPane.tsx
│   │   │   ├── TerminalStatusBar.tsx
│   │   │   ├── TerminalTabs.tsx
│   │   │   ├── TerminalWorkspace.tsx
│   │   │   ├── types.ts
│   │   │   └── useTerminalSessions.ts
│   │   ├── Toast.tsx
│   │   └── WorkflowPipeline.tsx
│   ├── features
│   ├── layouts
│   │   └── ShellLayout.tsx
│   ├── lib
│   │   ├── api.ts
│   │   ├── auth.tsx
│   │   ├── connection.tsx
│   │   ├── theme.tsx
│   │   ├── useEventStream.ts
│   │   └── ws.ts
│   ├── main.tsx
│   ├── operations
│   │   └── operations.tsx
│   ├── pages
│   │   ├── Agents.tsx
│   │   ├── ApiBuilder.tsx
│   │   ├── Artifacts.tsx
│   │   ├── ChatPage.tsx
│   │   ├── Dashboard.tsx
│   │   ├── FeatureRequests.tsx
│   │   ├── Login.tsx
│   │   ├── Logs.tsx
│   │   ├── Memory.tsx
│   │   ├── NotFound.tsx
│   │   ├── OpsCenter.tsx
│   │   ├── Projects.tsx
│   │   ├── SessionList.tsx
│   │   ├── Settings
│   │   │   ├── api
│   │   │   │   ├── index.ts
│   │   │   │   ├── providers.api.ts
│   │   │   │   └── settings.api.ts
│   │   │   ├── assets
│   │   │   │   └── provider-icons
│   │   │   ├── components
│   │   │   │   ├── appearance
│   │   │   │   │   ├── AccentSelector.tsx
│   │   │   │   │   ├── AppearanceMode.tsx
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── LayoutSettings.tsx
│   │   │   │   │   ├── ProfileSelector.tsx
│   │   │   │   │   ├── ThemePreview.tsx
│   │   │   │   │   ├── ThemeSettings.tsx
│   │   │   │   │   └── TypographySettings.tsx
│   │   │   │   ├── charts
│   │   │   │   │   ├── index.ts
│   │   │   │   │   └── ProviderHealthChart.tsx
│   │   │   │   ├── common
│   │   │   │   │   ├── Badge.tsx
│   │   │   │   │   ├── Card.tsx
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── NumberInput.tsx
│   │   │   │   │   ├── Select.tsx
│   │   │   │   │   ├── SettingGroup.tsx
│   │   │   │   │   ├── SettingRow.tsx
│   │   │   │   │   ├── TextInput.tsx
│   │   │   │   │   └── Toggle.tsx
│   │   │   │   ├── layout
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── Section.tsx
│   │   │   │   │   ├── SettingsGrid.tsx
│   │   │   │   │   ├── SettingsHeader.tsx
│   │   │   │   │   └── StatusBanner.tsx
│   │   │   │   ├── preferences
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── Preferences.tsx
│   │   │   │   │   ├── PreferenceToggle.tsx
│   │   │   │   │   └── ResetSettings.tsx
│   │   │   │   ├── providers
│   │   │   │   │   ├── ConnectionTester.tsx
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── ModelSelector.tsx
│   │   │   │   │   ├── ProviderArchitecture.tsx
│   │   │   │   │   ├── ProviderCard.tsx
│   │   │   │   │   ├── ProviderConfiguration.tsx
│   │   │   │   │   └── ProviderMatrix.tsx
│   │   │   │   └── routing
│   │   │   │       ├── index.ts
│   │   │   │       ├── IntentModelRow.tsx
│   │   │   │       └── IntentRouting.tsx
│   │   │   ├── constants.ts
│   │   │   ├── context
│   │   │   │   └── SettingsContext.tsx
│   │   │   ├── hooks
│   │   │   │   ├── index.ts
│   │   │   │   ├── useConnectionTest.ts
│   │   │   │   ├── useProviderHealth.ts
│   │   │   │   ├── useSettings.ts
│   │   │   │   └── useThemeSettings.ts
│   │   │   ├── index.tsx
│   │   │   ├── models
│   │   │   │   ├── appearance.ts
│   │   │   │   ├── intentModels.ts
│   │   │   │   ├── preferences.ts
│   │   │   │   └── providers.ts
│   │   │   ├── README.md
│   │   │   ├── services
│   │   │   │   ├── connectionTester.ts
│   │   │   │   ├── providerHealth.ts
│   │   │   │   └── settingsStorage.ts
│   │   │   ├── SettingsPage.tsx
│   │   │   ├── types.ts
│   │   │   └── utils.ts
│   │   ├── Settings.tsx
│   │   └── Terminal.tsx
│   └── styles
│       └── index.css
├── tsconfig.json
├── vite.config.ts
└── workspace-tree.txt

35 directories, 171 files

```
