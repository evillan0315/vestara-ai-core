export type CodexJsonRpcId = number | string;

export interface CodexJsonRpcRequest<TParams = unknown> {
  readonly method: string;
  readonly id: CodexJsonRpcId;
  readonly params?: TParams;
}

export interface CodexJsonRpcNotification<TParams = unknown> {
  readonly method: string;
  readonly params?: TParams;
  readonly emittedAtMs?: number;
}

export interface CodexJsonRpcErrorObject {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

export interface CodexJsonRpcResponse<TResult = unknown> {
  readonly id: CodexJsonRpcId;
  readonly result?: TResult;
  readonly error?: CodexJsonRpcErrorObject;
}

export type CodexAppServerMessage<TResult = unknown, TParams = unknown> =
  | CodexJsonRpcResponse<TResult>
  | CodexJsonRpcNotification<TParams>;

export interface CodexInitializeResult {
  readonly userAgent: string;
  readonly codexHome: string;
  readonly platformFamily: string;
  readonly platformOs: string;
}

export interface CodexThread {
  readonly id: string;
  readonly sessionId?: string;
  readonly cwd?: string;
  readonly modelProvider?: string;
  readonly createdAt?: number;
  readonly updatedAt?: number;
  readonly status?: unknown;
  readonly [key: string]: unknown;
}

export interface CodexThreadStartResult {
  readonly thread: CodexThread;
  readonly model?: string;
  readonly modelProvider?: string;
  readonly serviceTier?: string | null;
  readonly cwd?: string;
  readonly runtimeWorkspaceRoots?: readonly string[];
  readonly instructionSources?: readonly string[];
  readonly approvalPolicy?: string;
  readonly sandbox?: unknown;
  readonly activePermissionProfile?: unknown;
  readonly reasoningEffort?: string;
  readonly multiAgentMode?: string;
}

export interface CodexThreadReadParams {
  readonly threadId: string;
  readonly includeTurns?: boolean;
}

export interface CodexThreadReadResult {
  readonly thread: CodexThread;
}

export interface CodexPageParams {
  readonly threadId: string;
  readonly cursor?: string;
  readonly limit?: number;
  readonly sortDirection?: 'asc' | 'desc';
  readonly itemsView?: 'notLoaded' | 'summary' | 'full';
}

export interface CodexTurnListResult {
  readonly data: readonly CodexTurn[];
  readonly nextCursor?: string | null;
  readonly backwardsCursor?: string | null;
}

export interface CodexItemListParams extends CodexPageParams {
  readonly turnId?: string;
}

export interface CodexItemListResult {
  readonly data: readonly unknown[];
  readonly nextCursor?: string | null;
  readonly backwardsCursor?: string | null;
}

export interface CodexTextInputPart {
  readonly type: 'text';
  readonly text: string;
}

export type CodexTurnInputPart = CodexTextInputPart;

export interface CodexTurnStartParams {
  readonly threadId: string;
  readonly input: readonly CodexTurnInputPart[];
}

export interface CodexTurn {
  readonly id: string;
  readonly status?: string;
  readonly items?: readonly unknown[];
  readonly [key: string]: unknown;
}

export interface CodexTurnStartResult {
  readonly turn?: CodexTurn;
  readonly [key: string]: unknown;
}

export type CodexAppServerNotification = CodexJsonRpcNotification;
