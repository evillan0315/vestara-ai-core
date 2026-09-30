import { describe, expect, it } from 'vitest';
import { resolveTool, TOOL_DESCRIPTORS } from '../src/diagnostics/collect';
import { classifyProcessHeapHealth, classifyToolchainVersions } from '../src/diagnostics/snapshots';

const completeVersions = {
  node: 'v22.23.2',
  npm: '10.9.8',
  pnpm: '12.4.2',
  yarn: '1.22.22',
  tsc: 'Version 5.9.3',
  python: 'Python 3.13.5',
  git: 'git version 2.47.3',
  docker: 'Docker version 27.0.0',
  'docker-compose': 'Docker Compose version v2.30.0',
  kubernetes: 'Client Version: v1.30.0',
  'github-cli': 'gh version 2.97.0',
  openssl: 'OpenSSL 3.5.6',
  sqlite: '3.46.0',
};

describe('diagnostics toolchain classification', () => {
  it('keeps optional missing tools from degrading the runtime snapshot', () => {
    const result = classifyToolchainVersions({
      ...completeVersions,
      yarn: null,
      docker: null,
      'docker-compose': null,
      kubernetes: null,
      sqlite: null,
    });

    expect(result).toMatchObject({
      available: 8,
      total: 13,
      health: 'healthy',
      missingRequiredTools: [],
      missingOptionalTools: ['yarn', 'docker', 'docker-compose', 'kubernetes', 'sqlite'],
    });
  });

  it('degrades the runtime snapshot when a required baseline tool is missing', () => {
    const result = classifyToolchainVersions({
      ...completeVersions,
      pnpm: null,
      docker: null,
    });

    expect(result).toMatchObject({
      health: 'degraded',
      missingRequiredTools: ['pnpm'],
      missingOptionalTools: ['docker'],
    });
  });
});

describe('diagnostics tool resolution', () => {
  it('uses the workspace-local tsc before host PATH', () => {
    const descriptor = TOOL_DESCRIPTORS.find((tool) => tool.capability === 'tsc');
    expect(descriptor).toBeDefined();

    const result = resolveTool(descriptor!, process.cwd());

    expect(result.resolved.source).toBe('workspace-local');
    expect(result.resolved.executable).toContain('/node_modules/.bin/tsc');
    expect(result.version).toMatch(/^Version /);
  });

  it('fails closed when no allowed executable can be probed', () => {
    const result = resolveTool(
      {
        capability: 'test-missing',
        executable: 'vestara-tool-that-does-not-exist',
        versionArgs: ['--version'],
        allowedSources: ['host-path'],
      },
      process.cwd(),
    );

    expect(result).toEqual({
      resolved: { capability: 'test-missing', executable: null, source: 'missing' },
      version: null,
    });
  });

  it('keeps Compose and Kubernetes capability descriptors on their real executables', () => {
    expect(TOOL_DESCRIPTORS.find((tool) => tool.capability === 'docker-compose')).toMatchObject({
      executable: 'docker',
      versionArgs: ['compose', 'version'],
      alternatives: [{ executable: 'docker-compose', versionArgs: ['version'] }],
    });
    expect(TOOL_DESCRIPTORS.find((tool) => tool.capability === 'kubernetes')).toMatchObject({ executable: 'kubectl' });
  });
});

describe('diagnostics process heap classification', () => {
  const LIMIT_2GB = 2 * 1024 * 1024 * 1024;

  it('stays healthy on a small heap with a high committed ratio (api-server false-positive guard)', () => {
    // Incident: 38MB used / 46MB committed read as 83% degraded while the
    // process held ~258MB RSS on a multi-GB host. Against the heap limit
    // the same usage is ~2% — healthy.
    expect(classifyProcessHeapHealth(38 * 1024 * 1024, LIMIT_2GB)).toBe('healthy');
    expect(classifyProcessHeapHealth(48 * 1024 * 1024, LIMIT_2GB)).toBe('healthy');
  });

  it('degrades above 80% of the heap limit and fails above 90%', () => {
    expect(classifyProcessHeapHealth(LIMIT_2GB * 0.85, LIMIT_2GB)).toBe('degraded');
    expect(classifyProcessHeapHealth(LIMIT_2GB * 0.95, LIMIT_2GB)).toBe('unhealthy');
  });

  it('reports unknown when the heap limit cannot be determined', () => {
    expect(classifyProcessHeapHealth(10 * 1024 * 1024, 0)).toBe('unknown');
    expect(classifyProcessHeapHealth(10 * 1024 * 1024, Number.NaN)).toBe('unknown');
  });
});
