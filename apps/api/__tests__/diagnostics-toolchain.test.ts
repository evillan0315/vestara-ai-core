import { describe, expect, it } from 'vitest';
import { classifyToolchainVersions } from '../src/diagnostics/snapshots';

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
