/**
 * AIOSManifest — Declarative service topology for the Vestara AI OS.
 *
 * The manifest is the canonical source of truth for service definitions,
 * dependencies, boot order, health checks, and deployment profiles.
 * The os-controller generates systemd units from this manifest,
 * rather than constructing them procedurally.
 *
 * Architecture Traceability:
 *   AI-OS-ARCHITECTURE.md — Core OS Services
 */

export interface AIOSServiceDef {
  id: string;
  name: string;
  description: string;
  layer: number;
  deps: string[];
  execStart: string;
  restart: 'always' | 'on-failure' | 'no';
  restartSec: number;
  enabled: boolean;
  profile?: string[];
}

export interface AIOSProfile {
  id: string;
  name: string;
  description: string;
  services: string[]; // service IDs to include
}

export interface AIOSManifest {
  version: string;
  target: string;
  description: string;
  services: AIOSServiceDef[];
  profiles: AIOSProfile[];
  generatedAt: string;
}

const VERSION = '1.0.0';
const EXEC_PREFIX = '/usr/bin/node /opt/vestara/packages';

export function createDefaultManifest(): AIOSManifest {
  const services: AIOSServiceDef[] = [
    {
      id: 'vestara-kernel',
      name: 'Vestara Kernel',
      description: 'Core lifecycle, service registry',
      layer: 1,
      deps: [],
      execStart: `${EXEC_PREFIX}/kernel/dist/index.js`,
      restart: 'on-failure',
      restartSec: 5,
      enabled: true,
    },
    {
      id: 'vestara-workspace',
      name: 'Workspace Manager',
      description: 'Session management, workspace lifecycle',
      layer: 2,
      deps: ['vestara-kernel'],
      execStart: `${EXEC_PREFIX}/workspace/dist/index.js`,
      restart: 'on-failure',
      restartSec: 5,
      enabled: true,
    },
    {
      id: 'vestara-knowledge',
      name: 'Knowledge Indexer',
      description: 'Background indexing, document parsing',
      layer: 3,
      deps: ['vestara-workspace'],
      execStart: `${EXEC_PREFIX}/knowledge/dist/index.js`,
      restart: 'on-failure',
      restartSec: 10,
      enabled: true,
    },
    {
      id: 'vestara-events',
      name: 'Event Broker',
      description: 'Event routing, subscription management',
      layer: 3,
      deps: ['vestara-kernel'],
      execStart: `${EXEC_PREFIX}/events-server/dist/index.js`,
      restart: 'on-failure',
      restartSec: 5,
      enabled: true,
    },
    {
      id: 'vestara-memory',
      name: 'Memory Daemon',
      description: 'Memory consolidation, importance scoring',
      layer: 3,
      deps: ['vestara-kernel'],
      execStart: `${EXEC_PREFIX}/memory/dist/index.js`,
      restart: 'on-failure',
      restartSec: 10,
      enabled: true,
    },
    {
      id: 'vestara-planning',
      name: 'Planning Engine',
      description: 'Plan orchestration, task scheduling',
      layer: 4,
      deps: ['vestara-knowledge'],
      execStart: `${EXEC_PREFIX}/workspace/dist/planning.js`,
      restart: 'on-failure',
      restartSec: 10,
      enabled: true,
    },
    {
      id: 'vestara-agent',
      name: 'Agent Scheduler',
      description: 'Agent orchestration, task dispatch',
      layer: 4,
      deps: ['vestara-workspace'],
      execStart: `${EXEC_PREFIX}/workspace/dist/agent-runtime.js`,
      restart: 'on-failure',
      restartSec: 10,
      enabled: true,
    },
    {
      id: 'vestara-implement',
      name: 'Implementation Engine',
      description: 'Change set execution, patch generation',
      layer: 5,
      deps: ['vestara-planning'],
      execStart: `${EXEC_PREFIX}/workspace/dist/implementation.js`,
      restart: 'on-failure',
      restartSec: 10,
      enabled: true,
    },
    {
      id: 'vestara-verify',
      name: 'Verification Engine',
      description: 'Automated verification, trend analysis',
      layer: 5,
      deps: ['vestara-implement'],
      execStart: `${EXEC_PREFIX}/workspace/dist/verification.js`,
      restart: 'on-failure',
      restartSec: 10,
      enabled: true,
    },
    {
      id: 'vestara-cloud',
      name: 'Cloud Controller',
      description: 'Remote execution, job queue',
      layer: 5,
      deps: ['vestara-kernel'],
      execStart: `${EXEC_PREFIX}/workspace/dist/cloud.js`,
      restart: 'on-failure',
      restartSec: 10,
      enabled: true,
    },
    {
      id: 'vestara-enterprise',
      name: 'Enterprise Controller',
      description: 'Policy enforcement, audit, RBAC',
      layer: 5,
      deps: ['vestara-kernel'],
      execStart: `${EXEC_PREFIX}/workspace/dist/enterprise.js`,
      restart: 'on-failure',
      restartSec: 10,
      enabled: true,
    },
    {
      id: 'vestara-plugin',
      name: 'Plugin Runtime',
      description: 'Plugin lifecycle, hook execution',
      layer: 5,
      deps: ['vestara-kernel'],
      execStart: `${EXEC_PREFIX}/workspace/dist/plugin-runtime.js`,
      restart: 'on-failure',
      restartSec: 5,
      enabled: true,
    },
    {
      id: 'vestara-monitor',
      name: 'Repository Monitor',
      description: 'File system watching, auto-indexing',
      layer: 6,
      deps: ['vestara-workspace', 'vestara-knowledge'],
      execStart: `${EXEC_PREFIX}/workspace/dist/monitor.js`,
      restart: 'on-failure',
      restartSec: 10,
      enabled: true,
    },
    {
      id: 'vestara-dashboard',
      name: 'Developer Dashboard',
      description: 'Workspace UI, live events',
      layer: 6,
      deps: ['vestara-events', 'vestara-workspace'],
      execStart: `${EXEC_PREFIX}/events-server/dist/index.js`,
      restart: 'on-failure',
      restartSec: 5,
      enabled: true,
    },
  ];

  const profiles: AIOSProfile[] = [
    {
      id: 'developer',
      name: 'Developer Workstation',
      description: 'Full engineering platform',
      services: services.filter((s) => s.enabled).map((s) => s.id),
    },
    {
      id: 'minimal',
      name: 'Minimal Runtime',
      description: 'Kernel + workspace only',
      services: ['vestara-kernel', 'vestara-workspace', 'vestara-events'],
    },
    {
      id: 'server',
      name: 'Headless Server',
      description: 'Background services without UI',
      services: [
        'vestara-kernel',
        'vestara-workspace',
        'vestara-knowledge',
        'vestara-memory',
        'vestara-planning',
        'vestara-agent',
        'vestara-cloud',
        'vestara-enterprise',
      ],
    },
  ];

  return {
    version: VERSION,
    target: 'vestara.target',
    description: 'Vestara AI OS — Native Service Topology',
    services,
    profiles,
    generatedAt: new Date().toISOString(),
  };
}

