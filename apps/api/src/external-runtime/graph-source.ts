/**
 * External runtime graph source — contributes normalized entities and
 * relationships to the Engineering Graph.
 *
 * Durable, low-noise projection: runtime instances, agents, providers, MCP
 * servers, plugins, and external sessions. Event-only information stays in the
 * event store. Missing file entities never crash ingestion.
 */

import type { EntitySource, GraphEntity, GraphRelationship, RelationshipSource } from '@vestara/engineering-graph';
import { entityId } from '@vestara/engineering-graph';
import type { ExternalRuntimeInstance } from '@vestara/external-runtime';

export interface ExternalRuntimeGraphData {
  readonly instances: readonly ExternalRuntimeInstance[];
  readonly sessions: readonly {
    runtimeInstanceId: string;
    externalSessionId: string;
    title?: string;
    status: string;
    integrationLevel: string;
    agentId?: string;
    modelId?: string;
  }[];
  readonly agents: Readonly<Record<string, readonly { name: string; model?: { modelId?: string } }[]>>;
  readonly providers: Readonly<Record<string, readonly { providerId: string }[]>>;
  readonly mcp: Readonly<Record<string, readonly { name: string }[]>>;
  readonly plugins: Readonly<Record<string, readonly { name: string }[]>>;
  readonly skills: Readonly<Record<string, readonly { name: string; description?: string }[]>>;
  readonly models: Readonly<Record<string, readonly { providerId: string; modelId: string }[]>>;
}

