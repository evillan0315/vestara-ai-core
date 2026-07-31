import { describe, expect, it, vi } from 'vitest';

describe('@vestara/cli', () => {
  it('module loads without error', async () => {
    const mod = await import('../src/index.js');
    expect(mod).toBeDefined();
  });
});

describe('cli-runtime', () => {
  it('creates CliRuntime with services', async () => {
    const { CliRuntime } = await import('../src/runtime/cli-runtime.js');
    const mockServices = {
      kernel: {} as any,
      conversationEngine: {} as any,
      conversationService: {} as any,
      activity: {} as any,
      conversationId: 'conv-1',
      stateRuntime: {} as any,
      audioService: {} as any,
      sttService: {} as any,
      ttsService: {} as any,
      providerRouter: {} as any,
    };

    const runtime = new CliRuntime({ id: 'test-cli' as any, type: 'runtime' as any, name: 'Test CLI' }, mockServices);

    expect(runtime.kernel).toBe(mockServices.kernel);
    expect(runtime.conversationEngine).toBe(mockServices.conversationEngine);
    expect(runtime.conversationService).toBe(mockServices.conversationService);
    expect(runtime.conversationId).toBe('conv-1');
    expect(runtime.activity).toBe(mockServices.activity);
    expect(runtime.providerRouter).toBe(mockServices.providerRouter);
  });

  it('stops services gracefully', async () => {
    const { CliRuntime } = await import('../src/runtime/cli-runtime.js');
    let stopped = false;
    const mockServices = {
      kernel: {
        shutdown: async () => {
          stopped = true;
        },
      },
      conversationEngine: { endSession: async () => {} },
      conversationService: {} as any,
      activity: { stop: async () => {} },
      conversationId: 'conv-1',
      stateRuntime: { checkpoint: async () => {}, shutdown: async () => {} },
      audioService: {} as any,
      sttService: {} as any,
      ttsService: {} as any,
      providerRouter: {} as any,
    };

    const runtime = new CliRuntime({ id: 'test-cli2' as any, type: 'runtime' as any, name: 'Test CLI' }, mockServices);

    await runtime.initialize();
    await runtime.stop();
    expect(stopped).toBe(true);
  });

  it('stops workspace runtime if present', async () => {
    const { CliRuntime } = await import('../src/runtime/cli-runtime.js');
    let wsStopped = false;
    const mockServices = {
      kernel: { shutdown: async () => {} },
      conversationEngine: { endSession: async () => {} },
      conversationService: {} as any,
      activity: { stop: async () => {} },
      conversationId: 'conv-1',
      stateRuntime: { checkpoint: async () => {}, shutdown: async () => {} },
      audioService: {} as any,
      sttService: {} as any,
      ttsService: {} as any,
      providerRouter: {} as any,
      workspaceRuntime: {
        state: 'running',
        stop: async () => {
          wsStopped = true;
        },
        destroy: async () => {},
      },
    };

    const runtime = new CliRuntime(
      { id: 'test-cli3' as any, type: 'runtime' as any, name: 'Test CLI' },
      mockServices as any,
    );

    await runtime.initialize();
    await runtime.stop();
    expect(wsStopped).toBe(true);
  });

  it('accessor returns undefined when workspaceRuntime is absent', async () => {
    const { CliRuntime } = await import('../src/runtime/cli-runtime.js');
    const runtime = new CliRuntime(
      { id: 'test-cli4' as any, type: 'runtime' as any, name: 'Test CLI' },
      {
        kernel: {} as any,
        conversationEngine: {} as any,
        conversationService: {} as any,
        activity: {} as any,
        conversationId: 'conv-1',
        stateRuntime: {} as any,
        audioService: {} as any,
        sttService: {} as any,
        ttsService: {} as any,
        providerRouter: {} as any,
      },
    );
    expect(runtime.workspaceRuntime).toBeUndefined();
  });
});

describe('command-registry', () => {
  it('registers and retrieves commands', async () => {
    const { CommandRegistry } = await import('../src/lib/command-registry.js');
    const registry = new CommandRegistry();
    let executed = false;

    registry.register('test', async () => {
      executed = true;
    });
    expect(registry.has('test')).toBe(true);
    expect(registry.has('nonexistent')).toBe(false);

    const handler = registry.get('test');
    expect(handler).toBeDefined();
    await handler!([]);
    expect(executed).toBe(true);
  });

  it('lists registered command names', async () => {
    const { CommandRegistry } = await import('../src/lib/command-registry.js');
    const registry = new CommandRegistry();
    registry.register('cmd1', async () => {});
    registry.register('cmd2', async () => {});

    const names = registry.names();
    expect(names).toContain('cmd1');
    expect(names).toContain('cmd2');
  });

  it('get returns undefined for unregistered command', async () => {
    const { CommandRegistry } = await import('../src/lib/command-registry.js');
    const registry = new CommandRegistry();
    const handler = registry.get('unknown');
    expect(handler).toBeUndefined();
  });
});

describe('output format', () => {
  it('renders status with colors', async () => {
    const { renderStatus, BOLD, GREEN, RED, GRAY, RESET, GOLD } = await import('../src/output/format.js');
    expect(BOLD).toBe('\x1b[1m');
    expect(GREEN).toBe('\x1b[32m');
    expect(RED).toBe('\x1b[31m');
    expect(GOLD).toBe('\x1b[33m');
    expect(GRAY).toBe('\x1b[90m');
    expect(RESET).toBe('\x1b[0m');

    const success = renderStatus(true, 'Test');
    expect(success).toContain('✓');
    expect(success).toContain('Test');
  });
});

describe('index entry point', () => {
  it('prints version with -v flag', async () => {
    const origArgv = process.argv;
    const origExit = process.exit;
    process.argv = ['node', 'vestara', '-v'];
    (process.exit as any) = vi.fn() as any;
    const { main } = await import('../src/index.js');
    const logCalls: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
      logCalls.push(String(msg));
    });
    await main();
    expect(logCalls.some((c) => c.includes('vestara v'))).toBe(true);
    logSpy.mockRestore();
    (process.exit as any) = origExit;
    process.argv = origArgv;
  });

  it('prints help with --help flag', async () => {
    const origArgv = process.argv;
    const origExit = process.exit;
    process.argv = ['node', 'vestara', '--help'];
    (process.exit as any) = vi.fn() as any;
    const { main } = await import('../src/index.js');
    const logCalls: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
      logCalls.push(String(msg));
    });
    await main();
    expect(logCalls.some((c) => c.includes('Usage'))).toBe(true);
    logSpy.mockRestore();
    (process.exit as any) = origExit;
    process.argv = origArgv;
  });

  it('handles unknown commands gracefully', async () => {
    const origArgv = process.argv;
    const origExit = process.exit;
    process.argv = ['node', 'vestara', 'nonexistent-command'];
    (process.exit as any) = vi.fn() as any;
    const { main } = await import('../src/index.js');
    const logCalls: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
      logCalls.push(String(msg));
    });
    await main();
    expect(logCalls.some((c) => c.includes('Unknown command'))).toBe(true);
    logSpy.mockRestore();
    (process.exit as any) = origExit;
    process.argv = origArgv;
  });
});
