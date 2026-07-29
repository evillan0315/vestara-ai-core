import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ProjectProfileService } from '../src/project-profile';

describe('ProjectProfileService', () => {
  let testDir: string;
  let profileService: ProjectProfileService;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-test-'));
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'apps/web'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'packages/shared'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'src/index.ts'), '');
    fs.writeFileSync(path.join(testDir, 'src/app.tsx'), '');
    fs.writeFileSync(path.join(testDir, 'src/utils.ts'), '');
    fs.writeFileSync(path.join(testDir, 'src/styles.css'), '');
    fs.writeFileSync(path.join(testDir, 'src/config.json'), '');
    fs.writeFileSync(path.join(testDir, 'README.md'), '# my-app\n');
    fs.writeFileSync(path.join(testDir, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n  - "apps/*"\n');
    fs.writeFileSync(
      path.join(testDir, 'package.json'),
      JSON.stringify({
        name: 'my-app',
        dependencies: {
          react: '^19.0.0',
          'react-dom': '^19.0.0',
          next: '^15.0.0',
          typescript: '^5.5.0',
          vitest: '^2.0.0',
          tailwindcss: '^4.0.0',
          '@mui/material': '^6.0.0',
        },
        devDependencies: {
          eslint: '^9.0.0',
          prettier: '^3.0.0',
        },
      }),
    );
    fs.writeFileSync(
      path.join(testDir, 'apps/web/package.json'),
      JSON.stringify({ name: '@my-app/web', dependencies: { next: '^15.0.0' } }),
    );
    fs.writeFileSync(
      path.join(testDir, 'packages/shared/package.json'),
      JSON.stringify({ name: '@my-app/shared', dependencies: { react: '^19.0.0' } }),
    );
    fs.writeFileSync(path.join(testDir, 'tsconfig.json'), '{}');

    profileService = new ProjectProfileService(testDir);
  });

  it('detects project name from directory name', () => {
    const profile = profileService.detect();
    expect(profile.name).toBe(path.basename(testDir));
  });

  it('detects package manager', () => {
    const profile = profileService.detect();
    expect(profile.packageManager).not.toBeNull();
    expect(profile.packageManager!.name).toBe('pnpm');
  });

  it('detects monorepo from pnpm-workspace.yaml', () => {
    const profile = profileService.detect();
    expect(profile.isMonorepo).toBe(true);
  });

  it('detects frameworks from dependencies', () => {
    const profile = profileService.detect();
    const frameworkNames = profile.frameworks.map((f) => f.name);
    expect(frameworkNames).toContain('Next.js');
    expect(frameworkNames).toContain('React 19');
    expect(frameworkNames).toContain('Tailwind CSS');
    expect(frameworkNames).toContain('Material UI');
  });

  it('detects TypeScript as primary language', () => {
    const profile = profileService.detect();
    expect(profile.primaryLanguage.name).toBe('TypeScript');
  });

  it('detects apps and packages in monorepo', () => {
    const profile = profileService.detect();
    expect(profile.apps.length).toBeGreaterThanOrEqual(1);
    expect(profile.packages.length).toBeGreaterThanOrEqual(1);
    expect(profile.apps).toContain('apps/web');
    expect(profile.packages).toContain('packages/shared');
  });

  it('detects tooling', () => {
    const profile = profileService.detect();
    expect(profile.tooling.testFramework).toBe('vitest');
    expect(profile.tooling.linter).toBe('eslint');
    expect(profile.tooling.formatter).toBe('prettier');
  });

  it('detects infrastructure', () => {
    const profile = profileService.detect();
    expect(profile.infrastructure.hasDocker).toBe(false);
    expect(profile.infrastructure.hasCI).toBe(false);
  });

  it('generates context string', () => {
    const profile = profileService.detect();
    const context = profileService.generateContext(profile);
    expect(context).toContain('Project:');
    expect(context).toContain('TypeScript');
    expect(context).toContain('pnpm');
    expect(context).toContain('monorepo');
    expect(context).toContain('Next.js');
  });
});
