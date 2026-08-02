/**
 * Entity-id builders for the Engineering Workforce Control Center.
 *
 * Mirrors apps/api/src/external-runtime/{service,graph-source}.ts so every
 * row, badge, agent, runtime, skill, session, provider and model can deep-link
 * into the Universal Inspector via the window `vestara:inspect` event.
 */

import { inspectEntity } from '../graph/GraphContext';

export function entityLink(kind: string, id: string): string {
  return `${kind}://${id}`;
}

export function runtimeEntityId(instanceId: string, runtimeType: string): string {
  return entityLink('runtime', `external/${runtimeType}/${instanceId}`);
}

export function agentEntityId(instanceId: string, name: string): string {
  return entityLink('agent', `external/${instanceId}/${name}`);
}

export function providerEntityId(instanceId: string, providerId: string): string {
  return entityLink('provider', `external/${instanceId}/${providerId}`);
}

export function modelEntityId(instanceId: string, providerId: string, modelId: string): string {
  return entityLink('model', `external/${instanceId}/${providerId}/${modelId}`);
}

export function skillEntityId(instanceId: string, name: string): string {
  return entityLink('skill', `external/${instanceId}/${name}`);
}

export function mcpEntityId(instanceId: string, name: string): string {
  return entityLink('service', `external-mcp/${instanceId}/${name}`);
}

export function pluginEntityId(instanceId: string, name: string): string {
  return entityLink('module', `external-plugin/${instanceId}/${name}`);
}

export function commandEntityId(instanceId: string, name: string): string {
  return entityLink('command', `external/${instanceId}/${name}`);
}

export function permissionEntityId(instanceId: string, key: string): string {
  return entityLink('capability', `permission/${instanceId}/${key}`);
}

export function sessionEntityId(sessionId: string): string {
  return entityLink('session', `external/${sessionId}`);
}

export function fileEntityId(filePath: string): string {
  return entityLink('filesystem', filePath.replace(/^\//, ''));
}

export function openInspector(entityId: string): void {
  if (entityId) inspectEntity(entityId);
}
