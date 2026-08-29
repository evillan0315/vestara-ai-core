/**
 * OpenCode configuration parsers.
 *
 * Version-aware, read-only, workspace-bounded, symlink-safe, and secret-
 * redacted parsing of the observable OpenCode runtime environment that
 * influences agent behavior.
 */

import * as path from 'node:path';
import { redact } from '../redact';
import { listDirSafe, readFileSafe, resolveInsideHome, resolveInsideRoot, sha1 } from '../safe-process';
import type {
  ExternalAgentDefinition,
  ExternalAgentMode,
  ExternalCommandDefinition,
  ExternalConfigurationScope,
  ExternalConfigurationSource,
  ExternalInstructionSource,
  ExternalMcpServer,
  ExternalModelDefinition,
  ExternalPermissionRule,
  ExternalPluginDefinition,
  ExternalProvider,
  ExternalSkillDefinition,
  ExternalSkillScope,
} from '../types';

export interface OpencodeConfigParseResult {
  readonly sources: readonly ExternalConfigurationSource[];
  readonly agents: readonly ExternalAgentDefinition[];
  readonly skills: readonly ExternalSkillDefinition[];
  readonly instructions: readonly ExternalInstructionSource[];
  readonly commands: readonly ExternalCommandDefinition[];
  readonly plugins: readonly ExternalPluginDefinition[];
  readonly mcpServers: readonly ExternalMcpServer[];
  readonly providers: readonly ExternalProvider[];
  readonly models: readonly ExternalModelDefinition[];
  readonly effective: Readonly<Record<string, unknown>>;
  readonly effectiveHash: string;
  readonly permissionRules: readonly ExternalPermissionRule[];
}

export interface OpencodeConfigParseContext {
  readonly workspacePath: string;
  readonly runtimeInstanceId: string;
  readonly homeDir: string;
  readonly now: string;
}

function sourceId(ctx: OpencodeConfigParseContext, scope: string, rel: string): string {
  return `${ctx.runtimeInstanceId}:${scope}:${rel}`;
}

// ─── JSON/JSONC parsing (lenient) ──────────────────────────────

export function parseJsonc(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    // Strip comments/trailing commas for JSONC.
    try {
      const cleaned = text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
        .replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

// ─── Agent markdown parsing ────────────────────────────────────

export function parseAgentMarkdown(
  id: string,
  runtimeInstanceId: string,
  filePath: string,
  text: string,
  _scope: ExternalConfigurationScope,
): ExternalAgentDefinition {
  const fm = parseFrontmatter(text);
  const body = stripFrontmatter(text);
  const modeRaw = String(fm.mode ?? 'all').toLowerCase();
  const mode: ExternalAgentMode =
    modeRaw === 'primary'
      ? 'primary'
      : modeRaw === 'subagent'
        ? 'subagent'
        : modeRaw === 'built-in'
          ? 'built-in'
          : 'all';
  const model = fm.model ? { modelId: String(fm.model) } : undefined;
  const tools = asRecord(parseJsoncSafe(fm.tools)) ?? {};
  const enabledToolMap: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(tools)) enabledToolMap[key] = Boolean(value);

  const permissionRules = parsePermissionRules(fm);
  const promptHash = sha1(body);
  return {
    id,
    runtimeInstanceId,
    runtimeType: 'opencode',
    externalAgentId: id,
    name: String(fm.name ?? path.basename(filePath, '.md')),
    description: fm.description ? String(fm.description) : undefined,
    mode,
    sourcePath: filePath,
    model,
    promptHash,
    redactedPrompt: redact(body.slice(0, 512)) as string,
    tools: enabledToolMap,
    permissions: permissionRules,
    options: {},
    hidden: Boolean(fm.hidden),
    builtIn: Boolean(fm.builtIn),
    enabled: true,
    provenance: 'file',
    discoveredAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    contentHash: promptHash,
  };
}

function parsePermissionRules(fm: Readonly<Record<string, unknown>>): readonly ExternalPermissionRule[] {
  const rules: ExternalPermissionRule[] = [];
  const permissions = asRecord(parseJsoncSafe(fm.permissions));
  if (permissions) {
    for (const [capability, value] of Object.entries(permissions)) {
      const decision = String(value).toLowerCase();
      if (decision === 'allow' || decision === 'ask' || decision === 'deny') {
        rules.push({ capability, decision, scope: 'agent', provenance: 'resolved' });
      } else if (asRecord(value)) {
        for (const [pattern, d] of Object.entries(asRecord(value) ?? {})) {
          const dd = String(d).toLowerCase();
          if (dd === 'allow' || dd === 'ask' || dd === 'deny')
            rules.push({ capability, pattern, decision: dd, scope: 'agent', provenance: 'resolved' });
        }
      }
    }
  }
  return rules;
}

function parseJsoncSafe(value: unknown): unknown {
  if (typeof value === 'string') return parseJsonc(value);
  return value;
}

export function parseFrontmatter(text: string): Readonly<Record<string, unknown>> {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out: Record<string, unknown> = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z][\w-]*)\s*:\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

