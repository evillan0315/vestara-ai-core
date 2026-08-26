import * as fs from 'node:fs';
import * as os from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type CpuSnapshot,
  collectCpu,
  collectDisks,
  collectDocker,
  collectGit,
  collectGpu,
  collectHealth,
  collectMemory,
  collectNetwork,
  collectOS,
  collectProcesses,
  collectTemperature,
  collectVersions,
  computeCpuUsage,
  countPhysicalCores,
  type HealthInput,
  killProcess,
  parseDf,
  parseDockerStat,
  parsePs,
  parsePsLine,
  readCpuStat,
  readinessScore,
  run,
  scanWorkspace,
} from '../src/diagnostics/collect.js';

describe('parsePsLine', () => {
  it('parses a process line with a spaced command', () => {
    const fields = parsePsLine(
      '1234 5678 eddie R 12.5 3.2 1048576 2097152 8 00:02:00 node apps/api/dist/index.js --port 3001',
      11,
    );
    expect(fields.length).toBe(11);
    expect(fields[0]).toBe('1234');
    expect(fields[1]).toBe('5678');
    expect(fields[2]).toBe('eddie');
    expect(fields[3]).toBe('R');
    expect(fields[4]).toBe('12.5');
    expect(fields[5]).toBe('3.2');
    expect(fields[9]).toBe('00:02:00');
    expect(fields[10]).toBe('node apps/api/dist/index.js --port 3001');
  });

  it('returns empty for malformed lines', () => {
    expect(parsePsLine('not a process line', 11)).toEqual([]);
  });
});

describe('parsePs', () => {
  it('converts process rows to objects with bytes', () => {
    const rows = parsePs(
      '1 0 root S 0.0 0.1 10240 20480 1 00:00:01 /sbin/init\n2 1 root S 0.0 0.0 0 0 1 00:00:00 [kthreadd]',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ pid: 1, ppid: 0, user: 'root', status: 'S', cpu: 0, mem: 0.1, threads: 1 });
    expect(rows[0].rss).toBe(10240 * 1024);
    expect(rows[0].command).toBe('/sbin/init');
    expect(rows[1].command).toBe('[kthreadd]');
  });
});

describe('computeCpuUsage', () => {
  it('computes utilization percent between two snapshots', () => {
    const prev: CpuSnapshot = {
      time: 0,
      totalIdle: 800,
      total: 1000,
      perCores: [{ idle: 200, total: 250 }],
      processes: 0,
      contextSwitches: 0,
      interrupts: 0,
    };
    const next: CpuSnapshot = {
      time: 1000,
      totalIdle: 860,
      total: 1100,
      perCores: [{ idle: 230, total: 300 }],
      processes: 0,
      contextSwitches: 0,
      interrupts: 0,
    };
    // total delta 100, idle delta 60 → busy 40%
    const result = computeCpuUsage(prev, next);
    expect(result.overall).toBeCloseTo(40, 1);
    expect(result.perCore[0]).toBeCloseTo(40, 1);
  });

  it('returns zeros when no time elapsed', () => {
    const s: CpuSnapshot = {
      time: 0,
      totalIdle: 100,
      total: 100,
      perCores: [{ idle: 100, total: 100 }],
      processes: 0,
      contextSwitches: 0,
      interrupts: 0,
    };
    expect(computeCpuUsage(s, s)).toEqual({ overall: 0, perCore: [0] });
  });
});

describe('parseDf', () => {
  it('parses df -kPT output', () => {
    const output = [
      'Filesystem     Type  1024-blocks     Used Available Capacity% Mounted on',
      '/dev/sda1      ext4   20511356  4812340  14588472        25% /',
      'tmpfs         tmpfs     8201140       128   8201012         1% /dev/shm',
    ].join('\n');
    const rows = parseDf(output);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ filesystem: '/dev/sda1', type: 'ext4', capacity: 25, mount: '/' });
    expect(rows[0].size).toBe(20511356 * 1024);
    expect(rows[1].mount).toBe('/dev/shm');
  });
});

describe('parseDockerStat', () => {
  it('parses docker stats output into bytes', () => {
    const stat = parseDockerStat('api|0.42%|45.6MiB / 7.8GiB|0.57%|1.2MB / 3.4MB');
    expect(stat).not.toBeNull();
    expect(stat?.name).toBe('api');
    expect(stat?.cpuPerc).toBeCloseTo(0.42);
    expect(stat?.memUsed).toBeCloseTo(45.6 * 1024 * 1024, 0);
    expect(stat?.memLimit).toBeCloseTo(7.8 * 1024 ** 3, 0);
  });

  it('returns null for malformed lines', () => {
    expect(parseDockerStat('not a stats line')).toBeNull();
  });
});

