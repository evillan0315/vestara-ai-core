// ─── Action / Tool (VOM) — Canonical Action Model ─────────────
//
// Architecture Traceability:
//   Foundation: VESTARA-OBJECT-MODEL.md → VOM-Tool
//   Foundation: TOOL-CATALOG.md → Tool Contract

export type PermissionLevel = 'read-only' | 'user-confirm' | 'admin-only';

import type { StreamChunk } from './stream.js';

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  permissions: PermissionLevel;
  requires: string[]; // Required capabilities: 'filesystem', 'network', 'shell'
  timeout: number; // Max execution time in ms
  sandbox: boolean; // Isolated execution required
  streaming: boolean; // Produces streaming progress
  idempotent: boolean; // Safe to retry
  destructive: boolean; // Can destroy data — requires confirmation
  inputSchema: Record<string, unknown>; // JSON Schema
  outputSchema: Record<string, unknown>; // JSON Schema
  category: 'filesystem' | 'shell' | 'knowledge' | 'memory' | 'project' | 'web' | 'code' | 'custom';
}

export interface ActionRequest {
  toolId: string;
  parameters: Record<string, unknown>;
  context: {
    conversationId?: string;
    userId?: string;
    agentId?: string;
  };
}

export type ActionStatus = 'requested' | 'authorized' | 'executing' | 'completed' | 'failed' | 'cancelled';

export interface ActionExecution {
  id: string;
  toolId: string;
  status: ActionStatus;
  request: ActionRequest;
  result?: unknown;
  error?: string;
  progress?: string;
  startedAt: string;
  completedAt?: string;
  duration?: number;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  duration: number;
}