export function stripFrontmatter(text: string): string {
  return text.replace(/^---\n[\s\S]*?\n---\n?/, '');
}

// ─── Skill SKILL.md parsing ────────────────────────────────────

export function parseSkillMarkdown(
  id: string,
  runtimeInstanceId: string,
  filePath: string,
  text: string,
  scope: ExternalSkillScope,
): ExternalSkillDefinition {
  const fm = parseFrontmatter(text);
  const baseDir = path.dirname(filePath);
  const supporting = listDirSafe(baseDir)
    .filter((f) => f !== 'SKILL.md')
    .map((f) => ({ name: f, path: path.join(baseDir, f) }));
  return {
    id,
    runtimeInstanceId,
    runtimeType: 'opencode',
    externalSkillId: id,
    name: String(fm.name ?? path.basename(baseDir)),
    description: String(fm.description ?? ''),
    license: fm.license ? String(fm.license) : undefined,
    compatibility: fm.compatibility ? String(fm.compatibility) : undefined,
    metadata: collectMetadata(fm),
    sourcePath: filePath,
    sourceScope: scope,
    baseDirectory: baseDir,
    supportingFiles: supporting,
    contentHash: sha1(text),
    redactedBody: redact(text.slice(0, 512)) as string,
    valid: true,
    validationErrors: [],
    discoveredAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function collectMetadata(fm: Readonly<Record<string, unknown>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fm)) {
    if (!['name', 'description', 'license', 'compatibility'].includes(key)) out[key] = String(value);
  }
  return out;
}

// ─── Main discovery ────────────────────────────────────────────