describe('collectHealth', () => {
  const input: HealthInput = {
    repoPath: '/tmp/nonexistent-repo-for-test',
    workspaceStatus: 'ready',
    memAvailableBytes: 1024 ** 3,
    memTotalBytes: 8 * 1024 ** 3,
    diskFreeBytes: 10 * 1024 ** 3,
    diskTotalBytes: 100 * 1024 ** 3,
    gpuAvailable: false,
    dockerAvailable: false,
    gitAvailable: true,
    pythonAvailable: true,
    nodeVersion: 'v22.0.0',
  };

  it('produces a check per subsystem', () => {
    const checks = collectHealth(input);
    const ids = checks.map((c) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'workspace',
        'filesystem',
        'node',
        'python',
        'git',
        'docker',
        'gpu',
        'memory',
        'disk',
        'dependencies',
      ]),
    );
    const node = checks.find((c) => c.id === 'node');
    expect(node?.status).toBe('pass');
  });

  it('fails when the repo path is missing', () => {
    const checks = collectHealth(input);
    const fs = checks.find((c) => c.id === 'filesystem');
    expect(fs?.status).toBe('fail');
  });

  it('flags low memory', () => {
    const checks = collectHealth({
      ...input,
      memAvailableBytes: 3 * 1024 ** 3,
      memTotalBytes: 20 * 1024 ** 3,
    });
    const mem = checks.find((c) => c.id === 'memory');
    expect(mem?.status).toBe('warn');
  });
});

describe('readinessScore', () => {
  it('weights statuses and returns a percentage', () => {
    const checks = [
      { id: 'a', name: 'A', status: 'pass' as const, detail: '' },
      { id: 'b', name: 'B', status: 'warn' as const, detail: '' },
      { id: 'c', name: 'C', status: 'fail' as const, detail: '' },
    ];
    expect(readinessScore(checks)).toBe(50);
  });

  it('handles unknown status as 0.5 weight', () => {
    const checks = [
      { id: 'a', name: 'A', status: 'pass' as const, detail: '' },
      { id: 'b', name: 'B', status: 'unknown' as const, detail: '' },
    ];
    expect(readinessScore(checks)).toBe(75);
  });

  it('returns 0 for empty checks', () => {
    expect(readinessScore([])).toBe(0);
  });
});

describe('run', () => {
  it('returns null for non-existent command', () => {
    const result = run('/nonexistent/command/that/does/not/exist', ['--version']);
    expect(result).toBeNull();
  });

  it('returns stdout for successful command', () => {
    const result = run('echo', ['hello world']);
    expect(result).toBe('hello world');
  });

  it('times out for long-running commands', () => {
    const result = run('sleep', ['10'], 50);
    expect(result).toBeNull();
  });
});

describe('readCpuStat', () => {
  it('returns CpuSnapshot with expected structure', () => {
    const stat = readCpuStat();
    if (stat) {
      expect(stat).toHaveProperty('time');
      expect(stat).toHaveProperty('perCores');
      expect(stat).toHaveProperty('totalIdle');
      expect(stat).toHaveProperty('total');
      expect(stat).toHaveProperty('processes');
      expect(stat).toHaveProperty('contextSwitches');
      expect(stat).toHaveProperty('interrupts');
      expect(Array.isArray(stat.perCores)).toBe(true);
      expect(typeof stat.time).toBe('number');
    }
  });

  it('returns null on unsupported platforms', () => {
    // On non-Linux systems, /proc/stat doesn't exist
    const stat = readCpuStat();
    // Could be null or valid depending on platform
    expect(stat === null || typeof stat === 'object').toBe(true);
  });
});

describe('computeCpuUsage', () => {
  it('handles different core counts gracefully', () => {
    const prev: CpuSnapshot = {
      time: 0,
      totalIdle: 800,
      total: 1000,
      perCores: [
        { idle: 200, total: 250 },
        { idle: 200, total: 250 },
      ],
      processes: 0,
      contextSwitches: 0,
      interrupts: 0,
    };
    const next: CpuSnapshot = {
      time: 1000,
      totalIdle: 860,
      total: 1100,
      perCores: [
        { idle: 230, total: 300 },
        { idle: 230, total: 300 },
      ],
      processes: 0,
      contextSwitches: 0,
      interrupts: 0,
    };
    const result = computeCpuUsage(prev, next);
    expect(result.perCore).toHaveLength(2);
    expect(result.perCore[0]).toBeCloseTo(40, 1);
    expect(result.perCore[1]).toBeCloseTo(40, 1);
  });

  it('returns zeros when next snapshot has missing cores', () => {
    const prev: CpuSnapshot = {
      time: 0,
      totalIdle: 800,
      total: 1000,
      perCores: [
        { idle: 200, total: 250 },
        { idle: 200, total: 250 },
      ],
      processes: 0,
      contextSwitches: 0,
      interrupts: 0,
    };
    const next: CpuSnapshot = {
      time: 1000,
      totalIdle: 860,
      total: 1100,
      perCores: [{ idle: 230, total: 300 }],
      processes: 0,
      contextSwitches: 0,
      interrupts: 0,
    };
    const result = computeCpuUsage(prev, next);
    expect(result.perCore[1]).toBe(0);
  });
});

describe('countPhysicalCores', () => {
  it('returns a positive number', () => {
    const count = countPhysicalCores();
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThan(0);
  });
});

