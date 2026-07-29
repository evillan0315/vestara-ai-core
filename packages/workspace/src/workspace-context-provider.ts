/**
 * WorkspaceContextProvider — Injects workspace context into provider requests.
 *
 * Generates a structured workspace summary that is automatically
 * prepended to every AI interaction so users never need to explain
 * their project setup.
 */

import * as path from 'node:path';
import type { ContextAssembler, ContextOptions } from '@vestara/context';
import type { CompletionRequest, Conversation, ToolDefinition } from '@vestara/shared';
import type { GitService } from './git-service';
import type { ProjectProfile } from './project-profile';

export interface WorkspaceContext {
  profile: ProjectProfile;
  gitBranch: string | null;
  gitStatus: string | null;
  indexedFiles: number;
  updatedAt: string;
}

export class WorkspaceContextProvider implements ContextAssembler {
  private context: WorkspaceContext | null = null;
  private gitService: GitService | null = null;
  private fallbackPrompt: string;
  private _tools: ToolDefinition[] = [];

  constructor(fallbackPrompt?: string) {
    this.fallbackPrompt = fallbackPrompt ?? 'You are Vestara, an AI assistant that helps users build software.';
  }

  setWorkspaceContext(context: WorkspaceContext): void {
    this.context = context;
  }

  setGitService(gitService: GitService): void {
    this.gitService = gitService;
  }

  setTools(tools: ToolDefinition[]): void {
    this._tools = tools;
  }

  get currentContext(): WorkspaceContext | null {
    return this.context;
  }

  buildContext(conversation: Conversation, userMessage: string, options: ContextOptions = {}): CompletionRequest {
    const messages: CompletionRequest['messages'] = [];

    const systemPrompt = options.systemPrompt ?? this.buildSystemPrompt();
    messages.push({ role: 'system', content: systemPrompt });

    const recentMessages = conversation.messages.slice(-20);
    for (const msg of recentMessages) {
      if (msg.role === 'system') continue;
      messages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      });
    }

    messages.push({ role: 'user', content: userMessage });

    return {
      model: options.model ?? 'deepseek-v4-flash-free',
      messages,
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens ?? 2048,
      tools: this._tools.length > 0 ? this._tools : undefined,
    };
  }

  private readonly INIT_PROMPT = `You are Vestara, an AI engineering assistant working in the project below.

## Rules
- Respond conversationally and directly. Be concise.
- Do not guess — say "I don't know" if unsure.
- Understand before modifying — inspect first, explain, then act.
- Never fabricate files, APIs, or architecture decisions.
- Never delete files or rewrite working systems without justification.
- Use the available tools (read_file, write_file, ls, glob, search, git_status, shell_exec) when you need to interact with the filesystem or run commands.
- Never generate fictional tool calls, code blocks with fake commands, or XML function call syntax as text — call tools properly or just reply naturally.`;

  buildSystemPrompt(): string {
    const ctx = this.context;
    if (!ctx) return this.fallbackPrompt;

    const parts: string[] = [
      this.INIT_PROMPT,
      '',
      '<workspace_context>',
      `Project: ${ctx.profile.name}`,
      `Root: ${ctx.profile.identity.rootPath}`,
      '',
    ];

    if (ctx.profile.identity.gitRoot) {
      parts.push(`Repository: ${ctx.profile.identity.gitRemote ?? path.basename(ctx.profile.identity.gitRoot)}`);
    }
    if (ctx.gitBranch) {
      parts.push(`Git Branch: ${ctx.gitBranch}`);
    }

    if (ctx.profile.frameworks.length > 0) {
      parts.push('');
      parts.push('Frameworks:');
      for (const fw of ctx.profile.frameworks) {
        parts.push(`  ${fw.name} (${fw.category})`);
      }
    }

    parts.push('');
    parts.push('Languages:');
    parts.push(`  Primary: ${ctx.profile.primaryLanguage.name}`);
    for (const lang of ctx.profile.languages.slice(0, 5)) {
      parts.push(`  ${lang.name}: ${lang.percentage}%`);
    }

    if (ctx.profile.packageManager) {
      parts.push('');
      parts.push(`Package Manager: ${ctx.profile.packageManager.name}`);
      if (ctx.profile.isMonorepo) parts.push('Workspace: monorepo');
    }

    if (ctx.profile.tooling.buildTool) parts.push(`Build: ${ctx.profile.tooling.buildTool}`);
    if (ctx.profile.tooling.testFramework) parts.push(`Test: ${ctx.profile.tooling.testFramework}`);

    if (ctx.profile.apps.length > 0) {
      parts.push('');
      parts.push('Apps:');
      for (const app of ctx.profile.apps) parts.push(`  ${app}`);
    }

    if (ctx.profile.packages.length > 0) {
      parts.push('');
      parts.push('Packages:');
      for (const pkg of ctx.profile.packages) parts.push(`  ${pkg}`);
    }

    if (ctx.gitStatus) {
      parts.push('');
      parts.push('Git Status:');
      parts.push(`  ${ctx.gitStatus}`);
    }

    parts.push('');
    parts.push('Files indexed: ' + ctx.indexedFiles);
    parts.push('</workspace_context>');
    parts.push('You are helpful, concise, and precise.');

    return parts.join('\n');
  }
}
