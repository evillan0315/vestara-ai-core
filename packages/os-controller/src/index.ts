/**
 * @vestara/os-controller — Native OS service management.
 *
 * Generates systemd unit files from the declarative AIOSManifest.
 * The manifest is the canonical source of truth — systemd units
 * are derived from it, not maintained separately.
 *
 * Architecture Traceability:
 *   AI-OS-ARCHITECTURE.md — Core OS Services
 *   AI-OS-MANIFEST — Declarative service topology
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AIOSManifest } from './manifest';

export type { ServiceStatus } from './lifecycle';
export { LifecycleController } from './lifecycle';
export type { AIOSManifest, AIOSServiceDef } from './manifest';
export { createDefaultManifest, getServicesByLayer, renderManifest } from './manifest';

/**
 * Generate systemd unit files from a manifest.
 */
export function generateSystemdUnits(manifest: AIOSManifest, outputDir: string): string[] {
  const files: string[] = [];

  for (const svc of manifest.services) {
    if (!svc.enabled) continue;

    const unit = `[Unit]
Description=${svc.name} — ${svc.description}
After=${svc.deps.join(' ') || 'network.target'}
${svc.deps.length > 0 ? `Requires=${svc.deps.join(' ')}` : ''}
PartOf=${manifest.target}

[Service]
Type=simple
ExecStart=${svc.execStart}
Restart=${svc.restart}
RestartSec=${svc.restartSec}
Environment=NODE_ENV=production
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=${manifest.target}
`;

    const filePath = path.join(outputDir, `${svc.id}.service`);
    fs.writeFileSync(filePath, unit);
    files.push(filePath);
  }

  return files;
}

/**
 * Generate the vestara.target that groups all enabled services.
 */
export function generateTarget(manifest: AIOSManifest, outputDir: string): string {
  const enabled = manifest.services.filter((s) => s.enabled);
  const wants = enabled.map((s) => `${s.id}.service`).join(' ');

  const target = `[Unit]
Description=${manifest.description}
Requires=${wants}
After=${wants}
AllowIsolate=yes

[Install]
WantedBy=multi-user.target
`;

  const filePath = path.join(outputDir, manifest.target);
  fs.writeFileSync(filePath, target);
  return filePath;
}

/**
 * Get service status. Queries systemd if available; falls back to manifest data.
 */
export function getServiceStatus(
  manifest: AIOSManifest,
): Array<{ id: string; name: string; layer: number; status: string }> {
  try {
    const { execSync } = require('node:child_process');
    const output = execSync('systemctl list-units --type=service --all --no-legend 2>/dev/null | grep vestara-', {
      encoding: 'utf-8',
      timeout: 3000,
    });
    const lines = output.trim().split('\n').filter(Boolean);
    const statuses = new Map<string, string>();
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3) {
        const name = parts[0].replace('.service', '');
        const sub = parts[2];
        statuses.set(name, sub === 'active' ? 'running' : sub === 'inactive' ? 'stopped' : sub);
      }
    }
    return manifest.services.map((s) => ({
      id: s.id,
      name: s.name,
      layer: s.layer,
      status: statuses.get(s.id) || 'stopped',
    }));
  } catch {
    return manifest.services.map((s) => ({ id: s.id, name: s.name, layer: s.layer, status: 'simulated' }));
  }
}

/**
 * Render service status grouped by layer.
 */
export function renderServiceStatus(
  services: Array<{ id: string; name: string; layer: number; status: string }>,
): string {
  const lines: string[] = ['Vestara AI OS Services:'];
  let currentLayer = 0;
  for (const s of services) {
    if (s.layer !== currentLayer) {
      currentLayer = s.layer;
      lines.push(`\nLayer ${currentLayer}:`);
    }
    const icon = s.status === 'running' ? '●' : s.status === 'stopped' ? '○' : s.status === 'simulated' ? '◇' : '○';
    const note = s.status === 'simulated' ? ' (simulated)' : '';
    lines.push(`  ${icon} ${s.id.padEnd(25)} ${s.name}${note}`);
  }
  return lines.join('\n');
}