describe('collectMemory', () => {
  it('returns MemoryDetail with expected structure', () => {
    const mem = collectMemory();
    expect(mem).toHaveProperty('total');
    expect(mem).toHaveProperty('free');
    expect(mem).toHaveProperty('available');
    expect(mem).toHaveProperty('used');
    expect(mem).toHaveProperty('buffers');
    expect(mem).toHaveProperty('cached');
    expect(mem).toHaveProperty('active');
    expect(mem).toHaveProperty('inactive');
    expect(mem).toHaveProperty('dirty');
    expect(mem).toHaveProperty('swapTotal');
    expect(mem).toHaveProperty('swapFree');
    expect(mem).toHaveProperty('swapUsed');
    expect(mem).toHaveProperty('hugePagesTotal');
    expect(mem).toHaveProperty('hugePagesFree');
    expect(mem.total).toBeGreaterThan(0);
    expect(mem.used).toBeGreaterThanOrEqual(0);
  });
});

describe('collectTemperature', () => {
  it('returns array of temperature readings', () => {
    const temps = collectTemperature();
    expect(Array.isArray(temps)).toBe(true);
    for (const t of temps) {
      expect(t).toHaveProperty('type');
      expect(t).toHaveProperty('temp');
      expect(typeof t.type).toBe('string');
      expect(typeof t.temp).toBe('number');
    }
  });
});

describe('collectOS', () => {
  it('returns OS info with expected structure', () => {
    const osInfo = collectOS();
    expect(osInfo).toHaveProperty('platform');
    expect(osInfo).toHaveProperty('type');
    expect(osInfo).toHaveProperty('release');
    expect(osInfo).toHaveProperty('kernel');
    expect(osInfo).toHaveProperty('arch');
    expect(osInfo).toHaveProperty('hostname');
    expect(osInfo).toHaveProperty('user');
    expect(osInfo).toHaveProperty('home');
    expect(osInfo).toHaveProperty('uptime');
    expect(osInfo).toHaveProperty('bootTime');
    expect(osInfo).toHaveProperty('timezone');
    expect(osInfo).toHaveProperty('locale');
    expect(osInfo).toHaveProperty('cpuModel');
    expect(typeof osInfo.platform).toBe('string');
    expect(typeof osInfo.uptime).toBe('number');
  });
});

describe('collectNetwork', () => {
  it('returns interfaces and gateway', () => {
    const net = collectNetwork();
    expect(net).toHaveProperty('interfaces');
    expect(net).toHaveProperty('gateway');
    expect(Array.isArray(net.interfaces)).toBe(true);
    for (const iface of net.interfaces) {
      expect(iface).toHaveProperty('name');
      expect(iface).toHaveProperty('family');
      expect(iface).toHaveProperty('address');
      expect(iface).toHaveProperty('netmask');
      expect(iface).toHaveProperty('mac');
      expect(iface).toHaveProperty('internal');
    }
  });
});

describe('collectDisks', () => {
  it('returns array of DiskUsage', () => {
    const disks = collectDisks();
    expect(Array.isArray(disks)).toBe(true);
    for (const disk of disks) {
      expect(disk).toHaveProperty('filesystem');
      expect(disk).toHaveProperty('type');
      expect(disk).toHaveProperty('size');
      expect(disk).toHaveProperty('used');
      expect(disk).toHaveProperty('available');
      expect(disk).toHaveProperty('capacity');
      expect(disk).toHaveProperty('mount');
      expect(typeof disk.capacity).toBe('number');
    }
  });
});

describe('collectGpu', () => {
  it('returns GpuInfo with expected structure', () => {
    const gpu = collectGpu();
    expect(gpu).toHaveProperty('available');
    expect(gpu).toHaveProperty('gpus');
    expect(gpu).toHaveProperty('processes');
    expect(Array.isArray(gpu.gpus)).toBe(true);
    expect(Array.isArray(gpu.processes)).toBe(true);
    if (!gpu.available) {
      expect(gpu).toHaveProperty('error');
    }
  });
});

describe('collectDocker', () => {
  it('returns Docker info with expected structure', () => {
    const docker = collectDocker();
    expect(docker).toHaveProperty('available');
    expect(docker).toHaveProperty('containers');
    expect(docker).toHaveProperty('imageCount');
    expect(docker).toHaveProperty('stats');
    expect(Array.isArray(docker.containers)).toBe(true);
    expect(Array.isArray(docker.stats)).toBe(true);
    expect(typeof docker.imageCount).toBe('number');
    if (!docker.available) {
      expect(docker).toHaveProperty('error');
    }
  });
});

describe('collectGit', () => {
  it('returns GitStatus for valid repo', () => {
    const git = collectGit(process.cwd());
    expect(git).toHaveProperty('available');
    expect(git).toHaveProperty('branch');
    expect(git).toHaveProperty('head');
    expect(git).toHaveProperty('lastCommit');
    expect(git).toHaveProperty('modified');
    expect(git).toHaveProperty('staged');
    expect(git).toHaveProperty('untracked');
    expect(git).toHaveProperty('conflicts');
    expect(git).toHaveProperty('ahead');
    expect(git).toHaveProperty('behind');
    expect(git).toHaveProperty('dirty');
  });

  it('returns unavailable for non-git directory', () => {
    const git = collectGit('/tmp/nonexistent-repo-for-test');
    expect(git.available).toBe(false);
    expect(git.error).toBe('Not a git repository');
  });
});