export function discoverOpencodeConfig(ctx: OpencodeConfigParseContext): OpencodeConfigParseResult {
  const { workspacePath, runtimeInstanceId, homeDir, now } = ctx;
  const sources: ExternalConfigurationSource[] = [];
  const agents: ExternalAgentDefinition[] = [];
  const skills: ExternalSkillDefinition[] = [];
  const instructions: ExternalInstructionSource[] = [];
  const commands: ExternalCommandDefinition[] = [];
  const plugins: ExternalPluginDefinition[] = [];
  const mcpServers: ExternalMcpServer[] = [];
  const providers: ExternalProvider[] = [];
  const models: ExternalModelDefinition[] = [];
  const permissionRules: ExternalPermissionRule[] = [];

  const configPaths: Array<{ rel: string; scope: ExternalConfigurationScope }> = [
    { rel: 'opencode.json', scope: 'workspace' },
    { rel: 'opencode.jsonc', scope: 'workspace' },
    { rel: '.opencode/opencode.json', scope: 'workspace' },
    { rel: '.opencode/opencode.jsonc', scope: 'workspace' },
    { rel: '.config/opencode/opencode.json', scope: 'global' },
  ];

  // JSON configuration sources
  for (const cfg of configPaths) {
    const abs = cfg.rel.startsWith('.config')
      ? resolveInsideHome(homeDir, cfg.rel.replace(/^\.config\//, '.config/'))
      : resolveInsideRoot(workspacePath, cfg.rel);
    if (!abs) continue;
    const text = readFileSafe(abs);
    if (text === null) {
      sources.push({
        id: sourceId(ctx, cfg.scope, cfg.rel),
        runtimeInstanceId,
        runtimeType: 'opencode',
        path: abs,
        scope: cfg.scope,
        exists: false,
        precedence: precedenceFor(cfg.scope),
        discoveredAt: now,
      });
      continue;
    }
    const parsed = asRecord(parseJsonc(text));
    const hash = sha1(text);
    sources.push({
      id: sourceId(ctx, cfg.scope, cfg.rel),
      runtimeInstanceId,
      runtimeType: 'opencode',
      path: abs,
      scope: cfg.scope,
      exists: true,
      precedence: precedenceFor(cfg.scope),
      discoveredAt: now,
      contentHash: hash,
      redactedContent: redact(parsed),
    });
    if (parsed)
      ingestConfig(parsed, {
        runtimeInstanceId,
        providers,
        models,
        mcpServers,
        plugins,
        permissionRules,
        sourceId: sourceId(ctx, cfg.scope, cfg.rel),
      });
  }

  // Agents (primary + subagent) from .opencode/agents and global agents
  const agentDirs: Array<{ dir: string; scope: ExternalConfigurationScope }> = [
    { dir: '.opencode/agents', scope: 'workspace' },
    { dir: '.opencode/agent', scope: 'workspace' },
  ];
  const globalAgentDirs = ['agents', 'agent'].map((d) => ({
    dir: path.join(homeDir, '.config', 'opencode', d),
    scope: 'global' as ExternalConfigurationScope,
  }));

  for (const { dir, scope } of [...agentDirs, ...globalAgentDirs]) {
    const abs = dir.startsWith(homeDir) ? dir : resolveInsideRoot(workspacePath, dir);
    if (!abs) continue;
    for (const file of listDirSafe(abs).filter((f) => f.endsWith('.md'))) {
      const absFile = path.join(abs, file);
      const text = readFileSafe(absFile);
      if (text === null) continue;
      const id = path.basename(file, '.md');
      agents.push(parseAgentMarkdown(id, runtimeInstanceId, absFile, text, scope));
    }
  }

  // Skills
  const skillDirs: Array<{ dir: string; scope: ExternalSkillScope; absolute?: boolean }> = [
    { dir: '.opencode/skills', scope: 'workspace' },
    { dir: '.agents/skills', scope: 'agent-compatible' },
    { dir: path.join(homeDir, '.config', 'opencode', 'skills'), scope: 'global', absolute: true },
    { dir: path.join(homeDir, '.claude', 'skills'), scope: 'claude-compatible', absolute: true },
    { dir: path.join(homeDir, '.agents', 'skills'), scope: 'agent-compatible', absolute: true },
  ];
  for (const { dir, scope, absolute } of skillDirs) {
    const absDir = absolute ? dir : resolveInsideRoot(workspacePath, dir);
    if (!absDir) continue;
    for (const skillDir of listDirSafe(absDir)) {
      const skillPath = path.join(absDir, skillDir, 'SKILL.md');
      const text = readFileSafe(skillPath);
      if (text === null) continue;
      skills.push(parseSkillMarkdown(skillDir, runtimeInstanceId, skillPath, text, scope));
    }
  }

  // Commands
  const commandDirs: Array<{ dir: string; scope: ExternalConfigurationScope; absolute?: boolean }> = [
    { dir: '.opencode/commands', scope: 'workspace' },
    { dir: path.join(homeDir, '.config', 'opencode', 'commands'), scope: 'global', absolute: true },
  ];
  for (const { dir, scope, absolute } of commandDirs) {
    const absDir = absolute ? dir : resolveInsideRoot(workspacePath, dir);
    if (!absDir) continue;
    for (const file of listDirSafe(absDir).filter((f) => f.endsWith('.md'))) {
      const absFile = path.join(absDir, file);
      const text = readFileSafe(absFile);
      if (text === null) continue;
      const fm = parseFrontmatter(text);
      const name = path.basename(file, '.md');
      const templateHash = sha1(text);
      commands.push({
        id: sourceId(ctx, scope, name),
        runtimeInstanceId,
        runtimeType: 'opencode',
        name,
        description: fm.description ? String(fm.description) : undefined,
        sourcePath: absFile,
        sourceScope: scope,
        agentId: fm.agent ? String(fm.agent) : undefined,
        model: fm.model ? { modelId: String(fm.model) } : undefined,
        templateHash,
        redactedTemplate: redact(stripFrontmatter(text).slice(0, 256)) as string,
        createsSubtask: Boolean(fm.subtask),
        enabled: true,
        discoveredAt: now,
        updatedAt: now,
      });
    }
  }

  // Instructions
  const instructionPaths: Array<{
    rel: string;
    scope: ExternalInstructionSource['scope'];
    format: ExternalInstructionSource['format'];
  }> = [
    { rel: 'AGENTS.md', scope: 'workspace', format: 'agents-md' },
    { rel: 'CLAUDE.md', scope: 'compatibility', format: 'claude-md' },
    { rel: 'CONTEXT.md', scope: 'compatibility', format: 'context-md' },
    { rel: path.join(homeDir, '.config', 'opencode', 'AGENTS.md'), scope: 'global', format: 'agents-md' },
    { rel: path.join(homeDir, '.claude', 'CLAUDE.md'), scope: 'global', format: 'claude-md' },
  ];
  for (const instr of instructionPaths) {
    const abs = instr.rel.startsWith(homeDir) ? instr.rel : resolveInsideRoot(workspacePath, instr.rel);
    if (!abs) continue;
    const text = readFileSafe(abs);
    if (text === null) continue;
    instructions.push({
      id: sourceId(ctx, instr.scope, instr.rel),
      runtimeInstanceId,
      runtimeType: 'opencode',
      path: abs,
      scope: instr.scope,
      format: instr.format,
      contentHash: sha1(text),
      redactedContent: redact(text.slice(0, 512)) as string,
      precedence: instr.scope === 'workspace' ? 2 : 1,
      active: true,
      provenance: 'resolved',
      discoveredAt: now,
      updatedAt: now,
    });
  }

  // Effective configuration hash (over config sources + agents + skills)
  const effectiveHash = sha1(
    JSON.stringify({
      sources: sources.map((s) => s.contentHash).join(','),
      agents: agents.map((a) => a.contentHash).join(','),
      skills: skills.map((s) => s.contentHash).join(','),
    }),
  );

  return {
    sources,
    agents,
    skills,
    instructions,
    commands,
    plugins,
    mcpServers,
    providers,
    models,
    effective: { sourceCount: sources.length, agentCount: agents.length, skillCount: skills.length },
    effectiveHash,
    permissionRules,
  };
}

function ingestConfig(
  config: Readonly<Record<string, unknown>>,
  sink: {
    runtimeInstanceId: string;
    providers: ExternalProvider[];
    models: ExternalModelDefinition[];
    mcpServers: ExternalMcpServer[];
    plugins: ExternalPluginDefinition[];
    permissionRules: ExternalPermissionRule[];
    sourceId: string;
  },
): void {
  const { runtimeInstanceId, providers, models, mcpServers, plugins, permissionRules, sourceId } = sink;
  const now = new Date().toISOString();

  const providerConfig = asRecord(config.provider);
  if (providerConfig) {
    for (const [providerId, value] of Object.entries(providerConfig)) {
      const providerBlock = asRecord(value);
      const modelsBlock = providerBlock ? asRecord(providerBlock.models) : null;
      const providerModels: ExternalModelDefinition[] = modelsBlock
        ? Object.keys(modelsBlock).map((modelId) => ({
            id: `${providerId}/${modelId}`,
            providerId,
            modelId,
            discoveredAt: now,
          }))
        : [];
      const configured = providerBlock !== null && hasCredential(providerBlock);
      providers.push({
        id: `${sourceId}:provider:${providerId}`,
        runtimeInstanceId,
        runtimeType: 'opencode',
        providerId,
        displayName: providerBlock && typeof providerBlock.name === 'string' ? String(providerBlock.name) : undefined,
        configured,
        credentialSource: configured ? 'environment' : 'unknown',
        baseUrl:
          providerBlock && typeof providerBlock.baseURL === 'string'
            ? redactUrl(String(providerBlock.baseURL))
            : undefined,
        models: providerModels,
        discoveredAt: now,
      });
      models.push(...providerModels);
    }
  }

  const mcpConfig = asRecord(config.mcp) ?? asRecord(config.mcpServers);
  if (mcpConfig) {
    for (const [name, value] of Object.entries(mcpConfig)) {
      const server = asRecord(value);
      mcpServers.push({
        id: `${sourceId}:mcp:${name}`,
        runtimeInstanceId,
        runtimeType: 'opencode',
        name,
        transport: transportFor(server),
        local: isLocalServer(server),
        command: server && typeof server.command === 'string' ? String(server.command) : undefined,
        redactedArgs: server && Array.isArray(server.args) ? server.args.map((a) => redact(a as string)) : [],
        redactedEnvironment: [],
        url: server && typeof server.url === 'string' ? redactUrl(String(server.url)) : undefined,
        enabled: true,
        connectionState: 'configured',
        availableTools: [],
        discoveredAt: now,
        updatedAt: now,
      });
    }
  }

  const pluginsConfig = asRecord(config.plugin);
  if (pluginsConfig) {
    for (const [name, _value] of Object.entries(pluginsConfig)) {
      plugins.push({
        id: `${sourceId}:plugin:${name}`,
        runtimeInstanceId,
        runtimeType: 'opencode',
        name,
        packageName: name.includes('/') ? name : undefined,
        sourceType: 'npm',
        enabled: true,
        capabilities: [],
        loadStatus: 'configured',
        discoveredAt: now,
        updatedAt: now,
      });
    }
  }

  const permissionsConfig = asRecord(config.permission);
  if (permissionsConfig) {
    for (const [capability, decision] of Object.entries(permissionsConfig)) {
      const d = String(decision).toLowerCase();
      if (d === 'allow' || d === 'ask' || d === 'deny') {
        permissionRules.push({ capability, decision: d, sourceId, scope: 'global', provenance: 'resolved' });
      }
    }
  }
}

function hasCredential(block: Readonly<Record<string, unknown>>): boolean {
  return Object.keys(block).some((key) => /apiKey|token|secret|auth|key/i.test(key));
}

function redactUrl(url: string): string {
  return url.replace(/\/\/([^/@\s]+):([^/@\s]+)@/g, '//[REDACTED]:[REDACTED]@');
}

function transportFor(server: Readonly<Record<string, unknown>> | null): ExternalMcpServer['transport'] {
  if (!server) return 'unknown';
  if (server.url) return String(server.url).startsWith('http') ? 'http' : 'unknown';
  return 'stdio';
}

function isLocalServer(server: Readonly<Record<string, unknown>> | null): boolean {
  if (!server) return true;
  const url = server.url;
  if (typeof url === 'string') return url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1');
  return true;
}

function precedenceFor(scope: ExternalConfigurationScope): number {
  switch (scope) {
    case 'global':
      return 10;
    case 'workspace':
      return 20;
    case 'directory':
      return 30;
    case 'custom':
      return 40;
    case 'runtime-home':
      return 5;
    default:
      return 0;
  }
}

export { redact as redactConfig };
