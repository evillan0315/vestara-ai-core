// Platform artifact resolver for package executables.
//
// Resolves a package's entrypoint to a platform-specific executable path from a
// manifest. Lives in Marketplace infrastructure so the CLI and runtime share one
// resolution contract. Unsupported platform/architecture combinations fail with
// a precise error instead of silently falling back to source execution.

import * as path from 'node:path';
import type { VestaraPackageManifest } from '@vestara/extension-contracts';

export interface PlatformDescriptor {
  readonly platform: NodeJS.Platform;
  readonly architecture: NodeJS.Architecture;
}

export interface PackageExecutable {
  readonly packageId: string;
  readonly version: string;
  readonly path: string;
  readonly checksum: string;
  readonly platform: PlatformDescriptor;
}

export interface PackageExecutableResolver {
  resolve(packageId: string, platform: PlatformDescriptor): Promise<PackageExecutable>;
}

/** Canonical platform tags the TUI ships (also used for capability reporting). */
export const SUPPORTED_TUI_TARGETS: readonly string[] = [
  'linux-x64',
  'linux-arm64',
  'darwin-x64',
  'darwin-arm64',
  'win32-x64',
];

/** Map a Node platform/arch pair to the canonical target tag (e.g. linux-x64). */
export function platformTarget(platform: NodeJS.Platform, arch: NodeJS.Architecture): string {
  if (arch === 'x64' || arch === 'arm64') return `${platform}-${arch}`;
  if (arch === 'ia32') return `${platform}-x64`;
  return `${platform}-${arch}`;
}

export interface EntrypointMapping {
  readonly targets: Record<string, string>;
  readonly checksums?: Record<string, string>;
}

export function resolveExecutableTarget(
  mapping: EntrypointMapping | undefined,
  platform: PlatformDescriptor,
): { target: string; relativePath: string } {
  if (!mapping) throw new ExecutableResolutionError('Package does not declare any executable targets', platform);
  const target = platformTarget(platform.platform, platform.architecture);
  const relativePath = mapping.targets[target];
  if (!relativePath) {
    throw new ExecutableResolutionError(
      `No executable is available for ${target}. Supported targets: ${SUPPORTED_TUI_TARGETS.join(', ')}`,
      platform,
      target,
    );
  }
  return { target, relativePath };
}

/**
 * Resolve a manifest entrypoint for the host platform. Ensures the resolved
 * path stays inside the package installation directory (path traversal guard).
 */
export function resolvePackageExecutable(
  packagePath: string,
  manifest: Pick<VestaraPackageManifest, 'id' | 'version' | 'entrypoints'>,
  platform: PlatformDescriptor,
): PackageExecutable {
  const entrypoints = manifest.entrypoints as Record<string, unknown> | undefined;
  const executableMapping = entrypoints?.executable as EntrypointMapping | undefined;
  const { target, relativePath } = resolveExecutableTarget(executableMapping, platform);

  const root = path.resolve(packagePath);
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new ExecutableResolutionError(`Executable path escapes package directory: ${relativePath}`, platform, target);
  }

  return {
    packageId: manifest.id,
    version: manifest.version,
    path: resolved,
    checksum: executableMapping?.checksums?.[target] ?? '',
    platform,
  };
}

export class ExecutableResolutionError extends Error {
  readonly platform: PlatformDescriptor;
  readonly target?: string;
  constructor(message: string, platform: PlatformDescriptor, target?: string) {
    super(message);
    this.name = 'ExecutableResolutionError';
    this.platform = platform;
    this.target = target;
  }
}

export function formatResolutionError(packageId: string, version: string, error: ExecutableResolutionError): string {
  return [
    `${error.message}`,
    '',
    `Installed package: ${packageId}@${version}`,
    `Supported targets: ${SUPPORTED_TUI_TARGETS.join(', ')}`,
  ].join('\n');
}
