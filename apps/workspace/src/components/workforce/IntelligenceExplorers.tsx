/**
 * Runtime intelligence explorers — Commands, MCP Servers, Plugins, Providers,
 * Models, Permissions, Instructions.
 *
 * Data is fetched on demand per runtime through the generic intelligence
 * endpoints and rendered through the shared EntityExplorer shell. Each explorer
 * is a plain mapping of the runtime protocol, so new runtimes appear without
 * bespoke UI.
 */

import { useEffect, useMemo, useState } from 'react';
import { externalRuntimeApi, type ExternalRuntimeInstance } from '../../lib/external-runtime';
import { EntityExplorer, type EntityExplorerItem } from './EntityExplorer';
import { agentEntityId, commandEntityId, modelEntityId, mcpEntityId, permissionEntityId, pluginEntityId, providerEntityId, skillEntityId } from './inspector';

export type ExplorerKind = 'commands' | 'mcp' | 'plugins' | 'providers' | 'models' | 'permissions' | 'instructions';

const EXPLORER_LABEL: Record<ExplorerKind, string> = {
  commands: 'Commands',
  mcp: 'MCP Servers',
  plugins: 'Plugins',
  providers: 'Providers',
  models: 'Models',
  permissions: 'Permissions',
  instructions: 'Instructions',
};

export const EXPLORER_KINDS: ExplorerKind[] = ['commands', 'mcp', 'plugins', 'providers', 'models', 'permissions', 'instructions'];

export function IntelligenceExplorers({ data }: { data: { runtimes: ExternalRuntimeInstance[] } | null }) {
  const [kind, setKind] = useState<ExplorerKind>('commands');
  return (
    <div>
      <div className="flex gap-1 flex-wrap mb-3 border-b border-(--vestara-accent-border) pb-2">
        {EXPLORER_KINDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setKind(id)}
            className={`text-[10px] px-2.5 py-1.5 rounded transition-colors cursor-pointer ${
              kind === id ? 'bg-(--vestara-accent-bg) text-(--vestara-text) border border-(--vestara-accent-border)' : 'text-(--vestara-text-2) hover:text-(--vestara-text)'
            }`}
          >
            {EXPLORER_LABEL[id]}
          </button>
        ))}
      </div>
      <KindExplorer data={data} kind={kind} />
    </div>
  );
}

function KindExplorer({ data, kind }: { data: { runtimes: ExternalRuntimeInstance[] } | null; kind: ExplorerKind }) {
  const [items, setItems] = useState<EntityExplorerItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadExplorer(data, kind).then((rows) => {
      if (cancelled) return;
      setItems(rows);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [data, kind]);

  if (!data) return <p className="text-[11px] text-(--vestara-text-muted) animate-pulse">Loading workforce…</p>;
  if (loading) return <p className="text-[11px] text-(--vestara-text-muted) animate-pulse">Loading {EXPLORER_LABEL[kind].toLowerCase()}…</p>;
  return <EntityExplorer items={items} title={EXPLORER_LABEL[kind]} />;
}

async function loadExplorer(data: { runtimes: ExternalRuntimeInstance[] } | null, kind: ExplorerKind): Promise<EntityExplorerItem[]> {
  if (!data) return [];
  const rows: EntityExplorerItem[] = [];
  await Promise.all(
    data.runtimes.map(async (runtime) => {
      try {
        if (kind === 'permissions') {
          const res = await externalRuntimeApi.permissions(runtime.id);
          for (const rule of res?.permissions ?? []) {
            rows.push({
              id: `permission-${runtime.id}-${rule.capability}-${rule.pattern ?? ''}-${rule.decision}`,
              name: rule.capability,
              description: rule.pattern ? `pattern ${rule.pattern}` : undefined,
              status: rule.decision,
              scope: rule.scope,
              provenance: rule.provenance,
              runtimeType: runtime.runtimeType,
              runtimeName: runtime.displayName,
              entityId: permissionEntityId(runtime.id, `${rule.capability}-${rule.pattern ?? ''}`),
            });
          }
          return;
        }
        const res = await externalRuntimeApi.intelligence<Record<string, unknown>>(runtime.id, kind);
        const list = (res?.[kind] ?? []) as Array<Record<string, unknown>>;
        for (const entry of list) {
          rows.push(mapEntry(kind, runtime, entry));
        }
      } catch {
        /* best-effort per runtime */
      }
    }),
  );
  return rows;
}

function mapEntry(kind: ExplorerKind, runtime: ExternalRuntimeInstance, entry: Record<string, unknown>): EntityExplorerItem {
  const str = (key: string) => (typeof entry[key] === 'string' ? String(entry[key]) : undefined);
  const name = str('name') ?? str('id') ?? 'unknown';
  const base: EntityExplorerItem = {
    id: `${kind}-${runtime.id}-${name}`,
    name,
    runtimeType: runtime.runtimeType,
    runtimeName: runtime.displayName,
    lastObserved: str('updatedAt') ?? str('discoveredAt'),
  };
  switch (kind) {
    case 'commands':
      return {
        ...base,
        description: str('description') ?? (typeof entry['redactedTemplate'] === 'string' ? `template ${String(entry['redactedTemplate']).slice(0, 80)}` : undefined),
        status: entry['enabled'] === false ? 'disabled' : 'enabled',
        scope: str('sourceScope'),
        provenance: str('sourceScope'),
        entityId: commandEntityId(runtime.id, name),
        badges: [str('agentId')].filter(Boolean) as string[],
      };
    case 'mcp':
      return {
        ...base,
        description: str('command') ?? str('url'),
        status: str('connectionState'),
        provenance: str('transport'),
        entityId: mcpEntityId(runtime.id, name),
        badges: [`${(entry['availableTools'] as unknown[] | undefined)?.length ?? 0} tools`],
      };
    case 'plugins':
      return {
        ...base,
        description: str('packageName'),
        status: str('loadStatus'),
        provenance: str('sourceType'),
        entityId: pluginEntityId(runtime.id, name),
        badges: (entry['capabilities'] as unknown[] | undefined)?.slice(0, 2).map(String) ?? [],
      };
    case 'providers':
      return {
        ...base,
        description: str('displayName'),
        status: entry['configured'] === true ? 'configured' : 'unconfigured',
        provenance: str('credentialSource'),
        entityId: providerEntityId(runtime.id, str('providerId') ?? name),
        badges: [`${(entry['models'] as unknown[] | undefined)?.length ?? 0} models`],
      };
    case 'models':
      return {
        ...base,
        description: str('displayName'),
        provenance: str('providerId'),
        entityId: modelEntityId(runtime.id, str('providerId') ?? 'unknown', name),
        badges: [typeof entry['contextLimit'] === 'number' ? `${entry['contextLimit']} ctx` : '', entry['supportsTools'] === true ? 'tools' : ''].filter(Boolean),
      };
    case 'instructions':
      return {
        ...base,
        description: entry['active'] === false ? 'inactive' : undefined,
        status: entry['active'] === false ? 'inactive' : 'active',
        scope: str('scope'),
        provenance: str('format') ?? str('provenance'),
        entityId: agentEntityId(runtime.id, `instructions:${name}`),
      };
    case 'permissions':
      return {
        ...base,
        status: str('decision'),
        scope: str('scope'),
        provenance: str('provenance'),
      };
  }
}
