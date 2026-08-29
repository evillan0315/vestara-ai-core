import * as fs from 'node:fs';
import type * as http from 'node:http';
import * as path from 'node:path';
import { OpenAIProvider, OpenCodeGoProvider, OpenCodeProvider } from '@vestara/provider-opencode';
import type { AIModel, AIProvider } from '@vestara/shared';
import { type ModelConfig, type ProviderConfig, WorkspaceManifest } from '@vestara/workspace';
import { requireRole } from '../auth';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

interface ProviderCredentialFile {
  version: 1;
  keys: Record<string, string>;
}

type ProviderConfigurationContext = Pick<WorkspaceContext, 'workspaceDir' | 'providerManager'>;

interface ProviderMutation extends Partial<Omit<ProviderConfig, 'models' | 'createdAt' | 'updatedAt' | 'apiKeyEnv'>> {
  apiKey?: string | null;
  apiKeyEnv?: string | null;
  force?: boolean;
  models?: ModelConfig[];
}

interface ModelMutation extends Partial<ModelConfig> {}

const BUILT_IN_PROVIDERS = new Set(['opencode', 'opencode-go', 'openai']);

function validateProviderId(id: string): string | undefined {
  return /^[a-z0-9][a-z0-9_-]{1,63}$/.test(id)
    ? undefined
    : 'Provider ID must contain 2-64 lowercase letters, numbers, _ or -';
}

function validateBaseUrl(value: string | undefined): string | undefined {
  if (!value) return 'Provider base URL is required';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return 'Provider base URL must use HTTP or HTTPS';
  } catch {
    return 'Provider base URL is invalid';
  }
  return undefined;
}

function validateModel(model: ModelConfig): string | undefined {
  if (!model.id.trim() || !model.name.trim()) return 'Model ID and name are required';
  if (!Number.isSafeInteger(model.contextWindow) || model.contextWindow < 1)
    return 'Context window must be a positive integer';
  if (!Number.isSafeInteger(model.maxOutput) || model.maxOutput < 1) return 'Maximum output must be a positive integer';
  return undefined;
}

function routingAssignments(ctx: WorkspaceContext, providerId: string, modelId?: string) {
  return Object.entries(ctx.routingStore.get().selection.roles)
    .filter(([, route]) => route?.providerId === providerId && (!modelId || route.modelId === modelId))
    .map(([role, route]) => ({ role, providerId: route!.providerId, modelId: route!.modelId }));
}

function credentialPath(ctx: ProviderConfigurationContext): string {
  return path.join(ctx.workspaceDir, 'provider-credentials.json');
}

function readCredentials(ctx: ProviderConfigurationContext): ProviderCredentialFile {
  try {
    return JSON.parse(fs.readFileSync(credentialPath(ctx), 'utf8')) as ProviderCredentialFile;
  } catch {
    return { version: 1, keys: {} };
  }
}

function writeCredentials(ctx: ProviderConfigurationContext, credentials: ProviderCredentialFile): void {
  const target = credentialPath(ctx);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(target, 0o600);
}

async function manifest(ctx: WorkspaceContext) {
  const loaded = await WorkspaceManifest.load(ctx.workspaceDir);
  if (!loaded) throw new Error('Workspace manifest is unavailable');
  return loaded;
}

function modelConfig(model: AIModel): ModelConfig {
  return {
    id: model.id,
    name: model.name,
    enabled: model.status === 'available' || model.status === 'degraded',
    contextWindow: model.contextWindow,
    maxOutput: model.maxOutput,
    capabilities: {
      chat: model.capabilities.chat,
      streaming: model.capabilities.streaming,
      functionCalling: model.capabilities.functionCalling,
      vision: model.capabilities.vision,
    },
    pricing: model.pricing,
  };
}