export function getServicesByLayer(manifest: AIOSManifest, layer?: number): AIOSServiceDef[] {
  if (layer) return manifest.services.filter((s) => s.layer === layer);
  return [...manifest.services].sort((a, b) => a.layer - b.layer);
}

export function getProfile(manifest: AIOSManifest, profileId: string): AIOSProfile | undefined {
  return manifest.profiles.find((p) => p.id === profileId);
}

export function renderManifest(manifest: AIOSManifest): string {
  const lines: string[] = [];
  lines.push(`AI OS Manifest v${manifest.version}`);
  lines.push(`Target: ${manifest.target}`);
  lines.push(`Services: ${manifest.services.length}`);
  lines.push(`Profiles: ${manifest.profiles.map((p) => p.id).join(', ')}`);
  lines.push('');

  let currentLayer = 0;
  for (const svc of getServicesByLayer(manifest)) {
    if (svc.layer !== currentLayer) {
      currentLayer = svc.layer;
      lines.push(`\nLayer ${currentLayer}:`);
    }
    const deps = svc.deps.length > 0 ? ` [deps: ${svc.deps.join(', ')}]` : '';
    lines.push(`  ${svc.enabled ? '✓' : '✗'} ${svc.id.padEnd(25)} ${svc.name}${deps}`);
  }

  return lines.join('\n');
}
