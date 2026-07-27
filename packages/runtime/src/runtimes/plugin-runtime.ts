import type { PermissionOperation } from '@vestara/types';
import { Runtime, type RuntimeConfig, type RuntimeHooks } from '../index';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  permissions: PermissionOperation[];
  entrypoint: string;
}

export class PluginRuntime extends Runtime {
  private _manifest: PluginManifest;
  private _sandboxed = true;

  constructor(config: RuntimeConfig, manifest: PluginManifest, hooks?: RuntimeHooks) {
    super(config, {
      onInitialize: async () => {
        if (!this.checkPermission('system:configure', 'plugin', manifest.id)) {
          throw new Error(`Plugin "${manifest.id}" lacks system:configure permission`);
        }
        this.checkpoint('plugin-load', {
          manifest: manifest.id,
          version: manifest.version,
        });
        if (hooks?.onInitialize) await hooks.onInitialize();
      },
      onDestroy: async () => {
        this.clearCheckpoints();
        if (hooks?.onDestroy) await hooks.onDestroy();
      },
      onSuspend: hooks?.onSuspend,
      onResume: hooks?.onResume,
      onStop: hooks?.onStop,
    });
    this._manifest = manifest;
  }

  get manifest(): PluginManifest {
    return { ...this._manifest };
  }

  get version(): string {
    return this._manifest.version;
  }

  get sandboxed(): boolean {
    return this._sandboxed;
  }

  disableSandbox(): void {
    this._sandboxed = false;
  }

  hasRequiredCapability(operation: string): boolean {
    return this._manifest.permissions.includes(operation as PermissionOperation);
  }

  validateApiCompatibility(runtimeVersion: string): boolean {
    return this._manifest.version.startsWith(runtimeVersion.split('.')[0]);
  }

  reload(newVersion: string): void {
    this._manifest = { ...this._manifest, version: newVersion };
    this.checkpoint('plugin-reload', {
      previousVersion: this.version,
      newVersion,
      reloadedAt: new Date().toISOString(),
    });
  }
}
