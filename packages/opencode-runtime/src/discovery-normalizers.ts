import type { OpenCodeAgentSummary, OpenCodeCommandSummary, OpenCodeProviderSummary } from './client/opencode-types';

// Pure normalization helpers for OpenCode discovery responses. They are
// renderer-free and unit-testable without an upstream server.

export function normalizeProviders(raw: unknown): OpenCodeProviderSummary[] {
  if (!raw || typeof raw !== 'object') return [];
  const record = raw as Record<string, unknown>;
  const all = Array.isArray(record.all) ? record.all : [];
  return all
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((provider) => {
      const id = typeof provider.id === 'string' ? provider.id : String(provider.id ?? '');
      const models = provider.models;
      const modelIds =
        models && typeof models === 'object'
          ? Object.keys(models)
              .filter((key) => typeof key === 'string' && key.length > 0)
              .sort()
          : [];
      const modelCount = modelIds.length;
      return {
        id,
        name: typeof provider.name === 'string' ? provider.name : undefined,
        source: typeof provider.source === 'string' ? provider.source : undefined,
        modelCount,
        models: modelIds,
      };
    });
}

export function normalizeAgents(raw: unknown): OpenCodeAgentSummary[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((agent) => ({
      name: typeof agent.name === 'string' ? agent.name : String(agent.name ?? ''),
      description: typeof agent.description === 'string' ? agent.description : undefined,
      mode: typeof agent.mode === 'string' ? agent.mode : undefined,
      native: typeof agent.native === 'boolean' ? agent.native : undefined,
    }));
}

export function normalizeCommands(raw: unknown): OpenCodeCommandSummary[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((command) => ({
      name: typeof command.name === 'string' ? command.name : String(command.name ?? ''),
      description: typeof command.description === 'string' ? command.description : undefined,
      source: typeof command.source === 'string' ? command.source : undefined,
    }));
}
