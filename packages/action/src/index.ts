/**
 * @vestara/action — Action Runtime
 *
 * Canonical action lifecycle: requested → authorized → executing → completed/failed.
 * Every action — whether from local tools, plugins, MCP, cloud, or robotics —
 * flows through this lifecycle. The Conversation Runtime never knows which
 * adapter is behind an action.
 *
 * Architecture Traceability:
 *   Foundation: VESTARA-OBJECT-MODEL.md → VOM-Tool
 *   Foundation: TOOL-CATALOG.md → Tool Contract
 *   Specification: AI-CON-005 → Agent Runtime
 */

import type { EventBus } from '@vestara/event-bus';
import type { Logger } from '@vestara/logger';
import type { PermissionEngine } from '@vestara/permission';
import type { ActionExecution, ActionRequest, StreamChunk, ToolDefinition, ToolResult } from '@vestara/shared';
import { DefaultStreamProcessor } from '@vestara/stream';

let actionCounter = 0;

export interface Tool {
  definition: ToolDefinition;
  execute(request: ActionRequest): Promise<ToolResult>;
  executeStream?(request: ActionRequest): AsyncIterable<StreamChunk>;
}

export interface ActionRuntime {
  registerTool(tool: Tool): void;
  getTool(toolId: string): Tool | null;
  listTools(): ToolDefinition[];
  executeAction(request: ActionRequest, context?: ActionContext): Promise<ActionExecution>;
  executeActionStream(request: ActionRequest, context?: ActionContext): AsyncIterable<StreamChunk>;
}

export interface ActionContext {
  userId?: string;
  role?: 'admin' | 'editor' | 'user' | 'agent';
  conversationId?: string;
}

export class DefaultActionRuntime implements ActionRuntime {
  private tools: Map<string, Tool> = new Map();
  private permissionEngine: PermissionEngine;
  private eventBus?: EventBus;
  private logger?: Logger;
  private streamProcessor: DefaultStreamProcessor;

  constructor(options: {
    permissionEngine: PermissionEngine;
    eventBus?: EventBus;
    logger?: Logger;
  }) {
    this.permissionEngine = options.permissionEngine;
    this.eventBus = options.eventBus;
    this.logger = options.logger?.child({ component: 'action' });
    this.streamProcessor = new DefaultStreamProcessor({
      eventBus: options.eventBus,
      logger: options.logger,
    });
  }

  registerTool(tool: Tool): void {
    this.tools.set(tool.definition.id, tool);
    this.logger?.info(`Tool registered: ${tool.definition.id}`, {
      permissions: tool.definition.permissions,
      category: tool.definition.category,
    });
  }

  getTool(toolId: string): Tool | null {
    return this.tools.get(toolId) ?? null;
  }

  listTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  async executeAction(request: ActionRequest, context: ActionContext = {}): Promise<ActionExecution> {
    const executionId = `act-${Date.now()}-${++actionCounter}`;
    const tool = this.tools.get(request.toolId);
    if (!tool) {
      return this.failed(executionId, request, `Tool not found: ${request.toolId}`);
    }

    // Permission check
    const decision = await this.permissionEngine.checkPermission(tool.definition, request, {
      role: context.role,
      userId: context.userId,
    });

    if (!decision.authorized) {
      return this.failed(executionId, request, decision.reason ?? 'Not authorized');
    }

    if (decision.requiresConfirmation) {
      this.logger?.info(`Action requires confirmation: ${request.toolId}`, { executionId });
      // In production, this would wait for user approval via the permission engine
    }

    await this.emit('action:authorized', { executionId, toolId: request.toolId });

    // Execute
    const execution: ActionExecution = {
      id: executionId,
      toolId: request.toolId,
      status: 'executing',
      request,
      startedAt: new Date().toISOString(),
    };

    await this.emit('action:started', { executionId, toolId: request.toolId });

    const startTime = performance.now();
    try {
      const result = await tool.execute(request);
      execution.status = result.success ? 'completed' : 'failed';
      execution.result = result.data;
      execution.error = result.error;
      execution.duration = Math.round(performance.now() - startTime);
      execution.completedAt = new Date().toISOString();

      await this.emit(result.success ? 'action:completed' : 'action:failed', {
        executionId,
        toolId: request.toolId,
        duration: execution.duration,
        error: result.error,
      });

      this.logger?.info(`Action ${execution.status}: ${request.toolId}`, {
        executionId,
        duration: `${execution.duration}ms`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Action execution failed';
      execution.status = 'failed';
      execution.error = msg;
      execution.duration = Math.round(performance.now() - startTime);
      execution.completedAt = new Date().toISOString();

      await this.emit('action:failed', {
        executionId,
        toolId: request.toolId,
        error: msg,
      });
    }

    return execution;
  }

  async *executeActionStream(request: ActionRequest, context: ActionContext = {}): AsyncIterable<StreamChunk> {
    const executionId = `act-${Date.now()}-${++actionCounter}`;
    const tool = this.tools.get(request.toolId);

    if (!tool) {
      yield this.streamProcessor.error(`Tool not found: ${request.toolId}`);
      return;
    }

    if (!tool.executeStream) {
      // Fallback to non-streaming execution
      const result = await this.executeAction(request, context);
      if (result.status === 'completed') {
        yield this.streamProcessor.text(JSON.stringify(result.result ?? ''));
      } else {
        yield this.streamProcessor.error(result.error ?? 'Action failed');
      }
      yield this.streamProcessor.complete();
      return;
    }

    // Permission check
    const decision = await this.permissionEngine.checkPermission(tool.definition, request, {
      role: context.role,
      userId: context.userId,
    });

    if (!decision.authorized) {
      yield this.streamProcessor.error(decision.reason ?? 'Not authorized');
      return;
    }

    await this.emit('action:started', { executionId, toolId: request.toolId });

    try {
      for await (const chunk of tool.executeStream(request)) {
        yield chunk;
      }
      await this.emit('action:completed', { executionId, toolId: request.toolId });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Stream failed';
      yield this.streamProcessor.error(msg);
      await this.emit('action:failed', { executionId, toolId: request.toolId, error: msg });
    }
  }

  private failed(executionId: string, request: ActionRequest, error: string): ActionExecution {
    return {
      id: executionId,
      toolId: request.toolId,
      status: 'failed',
      request,
      error,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      duration: 0,
    };
  }

  private async emit(type: string, payload: Record<string, unknown>): Promise<void> {
    await this.eventBus?.emit({
      type,
      source: 'action-runtime',
      payload,
    });
  }
}
