import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { promisify } from 'node:util';
import type { EventBus } from '@vestara/event-bus';
import type { PermissionManager } from '@vestara/permissions';
import { Runtime } from '@vestara/runtime';
import type { RuntimeId } from '@vestara/types';

const execFileAsync = promisify(execFile);

export interface HostDevice {
  readonly id: string;
  readonly kind: 'block';
  readonly path: string;
}

export interface HostMount {
  readonly mountPoint: string;
  readonly filesystem: string;
  readonly source: string;
  readonly readOnly: boolean;
}

export interface HostNetworkInterface {
  readonly name: string;
  readonly addresses: readonly string[];
  readonly internal: boolean;
}

export interface HostSnapshot {
  readonly capturedAt: string;
  readonly hostname: string;
  readonly platform: NodeJS.Platform;
  readonly architecture: string;
  readonly kernelRelease: string;
  readonly distribution?: string;
  readonly cpu: { readonly model: string; readonly logicalCores: number; readonly loadAverage: readonly number[] };
  readonly memory: { readonly totalBytes: number; readonly freeBytes: number };
  readonly uptimeSeconds: number;
  readonly devices: readonly HostDevice[];
  readonly mounts: readonly HostMount[];
  readonly network: readonly HostNetworkInterface[];
  readonly systemdAvailable: boolean;
}

export interface HostInspector {
  inspect(): Promise<HostSnapshot>;
}

export interface HostCommandExecutor {
  execute(file: string, args: readonly string[]): Promise<void>;
}

export interface HostRuntimeOptions {
  readonly eventBus?: EventBus;
  readonly permissionManager?: PermissionManager;
  readonly inspector?: HostInspector;
  readonly commandExecutor?: HostCommandExecutor;
  readonly allowPowerOperations?: boolean;
  readonly authorizePowerOperation?: (operation: 'reboot' | 'shutdown') => Promise<boolean>;
}

export class LinuxHostInspector implements HostInspector {
  async inspect(): Promise<HostSnapshot> {
    const [distribution, devices, mounts, systemdAvailable] = await Promise.all([
      readDistribution(),
      readBlockDevices(),
      readMounts(),
      fileExists('/run/systemd/system'),
    ]);
    const cpus = os.cpus();
    const network = Object.entries(os.networkInterfaces()).map(([name, addresses]) => ({
      name,
      addresses: (addresses ?? []).map((address) => address.address),
      internal: (addresses ?? []).length > 0 && (addresses ?? []).every((address) => address.internal),
    }));
    return {
      capturedAt: new Date().toISOString(),
      hostname: os.hostname(),
      platform: os.platform(),
      architecture: os.arch(),
      kernelRelease: os.release(),
      distribution,
      cpu: { model: cpus[0]?.model ?? 'unknown', logicalCores: cpus.length, loadAverage: os.loadavg() },
      memory: { totalBytes: os.totalmem(), freeBytes: os.freemem() },
      uptimeSeconds: os.uptime(),
      devices,
      mounts,
      network,
      systemdAvailable,
    };
  }
}

export class HostRuntime extends Runtime {
  private readonly inspector: HostInspector;
  private readonly commandExecutor: HostCommandExecutor;
  private readonly allowPowerOperations: boolean;
  private readonly authorizePowerOperation?: HostRuntimeOptions['authorizePowerOperation'];
  private snapshot?: HostSnapshot;

  constructor(options: HostRuntimeOptions = {}) {
    super({
      id: 'host-runtime' as RuntimeId,
      type: 'host',
      eventBus: options.eventBus,
      permissionManager: options.permissionManager,
      capabilities: ['host:inspect', 'host:health'],
      metadata: { displayName: 'Host Runtime', description: 'Vestara OS host integration boundary' },
    });
    this.inspector = options.inspector ?? new LinuxHostInspector();
    this.commandExecutor =
      options.commandExecutor ??
      ({ execute: async (file, args) => void (await execFileAsync(file, [...args])) } satisfies HostCommandExecutor);
    this.allowPowerOperations = options.allowPowerOperations ?? false;
    this.authorizePowerOperation = options.authorizePowerOperation;
  }

  override async initialize(): Promise<void> {
    this.snapshot = await this.inspector.inspect();
    await super.initialize();
    this.emitRuntimeEvent('host.snapshot.captured', {
      hostname: this.snapshot.hostname,
      platform: this.snapshot.platform,
      architecture: this.snapshot.architecture,
    });
  }

  async inspectHost(): Promise<HostSnapshot> {
    this.snapshot = await this.inspector.inspect();
    return this.snapshot;
  }

  currentSnapshot(): HostSnapshot | undefined {
    return this.snapshot;
  }

  async reboot(): Promise<void> {
    await this.powerOperation('reboot');
  }

  async shutdown(): Promise<void> {
    await this.powerOperation('shutdown');
  }

  private async powerOperation(operation: 'reboot' | 'shutdown'): Promise<void> {
    if (!this.allowPowerOperations) throw new Error('Host power operations are disabled');
    if (!this.authorizePowerOperation || !(await this.authorizePowerOperation(operation))) {
      throw new Error(`Host ${operation} was not authorized`);
    }
    if (!this.checkPermission(`host.${operation}`, 'host', os.hostname())) {
      throw new Error(`Host ${operation} denied by policy`);
    }
    this.emitRuntimeEvent('host.power.requested', { operation }, 'warning');
    await this.commandExecutor.execute('systemctl', [operation === 'shutdown' ? 'poweroff' : 'reboot']);
  }
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function readDistribution(): Promise<string | undefined> {
  try {
    const content = await fs.readFile('/etc/os-release', 'utf8');
    const match = content.match(/^PRETTY_NAME=(.*)$/m);
    return match?.[1]?.replace(/^['"]|['"]$/g, '');
  } catch {
    return undefined;
  }
}

async function readBlockDevices(): Promise<HostDevice[]> {
  try {
    const names = await fs.readdir('/sys/class/block');
    return names.sort().map((id) => ({ id, kind: 'block', path: `/dev/${id}` }));
  } catch {
    return [];
  }
}

async function readMounts(): Promise<HostMount[]> {
  try {
    const content = await fs.readFile('/proc/self/mountinfo', 'utf8');
    return content
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [left, right = ''] = line.split(' - ');
        const fields = left.split(' ');
        const filesystemFields = right.split(' ');
        return {
          mountPoint: decodeMount(fields[4] ?? ''),
          filesystem: filesystemFields[0] ?? 'unknown',
          source: decodeMount(filesystemFields[1] ?? 'unknown'),
          readOnly: (fields[5] ?? '').split(',').includes('ro'),
        };
      });
  } catch {
    return [];
  }
}

function decodeMount(value: string): string {
  return value.replace(/\\040/g, ' ').replace(/\\011/g, '\t').replace(/\\012/g, '\n').replace(/\\134/g, '\\');
}
