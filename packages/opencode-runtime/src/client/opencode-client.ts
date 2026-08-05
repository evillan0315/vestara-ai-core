// OpenCodeClient contract — the boundary between the API and OpenCode HTTP.
// The API depends on this interface, not on OpenCode HTTP implementation
// details. No native Response objects cross this boundary.

import type {
  CreateOpenCodeSessionInput,
  OpenCodeAgentSummary,
  OpenCodeCommandSummary,
  OpenCodeDiffFile,
  OpenCodeEvent,
  OpenCodeHealth,
  OpenCodeMessage,
  OpenCodeMessageResult,
  OpenCodePathInfo,
  OpenCodeProject,
  OpenCodeProviderSummary,
  OpenCodeRequestContext,
  OpenCodeSession,
  OpenCodeSessionStatusInfo,
  OpenCodeTodo,
  OpenCodeVcsInfo,
  RunOpenCodeCommandInput,
  SendOpenCodeMessageAsyncInput,
  SendOpenCodeMessageInput,
  VestaraPermissionDecision,
} from './opencode-types';

export interface OpenCodeClient {
  getHealth(signal?: AbortSignal): Promise<OpenCodeHealth>;

  getOpenApiDocument(signal?: AbortSignal): Promise<Record<string, unknown>>;

  listProjects(signal?: AbortSignal): Promise<OpenCodeProject[]>;

  getCurrentProject(signal?: AbortSignal): Promise<OpenCodeProject>;

  getPathInfo(signal?: AbortSignal): Promise<OpenCodePathInfo>;

  getVcsInfo(signal?: AbortSignal): Promise<OpenCodeVcsInfo>;

  listProviders(signal?: AbortSignal): Promise<OpenCodeProviderSummary[]>;

  listAgents(signal?: AbortSignal): Promise<OpenCodeAgentSummary[]>;

  listCommands(signal?: AbortSignal): Promise<OpenCodeCommandSummary[]>;

  listLsp(signal?: AbortSignal): Promise<unknown[]>;

  listSessions(context: OpenCodeRequestContext, signal?: AbortSignal): Promise<OpenCodeSession[]>;

  createSession(
    input: CreateOpenCodeSessionInput,
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<OpenCodeSession>;

  getSession(sessionId: string, context: OpenCodeRequestContext, signal?: AbortSignal): Promise<OpenCodeSession>;

  getSessionStatus(
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<Record<string, OpenCodeSessionStatusInfo>>;

  getSessionTodos(sessionId: string, context: OpenCodeRequestContext, signal?: AbortSignal): Promise<OpenCodeTodo[]>;

  getSessionChildren(
    sessionId: string,
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<OpenCodeSession[]>;

  getSessionDiff(sessionId: string, context: OpenCodeRequestContext, signal?: AbortSignal): Promise<OpenCodeDiffFile[]>;

  deleteSession(sessionId: string, context: OpenCodeRequestContext, signal?: AbortSignal): Promise<boolean>;

  renameSession(
    sessionId: string,
    title: string,
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<OpenCodeSession>;

  sendMessage(
    sessionId: string,
    input: SendOpenCodeMessageInput,
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<OpenCodeMessageResult>;

  listMessages(sessionId: string, context: OpenCodeRequestContext, signal?: AbortSignal): Promise<OpenCodeMessage[]>;

  sendMessageAsync(
    sessionId: string,
    input: SendOpenCodeMessageAsyncInput,
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<void>;

  runCommand(
    sessionId: string,
    input: RunOpenCodeCommandInput,
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<void>;

  abortSession(sessionId: string, context: OpenCodeRequestContext, signal?: AbortSignal): Promise<boolean>;

  respondToPermission(
    sessionId: string,
    permissionId: string,
    decision: VestaraPermissionDecision,
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<boolean>;

  openEventStream(context: OpenCodeRequestContext, signal?: AbortSignal): AsyncIterable<OpenCodeEvent>;
}