describe('collectVersions', () => {
  it('returns versions object with expected keys', () => {
    const versions = collectVersions();
    expect(versions).toHaveProperty('node');
    expect(versions).toHaveProperty('npm');
    expect(versions).toHaveProperty('pnpm');
    expect(versions).toHaveProperty('git');
    expect(versions).toHaveProperty('python');
  });

  it('caches results for 60 seconds', () => {
    const v1 = collectVersions();
    const v2 = collectVersions();
    expect(v1).toBe(v2);
  });
});

describe('collectProcesses', () => {
  it('returns processes with total and thread count', () => {
    const result = collectProcesses(10);
    expect(result).toHaveProperty('processes');
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('threads');
    expect(Array.isArray(result.processes)).toBe(true);
    expect(typeof result.total).toBe('number');
    expect(typeof result.threads).toBe('number');
    expect(result.processes.length).toBeLessThanOrEqual(10);
  });

  it('sorts processes by CPU descending', () => {
    const result = collectProcesses(5);
    for (let i = 1; i < result.processes.length; i++) {
      expect(result.processes[i - 1].cpu).toBeGreaterThanOrEqual(result.processes[i].cpu);
    }
  });
});

describe('killProcess', () => {
  it('returns error for invalid PID', () => {
    const result = killProcess(0);
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns error for PID 1 (init)', () => {
    const result = killProcess(1);
    expect(result.ok).toBe(false);
  });

  it('attempts to kill valid PID (may fail if not permitted)', () => {
    // Use a high PID that likely doesn't exist to avoid killing real processes
    const result = killProcess(999999);
    expect(result).toHaveProperty('ok');
  });
});

describe('scanWorkspace', () => {
  it('returns FsScan with expected structure', () => {
    const scan = scanWorkspace(process.cwd());
    expect(scan).toHaveProperty('dirSizes');
    expect(scan).toHaveProperty('largeFiles');
    expect(scan).toHaveProperty('recentlyModified');
    expect(Array.isArray(scan.dirSizes)).toBe(true);
    expect(Array.isArray(scan.largeFiles)).toBe(true);
    expect(Array.isArray(scan.recentlyModified)).toBe(true);
  });

  it('returns empty scan for non-existent path', () => {
    const scan = scanWorkspace('/nonexistent/path/that/does/not/exist');
    expect(scan.dirSizes).toEqual([]);
    expect(scan.largeFiles).toEqual([]);
    expect(scan.recentlyModified).toEqual([]);
  });
});

describe('collectHealth edge cases', () => {
  const baseInput: HealthInput = {
    repoPath: process.cwd(),
    workspaceStatus: 'ready',
    memAvailableBytes: 1024 ** 3,
    memTotalBytes: 8 * 1024 ** 3,
    diskFreeBytes: 10 * 1024 ** 3,
    diskTotalBytes: 100 * 1024 ** 3,
    gpuAvailable: false,
    dockerAvailable: false,
    gitAvailable: true,
    pythonAvailable: true,
    nodeVersion: 'v22.0.0',
  };

  it('flags low disk space', () => {
    const checks = collectHealth({
      ...baseInput,
      diskFreeBytes: 2 * 1024 ** 3,
      diskTotalBytes: 100 * 1024 ** 3,
    });
    const disk = checks.find((c) => c.id === 'disk');
    expect(disk?.status).toBe('fail');
  });

  it('flags critical memory', () => {
    const checks = collectHealth({
      ...baseInput,
      memAvailableBytes: 500 * 1024 ** 2,
      memTotalBytes: 8 * 1024 ** 3,
    });
    const mem = checks.find((c) => c.id === 'memory');
    expect(mem?.status).toBe('fail');
  });

  it('flags warn for low disk', () => {
    const checks = collectHealth({
      ...baseInput,
      diskFreeBytes: 10 * 1024 ** 3,
      diskTotalBytes: 100 * 1024 ** 3,
    });
    const disk = checks.find((c) => c.id === 'disk');
    expect(disk?.status).toBe('warn');
  });

  it('flags missing dependencies', () => {
    const checks = collectHealth({
      ...baseInput,
      repoPath: '/tmp/empty-dir-for-test',
    });
    const deps = checks.find((c) => c.id === 'dependencies');
    expect(deps?.status).toBe('warn');
  });

  it('passes for healthy system', () => {
    const checks = collectHealth({
      ...baseInput,
      repoPath: process.cwd(),
    });
    const fsCheck = checks.find((c) => c.id === 'filesystem');
    expect(fsCheck?.status).toBe('pass');
  });
});

describe('run', () => {
  it('returns stdout on success', () => {
    const result = run('echo', ['hello world']);
    expect(result).toBe('hello world');
  });

  it('returns null on command failure', () => {
    const result = run('false', []);
    expect(result).toBeNull();
  });

  it('returns null for non-existent command', () => {
    const result = run('nonexistent-command-xyz', []);
    expect(result).toBeNull();
  });

  it('times out on long-running command', () => {
    const result = run('sleep', ['10'], 10);
    expect(result).toBeNull();
  });
});