export function externalRuntimeGraphSource(getData: () => Promise<ExternalRuntimeGraphData>): {
  entitySource: EntitySource;
  relationshipSource: RelationshipSource;
} {
  const entitySource: EntitySource = {
    kind: 'runtime',
    priority: 25,
    collect: async () => {
      const data = await getData().catch(
        () =>
          ({
            instances: [],
            sessions: [],
            agents: {},
            providers: {},
            mcp: {},
            plugins: {},
            skills: {},
            models: {},
          }) as ExternalRuntimeGraphData,
      );
      const entities: GraphEntity[] = [];

      for (const instance of data.instances) {
        entities.push({
          id: runtimeEntityId(instance),
          kind: 'runtime',
          label: `${instance.displayName} (external)`,
          status: instance.connectionStatus,
          owner: 'external-runtime',
          updatedAt: instance.lastSeenAt,
          meta: {
            runtimeType: instance.runtimeType,
            integrationLevel: instance.integrationLevel,
            verificationStatus: instance.verificationStatus,
            availableCapabilities: instance.availableCapabilities,
            version: instance.version,
            isPrimary: instance.isPrimary,
            isSecondary: instance.isSecondary,
          },
        });
      }

      for (const [instanceId, agents] of Object.entries(data.agents)) {
        for (const agent of agents) {
          entities.push({
            id: agentEntityId(instanceId, agent.name),
            kind: 'agent',
            label: `${agent.name} (external)`,
            owner: 'external-runtime',
            meta: { runtimeInstanceId: instanceId, external: true, model: agent.model?.modelId },
          });
        }
      }
      for (const [instanceId, providers] of Object.entries(data.providers)) {
        for (const provider of providers) {
          entities.push({
            id: providerEntityId(instanceId, provider.providerId),
            kind: 'provider',
            label: provider.providerId,
            owner: 'external-runtime',
            meta: { runtimeInstanceId: instanceId, providerId: provider.providerId },
          });
        }
      }
      for (const [instanceId, servers] of Object.entries(data.mcp)) {
        for (const server of servers) {
          entities.push({
            id: mcpEntityId(instanceId, server.name),
            kind: 'service',
            label: `mcp:${server.name}`,
            owner: 'external-runtime',
            meta: { runtimeInstanceId: instanceId },
          });
        }
      }
      for (const [instanceId, plugins] of Object.entries(data.plugins)) {
        for (const plugin of plugins) {
          entities.push({
            id: pluginEntityId(instanceId, plugin.name),
            kind: 'module',
            label: `plugin:${plugin.name}`,
            owner: 'external-runtime',
            meta: { runtimeInstanceId: instanceId },
          });
        }
      }
      for (const [instanceId, skills] of Object.entries(data.skills)) {
        for (const skill of skills) {
          entities.push({
            id: skillEntityId(instanceId, skill.name),
            kind: 'skill',
            label: skill.name,
            description: skill.description,
            owner: 'external-runtime',
            meta: { runtimeInstanceId: instanceId },
          });
        }
      }
      for (const [instanceId, models] of Object.entries(data.models)) {
        for (const model of models) {
          entities.push({
            id: modelEntityId(instanceId, model.providerId, model.modelId),
            kind: 'model',
            label: model.modelId,
            owner: 'external-runtime',
            meta: { runtimeInstanceId: instanceId, providerId: model.providerId },
          });
        }
      }

      for (const session of data.sessions) {
        entities.push({
          id: sessionEntityId(session),
          kind: 'session',
          label: `external session ${session.externalSessionId}`,
          status: session.status,
          owner: 'external-runtime',
          meta: {
            runtimeInstanceId: session.runtimeInstanceId,
            integrationLevel: session.integrationLevel,
            agentId: session.agentId,
            modelId: session.modelId,
          },
        });
      }

      return dedupe(entities);
    },
  };

  const relationshipSource: RelationshipSource = {
    collect: async () => {
      const data = await getData().catch(
        () =>
          ({
            instances: [],
            sessions: [],
            agents: {},
            providers: {},
            mcp: {},
            plugins: {},
            skills: {},
            models: {},
          }) as ExternalRuntimeGraphData,
      );
      const rels: GraphRelationship[] = [];
      const repoId = entityId('repository', repoNameOf());

      for (const instance of data.instances) {
        const runtimeId = runtimeEntityId(instance);
        rels.push({
          from: repoId,
          to: runtimeId,
          type: 'owns',
          label: 'uses external runtime',
          timestamp: instance.lastSeenAt,
        });

        for (const agent of data.agents[instance.id] ?? []) {
          rels.push({
            from: runtimeId,
            to: agentEntityId(instance.id, agent.name),
            type: 'owns',
            label: 'defines agent',
            timestamp: instance.lastSeenAt,
          });
        }
        for (const provider of data.providers[instance.id] ?? []) {
          rels.push({
            from: runtimeId,
            to: providerEntityId(instance.id, provider.providerId),
            type: 'owns',
            label: 'configures provider',
            timestamp: instance.lastSeenAt,
          });
        }
        for (const server of data.mcp[instance.id] ?? []) {
          rels.push({
            from: runtimeId,
            to: mcpEntityId(instance.id, server.name),
            type: 'calls',
            label: 'connects mcp',
            timestamp: instance.lastSeenAt,
          });
        }
        for (const plugin of data.plugins[instance.id] ?? []) {
          rels.push({
            from: runtimeId,
            to: pluginEntityId(instance.id, plugin.name),
            type: 'owns',
            label: 'loads plugin',
            timestamp: instance.lastSeenAt,
          });
        }
        for (const skill of data.skills[instance.id] ?? []) {
          rels.push({
            from: runtimeId,
            to: skillEntityId(instance.id, skill.name),
            type: 'owns',
            label: 'advertises skill',
            timestamp: instance.lastSeenAt,
          });
        }
        for (const model of data.models[instance.id] ?? []) {
          rels.push({
            from: runtimeId,
            to: modelEntityId(instance.id, model.providerId, model.modelId),
            type: 'provides',
            label: 'offers model',
            timestamp: instance.lastSeenAt,
          });
        }
      }

      for (const session of data.sessions) {
        const sessionId = sessionEntityId(session);
        const runtimeId = runtimeEntityId({
          id: session.runtimeInstanceId,
          runtimeType: 'unknown',
        } as ExternalRuntimeInstance);
        rels.push({
          from: runtimeId,
          to: sessionId,
          type: 'executes',
          label: 'started session',
          timestamp: new Date().toISOString(),
        });
        if (session.agentId) {
          rels.push({
            from: sessionId,
            to: agentEntityId(session.runtimeInstanceId, session.agentId),
            type: 'executes',
            label: 'uses agent',
            timestamp: new Date().toISOString(),
          });
        }
      }

      return rels;
    },
  };

  return { entitySource, relationshipSource };
}

function runtimeEntityId(instance: { id: string; runtimeType: string }): string {
  return entityId('runtime', `external/${instance.runtimeType}/${instance.id}`);
}

function agentEntityId(instanceId: string, name: string): string {
  return entityId('agent', `external/${instanceId}/${name}`);
}

function providerEntityId(instanceId: string, providerId: string): string {
  return entityId('provider', `external/${instanceId}/${providerId}`);
}

function mcpEntityId(instanceId: string, name: string): string {
  return entityId('service', `external-mcp/${instanceId}/${name}`);
}

function pluginEntityId(instanceId: string, name: string): string {
  return entityId('module', `external-plugin/${instanceId}/${name}`);
}

function skillEntityId(instanceId: string, name: string): string {
  return entityId('skill', `external/${instanceId}/${name}`);
}

function modelEntityId(instanceId: string, providerId: string, modelId: string): string {
  return entityId('model', `external/${instanceId}/${providerId}/${modelId}`);
}

function sessionEntityId(session: { externalSessionId: string }): string {
  return entityId('session', `external/${session.externalSessionId}`);
}

function dedupe(entities: GraphEntity[]): GraphEntity[] {
  const seen = new Set<string>();
  return entities.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}

function repoNameOf(): string {
  return process.cwd().split('/').filter(Boolean).pop() ?? 'workspace';
}
