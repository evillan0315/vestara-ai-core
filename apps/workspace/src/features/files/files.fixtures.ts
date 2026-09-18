/**
 * VES-FILES-001: Files Fixture Dataset
 *
 * Realistic monorepo tree mirroring this workspace top level. Used as
 * the browser source until a dedicated browse endpoint exists, and as
 * fallback for storage insights when /api/diagnostics/filesystem is empty.
 *
 * Architecture Traceability:
 *   VES-FILES-001: Vestara Files (browser + ops stacked)
 */

import type { FilesViewModel } from './files.types';

const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

export const filesFixture: FilesViewModel = {
  workspaceName: 'vestara-ai-core',
  entries: [
    {
      id: 'apps',
      name: 'apps',
      path: 'apps',
      kind: 'dir',
      children: [
        { id: 'apps/api', name: 'api', path: 'apps/api', kind: 'dir' },
        { id: 'apps/cli', name: 'cli', path: 'apps/cli', kind: 'dir' },
        { id: 'apps/workspace', name: 'workspace', path: 'apps/workspace', kind: 'dir' },
      ],
    },
    {
      id: 'packages',
      name: 'packages',
      path: 'packages',
      kind: 'dir',
      children: [
        { id: 'packages/kernel', name: 'kernel', path: 'packages/kernel', kind: 'dir' },
        { id: 'packages/ui-tokens', name: 'ui-tokens', path: 'packages/ui-tokens', kind: 'dir' },
        { id: 'packages/workspace', name: 'workspace', path: 'packages/workspace', kind: 'dir' },
      ],
    },
    {
      id: 'docs',
      name: 'docs',
      path: 'docs',
      kind: 'dir',
      children: [
        { id: 'docs/governance', name: 'governance', path: 'docs/governance', kind: 'dir' },
        {
          id: 'docs/governance/UI-UX-GOVERNANCE.md',
          name: 'UI-UX-GOVERNANCE.md',
          path: 'docs/governance/UI-UX-GOVERNANCE.md',
          kind: 'file',
          size: 9216,
          mtime: iso(180),
          language: 'markdown',
        },
      ],
    },
    {
      id: 'package.json',
      name: 'package.json',
      path: 'package.json',
      kind: 'file',
      size: 4096,
      mtime: iso(60),
      language: 'json',
    },
    {
      id: 'pnpm-workspace.yaml',
      name: 'pnpm-workspace.yaml',
      path: 'pnpm-workspace.yaml',
      kind: 'file',
      size: 1024,
      mtime: iso(1440),
      language: 'yaml',
    },
    {
      id: 'assets',
      name: 'assets',
      path: 'assets',
      kind: 'dir',
      children: [
        {
          id: 'assets/images',
          name: 'images',
          path: 'assets/images',
          kind: 'dir',
          children: [
            {
              id: 'assets/images/logo.svg',
              name: 'logo.svg',
              path: 'assets/images/logo.svg',
              kind: 'file',
              size: 2048,
              mtime: iso(30),
              language: 'svg',
            },
            {
              id: 'assets/images/dashboard.png',
              name: 'dashboard.png',
              path: 'assets/images/dashboard.png',
              kind: 'file',
              size: 156_000,
              mtime: iso(45),
              language: 'png',
            },
            {
              id: 'assets/images/architecture-diagram.svg',
              name: 'architecture-diagram.svg',
              path: 'assets/images/architecture-diagram.svg',
              kind: 'file',
              size: 45_000,
              mtime: iso(60),
              language: 'svg',
            },
          ],
        },
        {
          id: 'assets/videos',
          name: 'videos',
          path: 'assets/videos',
          kind: 'dir',
          children: [
            {
              id: 'assets/videos/demo.mp4',
              name: 'demo.mp4',
              path: 'assets/videos/demo.mp4',
              kind: 'file',
              size: 5_200_000,
              mtime: iso(120),
              language: 'mp4',
            },
            {
              id: 'assets/videos/tutorial.webm',
              name: 'tutorial.webm',
              path: 'assets/videos/tutorial.webm',
              kind: 'file',
              size: 3_800_000,
              mtime: iso(200),
              language: 'webm',
            },
          ],
        },
        {
          id: 'assets/audio',
          name: 'audio',
          path: 'assets/audio',
          kind: 'dir',
          children: [
            {
              id: 'assets/audio/notification.mp3',
              name: 'notification.mp3',
              path: 'assets/audio/notification.mp3',
              kind: 'file',
              size: 45_000,
              mtime: iso(90),
              language: 'mp3',
            },
          ],
        },
        {
          id: 'assets/docs',
          name: 'docs',
          path: 'assets/docs',
          kind: 'dir',
          children: [
            {
              id: 'assets/docs/readme.md',
              name: 'README.md',
              path: 'assets/docs/README.md',
              kind: 'file',
              size: 3_200,
              mtime: iso(15),
              language: 'markdown',
            },
            {
              id: 'assets/docs/style-guide.txt',
              name: 'style-guide.txt',
              path: 'assets/docs/style-guide.txt',
              kind: 'file',
              size: 1_800,
              mtime: iso(15),
              language: 'text',
            },
          ],
        },
      ],
    },
  ],
  dirSizes: [
    { dir: 'apps/workspace', size: 412_500_000 },
    { dir: 'packages', size: 188_200_000 },
    { dir: 'apps/api', size: 96_400_000 },
    { dir: 'docs', size: 12_800_000 },
  ],
  largeFiles: [
    { file: 'pnpm-lock.yaml', size: 18_400_000 },
    { file: 'apps/workspace/package.json', size: 1_200_000 },
    { file: 'docs/governance/UI-UX-GOVERNANCE.md', size: 9216 },
  ],
  recent: [
    { file: 'apps/workspace/src/pages/Files.tsx', mtime: iso(12) },
    { file: 'apps/workspace/src/features/overview/OverviewScreen.tsx', mtime: iso(34) },
    { file: 'packages/ui-tokens/src/tokens.ts', mtime: iso(90) },
    { file: 'docs/governance/UI-UX-GOVERNANCE.md', mtime: iso(180) },
  ],
  fromSnapshot: true,
  treeTruncated: false,
};