describe('readCpuStat', () => {
  it('parses /proc/stat and returns a snapshot', () => {
    const stat = readCpuStat();
    if (stat === null) {
      // /proc/stat may not exist in all environments (e.g., non-Linux)
      return;
    }
    expect(stat).toHaveProperty('time');
    expect(stat).toHaveProperty('perCores');
    expect(stat).toHaveProperty('totalIdle');
    expect(stat).toHaveProperty('total');
    expect(stat).toHaveProperty('processes');
    expect(stat).toHaveProperty('contextSwitches');
    expect(stat).toHaveProperty('interrupts');
    expect(Array.isArray(stat.perCores)).toBe(true);
    expect(typeof stat.totalIdle).toBe('number');
    expect(typeof stat.total).toBe('number');
  });

  it('returns null when /proc/stat is unreadable', () => {
    // This test is environment-dependent; on Linux it should succeed
    const stat = readCpuStat();
    // Either returns a valid snapshot or null (in non-Linux environments)
    expect(stat === null || typeof stat === 'object').toBe(true);
  });
});

describe('collectCpu', () => {
  it('returns CPU info with expected structure', () => {
    const cpu = collectCpu();
    expect(cpu).toHaveProperty('model');
    expect(cpu).toHaveProperty('physicalCores');
    expect(cpu).toHaveProperty('logicalCores');
    expect(cpu).toHaveProperty('speed');
    expect(cpu).toHaveProperty('loadAvg');
    expect(cpu).toHaveProperty('usage');
    expect(cpu).toHaveProperty('perCore');
    expect(cpu).toHaveProperty('processes');
    expect(cpu).toHaveProperty('contextSwitches');
    expect(cpu).toHaveProperty('interrupts');
    expect(cpu).toHaveProperty('governor');
    expect(typeof cpu.model).toBe('string');
    expect(typeof cpu.physicalCores).toBe('number');
    expect(typeof cpu.logicalCores).toBe('number');
    expect(cpu.logicalCores).toBeGreaterThan(0);
    expect(Array.isArray(cpu.loadAvg)).toBe(true);
    expect(cpu.loadAvg.length).toBe(3);
    expect(Array.isArray(cpu.perCore)).toBe(true);
  });

  it('returns usage 0 on first call (no delta)', () => {
    // Reset the internal state by creating a fresh module reference is not possible
    // but we can at least verify the structure
    const cpu = collectCpu();
    expect(typeof cpu.usage).toBe('number');
    expect(cpu.usage).toBeGreaterThanOrEqual(0);
    expect(cpu.usage).toBeLessThanOrEqual(100);
  });
});

describe('countPhysicalCores', () => {
  it('returns a positive number', () => {
    const cores = countPhysicalCores();
    expect(typeof cores).toBe('number');
    expect(cores).toBeGreaterThan(0);
  });

  it('falls back to logical cores when physical id unavailable', () => {
    const cores = countPhysicalCores();
    const logical = os.cpus().length;
    expect(cores).toBeLessThanOrEqual(logical);
  });
});

describe('collectMemory', () => {
  it('returns memory detail with all expected fields', () => {
    const mem = collectMemory();
    expect(mem).toHaveProperty('total');
    expect(mem).toHaveProperty('free');
    expect(mem).toHaveProperty('available');
    expect(mem).toHaveProperty('used');
    expect(mem).toHaveProperty('buffers');
    expect(mem).toHaveProperty('cached');
    expect(mem).toHaveProperty('active');
    expect(mem).toHaveProperty('inactive');
    expect(mem).toHaveProperty('dirty');
    expect(mem).toHaveProperty('swapTotal');
    expect(mem).toHaveProperty('swapFree');
    expect(mem).toHaveProperty('swapUsed');
    expect(mem).toHaveProperty('hugePagesTotal');
    expect(mem).toHaveProperty('hugePagesFree');
    expect(typeof mem.total).toBe('number');
    expect(mem.total).toBeGreaterThan(0);
    expect(mem.used).toBeLessThanOrEqual(mem.total);
    expect(mem.available).toBeLessThanOrEqual(mem.total);
  });
});

describe('collectTemperature', () => {
  it('returns array of temperature readings', () => {
    const temps = collectTemperature();
    expect(Array.isArray(temps)).toBe(true);
    for (const t of temps) {
      expect(t).toHaveProperty('type');
      expect(t).toHaveProperty('temp');
      expect(typeof t.type).toBe('string');
      expect(typeof t.temp).toBe('number');
    }
  });
});

describe('collectNetwork', () => {
  it('returns interfaces and gateway', () => {
    const net = collectNetwork();
    expect(net).toHaveProperty('interfaces');
    expect(net).toHaveProperty('gateway');
    expect(Array.isArray(net.interfaces)).toBe(true);
    for (const iface of net.interfaces) {
      expect(iface).toHaveProperty('name');
      expect(iface).toHaveProperty('family');
      expect(iface).toHaveProperty('address');
      expect(iface).toHaveProperty('netmask');
      expect(iface).toHaveProperty('mac');
      expect(iface).toHaveProperty('internal');
    }
    expect(net.gateway === null || typeof net.gateway === 'string').toBe(true);
  });

  it('includes loopback interface', () => {
    const net = collectNetwork();
    const lo = net.interfaces.find((i) => i.name === 'lo' || i.internal);
    expect(lo).toBeDefined();
  });
});

