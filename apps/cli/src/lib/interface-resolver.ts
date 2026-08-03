/**
 * Root interactive-interface resolver.
 *
 * `vestara` in an interactive terminal should launch the active Marketplace TUI
 * package when one is installed and healthy. In noninteractive terminals, when
 * the package is disabled/unavailable/unhealthy, or when `--no-tui` is set, it
 * degrades to the standard CLI. `vestara tui` always requires the package.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { InstalledExtension } from '@vestara/extension-runtime';
import {
  type ExecutableResolutionError,
  formatResolutionError,
  type PackageExecutable,
  type PlatformDescriptor,
  resolvePackageExecutable,
} from '@vestara/marketplace';

export const TUI_PACKAGE_ID = 'vestara.tui';

export type InterfaceResolution =
  | { readonly kind: 'tui'; readonly executable: PackageExecutable }
  | { readonly kind: 'cli'; readonly reason: string }
  | { readonly kind: 'unavailable'; readonly error: string };

export interface InterfaceResolverContext {
  readonly packagesRoot: string;
  readonly platform?: PlatformDescriptor;
  readonly interactive?: boolean;
  readonly ci?: boolean;
}

/** `~/.local/share/vestara/packages/` — the TUI package installation root. */
export function defaultPackagesRoot(): string {
  if (process.env.VESTARA_PACKAGES_ROOT) return process.env.VESTARA_PACKAGES_ROOT;
  const base = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share');
  return path.join(base, 'vestara', 'packages');
}

export function readInstalledPackage(packagesRoot: string, packageId: string): InstalledExtension | undefined {
  const statePath = path.join(packagesRoot, 'extensions.json');
  if (!fs.existsSync(statePath)) return undefined;
  try {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as {
      packages?: Record<string, InstalledExtension>;
    };
    return state.packages?.[packageId];
  } catch {
    return undefined;
  }
}

export function isInteractiveTerminal(env: NodeJS.ProcessEnv = process.env): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true && env.CI !== 'true';
}

function packageVersionPath(packagesRoot: string, packageId: string, version: string): string {
  return path.join(packagesRoot, packageId, version);
}

/**
 * Resolve the active interactive interface. `requirePackage` forces an error
 * when the package is missing (used by `vestara tui`); otherwise the resolver
 * degrades to the standard CLI.
 */
export function resolveInterface(
  context: InterfaceResolverContext,
  options: { requirePackage?: boolean; enabled?: boolean } = {},
): InterfaceResolution {
  const installed = readInstalledPackage(context.packagesRoot, TUI_PACKAGE_ID);
  if (!installed) {
    if (options.requirePackage) {
      return {
        kind: 'unavailable',
        error: `${TUI_PACKAGE_ID} is not installed. Run 'vestara marketplace install @vestara/tui'.`,
      };
    }
    return { kind: 'cli', reason: 'TUI package is not installed' };
  }

  const enabled = options.enabled ?? installed.enabledWorkspaces.length > 0;
  if (!enabled) {
    if (options.requirePackage) {
      return {
        kind: 'unavailable',
        error: `${TUI_PACKAGE_ID} is disabled. Run 'vestara marketplace enable @vestara/tui'.`,
      };
    }
    return { kind: 'cli', reason: 'TUI package is disabled' };
  }

  const currentVersion = installed.currentVersion;
  const version = installed.versions?.[currentVersion];
  if (!version?.manifest) {
    return { kind: 'unavailable', error: `${TUI_PACKAGE_ID}@${currentVersion} has no manifest` };
  }

  const platform = context.platform ?? { platform: process.platform, architecture: process.arch };
  try {
    const packagePath = packageVersionPath(context.packagesRoot, TUI_PACKAGE_ID, currentVersion);
    const executable = resolvePackageExecutable(packagePath, version.manifest, platform);
    if (!fs.existsSync(executable.path)) {
      return {
        kind: 'unavailable',
        error: `Executable missing at ${executable.path}`,
      };
    }
    return { kind: 'tui', executable };
  } catch (error) {
    const resolutionError = error as ExecutableResolutionError;
    return {
      kind: 'unavailable',
      error: formatResolutionError(TUI_PACKAGE_ID, currentVersion, resolutionError),
    };
  }
}
