import { describe, expect, it } from 'vitest';
import {
  type CpuSnapshot,
  collectHealth,
  computeCpuUsage,
  type HealthInput,
  parseDf,
  parseDockerStat,
  parsePs,
  parsePsLine,
  readinessScore,
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
});