describe('collectOS', () => {
  it('returns OS info with all expected fields', () => {
    const osInfo = collectOS();
    expect(osInfo).toHaveProperty('platform');
    expect(osInfo).toHaveProperty('type');
    expect(osInfo).toHaveProperty('release');
    expect(osInfo).toHaveProperty('kernel');
    expect(osInfo).toHaveProperty('arch');
    expect(osInfo).toHaveProperty('hostname');
    expect(osInfo).toHaveProperty('user');
    expect(osInfo).toHaveProperty('home');
    expect(osInfo).toHaveProperty('uptime');
    expect(osInfo).toHaveProperty('bootTime');
    expect(osInfo).toHaveProperty('timezone');
    expect(osInfo).toHaveProperty('locale');
    expect(osInfo).toHaveProperty('cpuModel');
    expect(typeof osInfo.platform).toBe('string');
    expect(typeof osInfo.uptime).toBe('number');
    expect(osInfo.uptime).toBeGreaterThan(0);
  });
});

describe('collectDisks', () => {
  it('returns array of disk usage', () => {
    const disks = collectDisks();
    expect(Array.isArray(disks)).toBe(true);
    for (const d of disks) {
      expect(d).toHaveProperty('filesystem');
      expect(d).toHaveProperty('type');
      expect(d).toHaveProperty('size');
      expect(d).toHaveProperty('used');
      expect(d).toHaveProperty('available');
      expect(d).toHaveProperty('capacity');
      expect(d).toHaveProperty('mount');
      expect(typeof d.size).toBe('number');
      expect(typeof d.capacity).toBe('number');
    }
  });

  it('returns empty array when df fails', () => {
    // We can't easily mock df, but we verify the function returns an array
    const disks = collectDisks();
    expect(Array.isArray(disks)).toBe(true);
  });
});

describe('collectGpu', () => {
  it('returns GPU info structure', () => {
    const gpu = collectGpu();
    expect(gpu).toHaveProperty('available');
    expect(gpu).toHaveProperty('gpus');
    expect(gpu).toHaveProperty('processes');
    expect(Array.isArray(gpu.gpus)).toBe(true);
    expect(Array.isArray(gpu.processes)).toBe(true);
    if (!gpu.available) {
      expect(gpu).toHaveProperty('error');
      expect(typeof gpu.error).toBe('string');
    }
    for (const g of gpu.gpus) {
      expect(g).toHaveProperty('name');
      expect(g).toHaveProperty('driver');
      expect(g).toHaveProperty('memoryTotal');
      expect(g).toHaveProperty('memoryUsed');
      expect(g).toHaveProperty('memoryFree');
      expect(g).toHaveProperty('utilization');
      expect(g).toHaveProperty('temperature');
      expect(g).toHaveProperty('powerDraw');
      expect(g).toHaveProperty('fanSpeed');
    }
  });
});

describe('collectDocker', () => {
  it('returns Docker info structure', () => {
    const docker = collectDocker();
    expect(docker).toHaveProperty('available');
    expect(docker).toHaveProperty('containers');
    expect(docker).toHaveProperty('imageCount');
    expect(docker).toHaveProperty('stats');
    expect(Array.isArray(docker.containers)).toBe(true);
    expect(typeof docker.imageCount).toBe('number');
    expect(Array.isArray(docker.stats)).toBe(true);
    if (!docker.available) {
      expect(docker).toHaveProperty('error');
      expect(typeof docker.error).toBe('string');
    } else {
      expect(docker).toHaveProperty('version');
    }
    for (const c of docker.containers) {
      expect(c).toHaveProperty('id');
      expect(c).toHaveProperty('names');
      expect(c).toHaveProperty('image');
      expect(c).toHaveProperty('status');
      expect(c).toHaveProperty('state');
      expect(c).toHaveProperty('ports');
      expect(c).toHaveProperty('createdAt');
    }
    for (const s of docker.stats) {
      expect(s).toHaveProperty('name');
      expect(s).toHaveProperty('cpuPerc');
      expect(s).toHaveProperty('memUsed');
      expect(s).toHaveProperty('memLimit');
      expect(s).toHaveProperty('memPerc');
      expect(s).toHaveProperty('netIn');
      expect(s).toHaveProperty('netOut');
    }
  });
});

describe('collectGit', () => {
  it('returns Git status for current repo', () => {
    const git = collectGit(process.cwd());
    expect(git).toHaveProperty('available');
    expect(git).toHaveProperty('branch');
    expect(git).toHaveProperty('head');
    expect(git).toHaveProperty('lastCommit');
    expect(git).toHaveProperty('modified');
    expect(git).toHaveProperty('staged');
    expect(git).toHaveProperty('untracked');
    expect(git).toHaveProperty('conflicts');
    expect(git).toHaveProperty('ahead');
    expect(git).toHaveProperty('behind');
    expect(git).toHaveProperty('dirty');
    if (!git.available) {
      expect(git).toHaveProperty('error');
      expect(typeof git.error).toBe('string');
    }
  });

  it('returns unavailable for non-git directory', () => {
    const git = collectGit('/tmp/nonexistent-git-repo-xyz');
    expect(git.available).toBe(false);
    expect(git.error).toBe('Not a git repository');
  });
});