function runtimeConfigs(ctx: WorkspaceContext): ProviderConfig[] {
  const now = new Date().toISOString();
  return ctx.providerManager.listProviders().map((info) => {
    const provider = ctx.providerManager.getProvider(info.id);
    return {
      id: info.id,
      name: info.name,
      enabled: info.status !== 'unavailable',
      baseUrl:
        info.id === 'openai'
          ? 'https://api.openai.com/v1'
          : info.id === 'opencode-go'
            ? 'https://opencode.ai/zen/go/v1'
            : info.id === 'opencode'
              ? 'https://opencode.ai/zen/v1'
              : undefined,
      apiKeyEnv:
        info.id === 'openai' ? 'OPENAI_API_KEY' : info.id === 'opencode-go' ? 'OPENCODE_GO_API_KEY' : undefined,
      models: provider?.models.map(modelConfig) ?? [],
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
  });
}

async function configurations(ctx: WorkspaceContext): Promise<ProviderConfig[]> {
  const data = await manifest(ctx);
  const persisted = data.providers ?? [];
  const byId = new Map(runtimeConfigs(ctx).map((provider) => [provider.id, provider]));
  for (const provider of persisted) byId.set(provider.id, provider);
  return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Providers discovered from the OpenCode runtime (`api/opencode/providers`
 * source). Returns `null` when the runtime is unreachable so callers fall back
 * to the persisted provider-manager configuration. Models come from the
 * runtime's provider discovery — never hardcoded.
 */
async function runtimeProviderConfigs(ctx: WorkspaceContext): Promise<ProviderConfig[] | null> {
  try {
    const providers = await ctx.opencodeRuntime.listProviders();
    if (!providers || providers.length === 0) return null;
    const now = new Date().toISOString();
    return providers.map((provider) => ({
      id: provider.id,
      name: provider.name ?? provider.id,
      enabled: true,
      baseUrl: undefined,
      apiKeyEnv: undefined,
      models: (provider.models ?? []).map((id) => ({
        id,
        name: id,
        enabled: true,
        contextWindow: 128_000,
        maxOutput: 8_192,
        capabilities: { chat: true, streaming: true, functionCalling: true, vision: false },
      })),
      revision: 1,
      createdAt: now,
      updatedAt: now,
    }));
  } catch {
    return null;
  }
}

/** True when a provider id was discovered from the OpenCode runtime. */
async function isRuntimeProvider(ctx: WorkspaceContext, id: string): Promise<boolean> {
  try {
    const providers = await ctx.opencodeRuntime.listProviders();
    return providers.some((provider) => provider.id === id);
  } catch {
    return false;
  }
}

async function saveConfigurations(ctx: WorkspaceContext, providers: ProviderConfig[]): Promise<void> {
  const data = await manifest(ctx);
  data.providers = providers;
  await WorkspaceManifest.save(ctx.workspaceDir, data);
}

async function replaceConfiguration(
  ctx: WorkspaceContext,
  providers: ProviderConfig[],
  next: ProviderConfig,
  previous: ProviderConfig | undefined,
  apiKey?: string,
): Promise<void> {
  const index = providers.findIndex((provider) => provider.id === next.id);
  if (index < 0) providers.push(next);
  else providers[index] = next;
  await saveConfigurations(ctx, providers);
  try {
    await refreshRuntime(ctx, next, apiKey);
    ctx.publish({
      id: `provider-${next.id}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      category: 'system',
      type: previous ? 'provider.updated' : 'provider.created',
      actor: { id: 'provider-configuration', name: 'Provider Configuration Service', type: 'system' },
      resource: { type: 'ai-provider', id: next.id, name: next.name },
      message: `${next.name} provider configuration applied`,
      metadata: {
        providerId: next.id,
        revision: next.revision ?? 1,
        enabled: next.enabled,
        modelCount: next.models.length,
      },
    });
  } catch (error) {
    const rollback = providers.filter((provider) => provider.id !== next.id);
    if (previous) rollback.push(previous);
    await saveConfigurations(ctx, rollback);
    if (previous) await refreshRuntime(ctx, previous, apiKey).catch(() => {});
    throw error;
  }
}

function toModels(providerId: string, models: ModelConfig[]): AIModel[] {
  return models.map((model) => ({
    id: model.id,
    provider: providerId,
    name: model.name,
    contextWindow: model.contextWindow,
    maxOutput: model.maxOutput,
    capabilities: { ...model.capabilities, embeddings: false },
    pricing: model.pricing,
    status: model.enabled ? 'available' : 'unavailable',
  }));
}

async function refreshRuntime(
  ctx: ProviderConfigurationContext,
  config: ProviderConfig,
  apiKey?: string,
): Promise<void> {
  if (ctx.providerManager.getProvider(config.id)) await ctx.providerManager.unload(config.id);
  if (!config.enabled) return;
  const providerOptions = {
    id: config.id,
    name: config.name,
    baseUrl: config.baseUrl,
    models: toModels(config.id, config.models),
    allowedRemoteModels: new Set(config.models.filter((model) => model.enabled).map((model) => model.id)),
    apiKeyEnvironmentVariables: config.apiKeyEnv ? [config.apiKeyEnv] : [],
    includeTemperature: config.id !== 'openai' && config.id !== 'opencode-go',
    outputTokenField: config.id === 'openai' ? 'max_completion_tokens' : 'max_tokens',
  } as const;
  const provider: AIProvider =
    config.id === 'opencode-go'
      ? new OpenCodeGoProvider(providerOptions)
      : config.id === 'openai'
        ? new OpenAIProvider(providerOptions)
        : new OpenCodeProvider(providerOptions);
  await ctx.providerManager.register(provider);
  ctx.providerManager.registerEngineeringMetadata(config.id, {
    locality: config.baseUrl?.includes('127.0.0.1') || config.baseUrl?.includes('localhost') ? 'local' : 'cloud',
    capabilities: ['conversation', 'streaming', 'structured-output'],
    dataPolicies: ['metadata-only', 'source-allowed'],
  });
  await provider.initialize({ baseUrl: config.baseUrl, apiKey: apiKey || undefined });
}

/** Re-applies persisted provider state after the API runtime restarts. */
export async function restoreProviderConfigurations(ctx: ProviderConfigurationContext): Promise<void> {
  const data = await WorkspaceManifest.load(ctx.workspaceDir);
  if (!data?.providers?.length) return;
  const credentials = readCredentials(ctx);
  for (const config of data.providers) {
    await refreshRuntime(ctx, config, credentials.keys[config.id]);
  }
}

function publicProvider(ctx: WorkspaceContext, config: ProviderConfig) {
  const credentials = readCredentials(ctx);
  const runtime = ctx.providerManager.getProvider(config.id);
  const environmentConfigured = Boolean(config.apiKeyEnv && process.env[config.apiKeyEnv]);
  return {
    ...config,
    revision: config.revision ?? 1,
    builtIn: BUILT_IN_PROVIDERS.has(config.id),
    status: config.enabled ? (runtime?.status ?? 'unavailable') : 'disabled',
    credential: {
      configured: Boolean(credentials.keys[config.id] || environmentConfigured),
      source: credentials.keys[config.id] ? 'stored' : environmentConfigured ? 'environment' : undefined,
    },
    hasApiKey: Boolean(credentials.keys[config.id] || environmentConfigured),
  };
}

export async function handleProvidersRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  if (method === 'GET' && p === '/api/providers') {
    const runtime = await runtimeProviderConfigs(ctx);
    if (runtime) {
      json(res, 200, {
        source: 'opencode-runtime',
        providers: runtime.map((provider) => ({
          ...publicProvider(ctx, provider),
          status: 'available',
          source: 'opencode-runtime' as const,
        })),
      });
      return true;
    }
    json(res, 200, {
      source: 'configuration',
      providers: (await configurations(ctx)).map((provider) => publicProvider(ctx, provider)),
    });
    return true;
  }

  const providerActionMatch = p.match(/^\/api\/providers\/([^/]+)\/(enable|disable|test|discover-models)$/);
  const credentialMatch = p.match(/^\/api\/providers\/([^/]+)\/credentials$/);
  const modelsMatch = p.match(/^\/api\/providers\/([^/]+)\/models$/);
  const modelMatch = p.match(/^\/api\/providers\/([^/]+)\/models\/([^/]+)$/);

  const singleProviderMatch = p.match(/^\/api\/providers\/([^/]+)$/);
  if (singleProviderMatch && method === 'GET') {
    const id = decodeURIComponent(singleProviderMatch[1]);
    if (await isRuntimeProvider(ctx, id)) {
      const runtime = await runtimeProviderConfigs(ctx);
      const provider = runtime?.find((candidate) => candidate.id === id);
      if (provider) {
        json(res, 200, {
          provider: { ...publicProvider(ctx, provider), status: 'available', source: 'opencode-runtime' },
        });
        return true;
      }
    }
    const provider = (await configurations(ctx)).find((candidate) => candidate.id === id);
    if (!provider) json(res, 404, { code: 'provider-not-found', error: `Provider not found: ${id}` });
    else json(res, 200, { provider: publicProvider(ctx, provider) });
    return true;
  }

  if (providerActionMatch && method === 'POST') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const id = decodeURIComponent(providerActionMatch[1]);
    const action = providerActionMatch[2];
    const providers = await configurations(ctx);
    const current = providers.find((provider) => provider.id === id);
    if (!current) {
      json(res, 404, { code: 'provider-not-found', error: `Provider not found: ${id}` });
      return true;
    }
    if (action === 'test') {
      if (await isRuntimeProvider(ctx, id)) {
        try {
          const health = await ctx.opencodeRuntime.health();
          json(res, 200, { providerId: id, status: health.healthy ? 'healthy' : 'unhealthy', health });
        } catch (error) {
          json(res, 422, {
            code: 'connection-failed',
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return true;
      }
      try {
        const health = await ctx.providerManager.health(id);
        json(res, 200, { providerId: id, status: health?.status ?? 'unhealthy', health });
      } catch (error) {
        json(res, 422, {
          code: 'connection-failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }
    if (action === 'discover-models') {
      if (await isRuntimeProvider(ctx, id)) {
        const runtime = await runtimeProviderConfigs(ctx);
        const provider = runtime?.find((candidate) => candidate.id === id);
        if (!provider) {
          json(res, 409, { code: 'provider-not-found', error: 'Runtime provider is no longer discovered' });
          return true;
        }
        json(res, 200, {
          provider: { ...publicProvider(ctx, provider), status: 'available', source: 'opencode-runtime' },
          discovered: provider.models.length,
        });
        return true;
      }
      const provider = ctx.providerManager.getProvider(id);
      if (!provider) {
        json(res, 409, { code: 'provider-disabled', error: 'Enable the provider before discovering models' });
        return true;
      }
      const discovered = (await provider.listModels()).map(modelConfig);
      const existing = new Map(current.models.map((model) => [model.id, model]));
      const merged = discovered.map((model) => ({
        ...model,
        enabled: existing.get(model.id)?.enabled ?? model.enabled,
      }));
      for (const model of current.models)
        if (!merged.some((candidate) => candidate.id === model.id)) merged.push(model);
      const updated = {
        ...current,
        models: merged,
        revision: (current.revision ?? 1) + 1,
        updatedAt: new Date().toISOString(),
      };
      await replaceConfiguration(ctx, providers, updated, current, readCredentials(ctx).keys[id]);
      json(res, 200, { provider: publicProvider(ctx, updated), discovered: discovered.length });
      return true;
    }
    const enabled = action === 'enable';
    // Runtime providers are governed by the OpenCode server; enable/disable is
    // an advisory metadata override only and never rewrites runtime state.
    if (await isRuntimeProvider(ctx, id)) {
      const runtime = await runtimeProviderConfigs(ctx);
      const provider = runtime?.find((candidate) => candidate.id === id);
      if (!provider) {
        json(res, 404, { code: 'provider-not-found', error: `Provider not found: ${id}` });
        return true;
      }
      json(res, 200, {
        provider: {
          ...publicProvider(ctx, provider),
          status: enabled ? 'available' : 'disabled',
          enabled,
          source: 'opencode-runtime',
          note: 'availability governed by the OpenCode runtime',
        },
      });
      return true;
    }
    const affectedAssignments = enabled ? [] : routingAssignments(ctx, id);
    if (affectedAssignments.length) {
      json(res, 409, {
        code: 'provider-in-use',
        error: 'Provider is assigned by active routing defaults',
        affectedAssignments,
      });
      return true;
    }
    const updated = {
      ...current,
      enabled,
      revision: (current.revision ?? 1) + 1,
      updatedAt: new Date().toISOString(),
    };
    await replaceConfiguration(ctx, providers, updated, current, readCredentials(ctx).keys[id]);
    json(res, 200, { provider: publicProvider(ctx, updated) });
    return true;
  }

  if (credentialMatch && (method === 'POST' || method === 'DELETE')) {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const id = decodeURIComponent(credentialMatch[1]);
    const providers = await configurations(ctx);
    const provider = providers.find((candidate) => candidate.id === id);
    if (!provider) {
      json(res, 404, { code: 'provider-not-found', error: `Provider not found: ${id}` });
      return true;
    }
    const credentials = readCredentials(ctx);
    if (method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}') as { apiKey?: string };
      if (!body.apiKey?.trim()) {
        json(res, 400, { code: 'invalid-credential', error: 'API key is required' });
        return true;
      }
      credentials.keys[id] = body.apiKey;
    } else delete credentials.keys[id];
    writeCredentials(ctx, credentials);
    await refreshRuntime(ctx, provider, credentials.keys[id]);
    ctx.publish({
      id: `provider-credential-${id}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      category: 'system',
      type: method === 'POST' ? 'provider.credential-updated' : 'provider.credential-removed',
      actor: { id: 'provider-configuration', name: 'Provider Configuration Service', type: 'system' },
      resource: { type: 'ai-provider', id, name: provider.name },
      message: `Provider credential ${method === 'POST' ? 'updated' : 'removed'}`,
      metadata: { providerId: id },
    });
    json(res, 200, { provider: publicProvider(ctx, provider) });
    return true;
  }

  if (modelsMatch && method === 'POST') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const id = decodeURIComponent(modelsMatch[1]);
    const model = JSON.parse((await readBody(req)) || '{}') as ModelConfig;
    const providers = await configurations(ctx);
    const current = providers.find((provider) => provider.id === id);
    if (!current) {
      json(res, 404, { code: 'provider-not-found', error: `Provider not found: ${id}` });
      return true;
    }
    const validationError = validateModel(model);
    if (validationError) {
      json(res, 400, { code: 'invalid-model', error: validationError });
      return true;
    }
    if (current.models.some((candidate) => candidate.id === model.id)) {
      json(res, 409, { code: 'model-exists', error: `Model already exists: ${model.id}` });
      return true;
    }
    const updated = {
      ...current,
      models: [...current.models, model],
      revision: (current.revision ?? 1) + 1,
      updatedAt: new Date().toISOString(),
    };
    await replaceConfiguration(ctx, providers, updated, current, readCredentials(ctx).keys[id]);
    json(res, 201, { model, provider: publicProvider(ctx, updated) });
    return true;
  }

  if (modelMatch && (method === 'PATCH' || method === 'DELETE')) {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const providerId = decodeURIComponent(modelMatch[1]);
    const modelId = decodeURIComponent(modelMatch[2]);
    const providers = await configurations(ctx);
    const current = providers.find((provider) => provider.id === providerId);
    const existing = current?.models.find((model) => model.id === modelId);
    if (!current || !existing) {
      json(res, 404, { code: 'model-not-found', error: `Model not found: ${providerId}/${modelId}` });
      return true;
    }
    const affectedAssignments = routingAssignments(ctx, providerId, modelId);
    if (method === 'DELETE' && affectedAssignments.length) {
      json(res, 409, {
        code: 'model-in-use',
        error: 'Model is assigned by active routing defaults',
        affectedAssignments,
      });
      return true;
    }
    const mutation = method === 'PATCH' ? (JSON.parse((await readBody(req)) || '{}') as ModelMutation) : undefined;
    const nextModel = mutation ? { ...existing, ...mutation, id: modelId } : undefined;
    const validationError = nextModel ? validateModel(nextModel) : undefined;
    if (validationError) {
      json(res, 400, { code: 'invalid-model', error: validationError });
      return true;
    }
    const models = nextModel
      ? current.models.map((model) => (model.id === modelId ? nextModel : model))
      : current.models.filter((model) => model.id !== modelId);
    const updated = {
      ...current,
      models,
      revision: (current.revision ?? 1) + 1,
      updatedAt: new Date().toISOString(),
    };
    await replaceConfiguration(ctx, providers, updated, current, readCredentials(ctx).keys[providerId]);
    json(res, 200, { model: nextModel, removed: !nextModel, provider: publicProvider(ctx, updated) });
    return true;
  }

  if (method === 'POST' && p === '/api/providers') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const body = JSON.parse((await readBody(req)) || '{}') as ProviderMutation;
    if (!body.id || !body.name || !body.baseUrl) {
      json(res, 400, { error: 'id, name, and baseUrl are required' });
      return true;
    }
    const validationError = validateProviderId(body.id) ?? validateBaseUrl(body.baseUrl);
    if (validationError) {
      json(res, 400, { code: 'invalid-provider', error: validationError });
      return true;
    }
    const providers = await configurations(ctx);
    if (providers.some((provider) => provider.id === body.id)) {
      json(res, 409, { error: `Provider already exists: ${body.id}` });
      return true;
    }
    const now = new Date().toISOString();
    const config: ProviderConfig = {
      id: body.id,
      name: body.name,
      baseUrl: body.baseUrl,
      apiKeyEnv: body.apiKeyEnv ?? undefined,
      enabled: body.enabled ?? true,
      models: body.models ?? [],
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    const invalidModel = config.models.map(validateModel).find(Boolean);
    if (invalidModel) {
      json(res, 400, { code: 'invalid-model', error: invalidModel });
      return true;
    }
    if (body.apiKey) {
      const credentials = readCredentials(ctx);
      credentials.keys[config.id] = body.apiKey;
      writeCredentials(ctx, credentials);
    }
    await replaceConfiguration(ctx, providers, config, undefined, body.apiKey ?? undefined);
    json(res, 201, { provider: publicProvider(ctx, config) });
    return true;
  }

  const providerMatch = p.match(/^\/api\/providers\/([^/]+)$/);
  if (providerMatch && method === 'PATCH') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const id = decodeURIComponent(providerMatch[1]);
    const body = JSON.parse((await readBody(req)) || '{}') as ProviderMutation;
    const providers = await configurations(ctx);
    const index = providers.findIndex((provider) => provider.id === id);
    if (index < 0) {
      json(res, 404, { error: `Provider not found: ${id}` });
      return true;
    }
    const current = providers[index];
    if (body.revision !== undefined && body.revision !== (current.revision ?? 1)) {
      json(res, 409, {
        code: 'revision-conflict',
        error: 'Provider configuration changed',
        current: publicProvider(ctx, current),
      });
      return true;
    }
    const affectedAssignments = body.enabled === false ? routingAssignments(ctx, id) : [];
    if (affectedAssignments.length && !body.force) {
      json(res, 409, {
        code: 'provider-in-use',
        error: 'Provider is assigned by active routing defaults',
        affectedAssignments,
      });
      return true;
    }
    const updated: ProviderConfig = {
      ...current,
      name: body.name ?? current.name,
      baseUrl: body.baseUrl ?? current.baseUrl,
      apiKeyEnv: body.apiKeyEnv === null ? undefined : (body.apiKeyEnv ?? current.apiKeyEnv),
      enabled: body.enabled ?? current.enabled,
      models: body.models ?? current.models,
      revision: (current.revision ?? 1) + 1,
      updatedAt: new Date().toISOString(),
    };
    const credentials = readCredentials(ctx);
    if (body.apiKey === null) delete credentials.keys[id];
    else if (body.apiKey) credentials.keys[id] = body.apiKey;
    if (body.apiKey !== undefined) writeCredentials(ctx, credentials);
    const validationError = validateBaseUrl(updated.baseUrl) ?? updated.models.map(validateModel).find(Boolean);
    if (validationError) {
      json(res, 400, { code: 'invalid-provider', error: validationError });
      return true;
    }
    await replaceConfiguration(ctx, providers, updated, current, credentials.keys[id]);
    json(res, 200, { provider: publicProvider(ctx, updated) });
    return true;
  }

  if (providerMatch && method === 'DELETE') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const id = decodeURIComponent(providerMatch[1]);
    if (BUILT_IN_PROVIDERS.has(id)) {
      json(res, 400, { error: 'Built-in providers can be disabled but not deleted' });
      return true;
    }
    const providers = await configurations(ctx);
    if (!providers.some((provider) => provider.id === id)) {
      json(res, 404, { error: `Provider not found: ${id}` });
      return true;
    }
    const affectedAssignments = routingAssignments(ctx, id);
    if (affectedAssignments.length) {
      json(res, 409, {
        code: 'provider-in-use',
        error: 'Provider is assigned by active routing defaults',
        affectedAssignments,
      });
      return true;
    }
    await saveConfigurations(
      ctx,
      providers.filter((provider) => provider.id !== id),
    );
    const credentials = readCredentials(ctx);
    delete credentials.keys[id];
    writeCredentials(ctx, credentials);
    if (ctx.providerManager.getProvider(id)) await ctx.providerManager.unload(id);
    ctx.publish({
      id: `provider-removed-${id}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      category: 'system',
      type: 'provider.deleted',
      actor: { id: 'provider-configuration', name: 'Provider Configuration Service', type: 'system' },
      resource: { type: 'ai-provider', id, name: id },
      message: `Provider ${id} deleted`,
      metadata: { providerId: id },
    });
    json(res, 200, { removed: true, id });
    return true;
  }

  return false;
}