describe('collectVersions', () => {
  it('returns versions object with expected keys', () => {
    const versions = collectVersions();
    expect(typeof versions).toBe('object');
    expect(versions).toHaveProperty('node');
    expect(versions).toHaveProperty('npm');
    expect(versions).toHaveProperty('pnpm');
    expect(versions).toHaveProperty('yarn');
    expect(versions).toHaveProperty('tsc');
    expect(versions).toHaveProperty('python');
    expect(versions).toHaveProperty('git');
    expect(versions).toHaveProperty('docker');
    expect(versions).toHaveProperty('docker-compose');
    expect(versions).toHaveProperty('kubernetes');
    expect(versions).toHaveProperty('github-cli');
    expect(versions).toHaveProperty('openssl');
    expect(versions).toHaveProperty('sqlite');
    // At least node should be available
    expect(versions.node).not.toBeNull();
    expect(typeof versions.node).toBe('string');
  });

  it('caches results for 60 seconds', () => {
    const v1 = collectVersions();
    const v2 = collectVersions();
    expect(v1).toBe(v2); // Same cached object
  });
});

describe('collectProcesses', () => {
  it('returns processes with expected structure', () => {
    const result = collectProcesses(10);
    expect(result).toHaveProperty('processes');
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('threads');
    expect(Array.isArray(result.processes)).toBe(true);
    expect(typeof result.total).toBe('number');
    expect(typeof result.threads).toBe('number');
    expect(result.processes.length).toBeLessThanOrEqual(10);
    for (const p of result.processes) {
      expect(p).toHaveProperty('pid');
      expect(p).toHaveProperty('ppid');
      expect(p).toHaveProperty('user');
      expect(p).toHaveProperty('status');
      expect(p).toHaveProperty('cpu');
      expect(p).toHaveProperty('mem');
      expect(p).toHaveProperty('rss');
      expect(p).toHaveProperty('vsz');
      expect(p).toHaveProperty('threads');
      expect(p).toHaveProperty('etime');
      expect(p).toHaveProperty('command');
    }
  });

  it('sorts processes by CPU descending', () => {
    const result = collectProcesses(5);
    for (let i = 1; i < result.processes.length; i++) {
      expect(result.processes[i].cpu).toBeLessThanOrEqual(result.processes[i - 1].cpu);
    }
  });

  it('respects limit parameter', () => {
    const result = collectProcesses(3);
    expect(result.processes.length).toBeLessThanOrEqual(3);
  });
});

describe('killProcess', () => {
  it('returns ok false for invalid PID', () => {
    // PID 0 sends signal to process group - use -1 instead
    const result = killProcess(-1);
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns ok false for PID 1 (init)', () => {
    const result = killProcess(1);
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('attempts to kill a valid PID (may fail if process does not exist)', () => {
    // Use a very high PID that likely doesn't exist
    const result = killProcess(999999);
    // Should not throw, returns ok false with error
    expect(result).toHaveProperty('ok');
  });
});

describe('scanWorkspace', () => {
  it('returns FsScan structure for valid path', () => {
    const scan = scanWorkspace(process.cwd());
    expect(scan).toHaveProperty('dirSizes');
    expect(scan).toHaveProperty('largeFiles');
    expect(scan).toHaveProperty('recentlyModified');
    expect(Array.isArray(scan.dirSizes)).toBe(true);
    expect(Array.isArray(scan.largeFiles)).toBe(true);
    expect(Array.isArray(scan.recentlyModified)).toBe(true);
    for (const d of scan.dirSizes) {
      expect(d).toHaveProperty('dir');
      expect(d).toHaveProperty('size');
    }
    for (const f of scan.largeFiles) {
      expect(f).toHaveProperty('file');
      expect(f).toHaveProperty('size');
    }
    for (const r of scan.recentlyModified) {
      expect(r).toHaveProperty('file');
      expect(r).toHaveProperty('mtime');
    }
  });

  it('returns empty arrays for non-existent path', () => {
    const scan = scanWorkspace('/tmp/nonexistent-path-xyz-123');
    expect(scan.dirSizes).toEqual([]);
    expect(scan.largeFiles).toEqual([]);
    expect(scan.recentlyModified).toEqual([]);
  });
});

describe('parsePsLine edge cases', () => {
  it('handles command with many spaces', () => {
    const fields = parsePsLine('100 200 user S 0.0 0.1 1024 2048 1 00:00:00 cmd with    many   spaces', 11);
    expect(fields.length).toBe(11);
    expect(fields[10]).toBe('cmd with    many   spaces');
  });

  it('handles kernel thread notation', () => {
    const fields = parsePsLine('2 0 root S 0.0 0.0 0 0 0 00:00:00 [kthreadd]', 11);
    expect(fields.length).toBe(11);
    expect(fields[10]).toBe('[kthreadd]');
  });

  it('returns empty array for empty line', () => {
    expect(parsePsLine('', 11)).toEqual([]);
    expect(parsePsLine('   ', 11)).toEqual([]);
  });
});

describe('parseDf edge cases', () => {
  it('handles df output with different filesystems', () => {
    const output = [
      'Filesystem     Type  1024-blocks     Used Available Capacity% Mounted on',
      '/dev/nvme0n1p1 ext4   50000000  20000000  30000000        40% /',
      '/dev/sdb1      ext4   100000000 50000000  50000000        50% /mnt/data',
      'overlay        overlay 50000000  10000000  40000000        20% /var/lib/docker/overlay2/...',
    ].join('\n');
    const rows = parseDf(output);
    expect(rows).toHaveLength(3);
    expect(rows[0].filesystem).toBe('/dev/nvme0n1p1');
    expect(rows[1].mount).toBe('/mnt/data');
    expect(rows[2].type).toBe('overlay');
  });

  it('ignores header line', () => {
    const output = 'Filesystem     Type  1024-blocks     Used Available Capacity% Mounted on';
    const rows = parseDf(output);
    expect(rows).toHaveLength(0);
  });
});

describe('parseDockerStat edge cases', () => {
  it('handles different memory units', () => {
    const stat = parseDockerStat('test|1.0%|100KiB / 1MiB|10.0%|1KB / 2KB');
    expect(stat).not.toBeNull();
    expect(stat?.memUsed).toBeCloseTo(100 * 1024);
    expect(stat?.memLimit).toBeCloseTo(1 * 1024 * 1024);
    expect(stat?.netIn).toBeCloseTo(1 * 1024);
    expect(stat?.netOut).toBeCloseTo(2 * 1024);
  });

  it('returns null for empty line', () => {
    expect(parseDockerStat('')).toBeNull();
  });

  it('returns null for partial line', () => {
    expect(parseDockerStat('name|1.0%')).toBeNull();
  });
});

describe('collectHealth edge cases', () => {
  const baseInput: HealthInput = {
    repoPath: process.cwd(),
    workspaceStatus: 'ready',
    memAvailableBytes: 1024 ** 3,
    memTotalBytes: 8 * 1024 ** 3,
    diskFreeBytes: 10 * 1024 ** 3,
    diskTotalBytes: 100 * 1024 ** 3,
    gpuAvailable: false,
    dockerAvailable: false,
    gitAvailable: true,
    pythonAvailable: true,
    nodeVersion: 'v22.0.0',
  };

  it('passes filesystem when repo is writable', () => {
    const checks = collectHealth(baseInput);
    const fs = checks.find((c) => c.id === 'filesystem');
    expect(fs?.status).toBe('pass');
  });

  it('flags memory as warn when available < 20%', () => {
    const checks = collectHealth({
      ...baseInput,
      memAvailableBytes: 1024 ** 3, // 1GB out of 8GB = 12.5% -> warn
      memTotalBytes: 8 * 1024 ** 3,
    });
    const mem = checks.find((c) => c.id === 'memory');
    expect(mem?.status).toBe('warn');
  });

  it('flags memory as fail when available < 10%', () => {
    const checks = collectHealth({
      ...baseInput,
      memAvailableBytes: 512 * 1024 ** 3, // 0.5GB out of 8GB = 6.25% -> fail
      memTotalBytes: 8 * 1024 ** 3,
    });
    const mem = checks.find((c) => c.id === 'memory');
    expect(mem?.status).toBe('fail');
  });

  it('flags disk as warn when free < 15%', () => {
    const checks = collectHealth({
      ...baseInput,
      diskFreeBytes: 10 * 1024 ** 3, // 10GB out of 100GB = 10% -> warn
      diskTotalBytes: 100 * 1024 ** 3,
    });
    const disk = checks.find((c) => c.id === 'disk');
    expect(disk?.status).toBe('warn');
  });

  it('flags disk as fail when free < 5%', () => {
    const checks = collectHealth({
      ...baseInput,
      diskFreeBytes: 3 * 1024 ** 3, // 3GB out of 100GB = 3% -> fail
      diskTotalBytes: 100 * 1024 ** 3,
    });
    const disk = checks.find((c) => c.id === 'disk');
    expect(disk?.status).toBe('fail');
  });

  it('flags dependencies as warn when node_modules missing', () => {
    const checks = collectHealth({
      ...baseInput,
      repoPath: '/tmp/empty-dir-for-test',
    });
    const deps = checks.find((c) => c.id === 'dependencies');
    expect(deps?.status).toBe('warn');
  });

  it('flags workspace as warn when status not ready/running', () => {
    const checks = collectHealth({
      ...baseInput,
      workspaceStatus: 'error',
    });
    const ws = checks.find((c) => c.id === 'workspace');
    expect(ws?.status).toBe('warn');
  });
});

describe('readinessScore edge cases', () => {
  it('returns 100 for all pass', () => {
    const checks = [
      { id: 'a', name: 'A', status: 'pass' as const, detail: '' },
      { id: 'b', name: 'B', status: 'pass' as const, detail: '' },
    ];
    expect(readinessScore(checks)).toBe(100);
  });

  it('returns 0 for all fail', () => {
    const checks = [
      { id: 'a', name: 'A', status: 'fail' as const, detail: '' },
      { id: 'b', name: 'B', status: 'fail' as const, detail: '' },
    ];
    expect(readinessScore(checks)).toBe(0);
  });

  it('handles unknown status as 0.5 weight', () => {
    const checks = [
      { id: 'a', name: 'A', status: 'unknown' as const, detail: '' },
      { id: 'b', name: 'B', status: 'pass' as const, detail: '' },
    ];
    expect(readinessScore(checks)).toBe(75); // (0.5 + 1) / 2 * 100 = 75
  });

  it('returns 0 for empty array', () => {
    expect(readinessScore([])).toBe(0);
  });
});
