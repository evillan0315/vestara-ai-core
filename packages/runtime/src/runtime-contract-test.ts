import type { Runtime } from './index';

type DescribeFn = (name: string, fn: () => void) => void;
type ItFn = (name: string, fn: () => Promise<void> | void) => void;
type ExpectFn = typeof import('vitest').expect;

export interface RuntimeContractTestOptions {
  runtimeName: string;
  createRuntime: () => Runtime;
  describe: DescribeFn;
  it: ItFn;
  expect: ExpectFn;
  skipSuspend?: boolean;
  skipDegrade?: boolean;
}

export function runRuntimeContractTests(options: RuntimeContractTestOptions): void {
  const { runtimeName, createRuntime, describe, it, expect, skipSuspend, skipDegrade } = options;

  describe(`${runtimeName} — Runtime contract`, () => {
    describe('Lifecycle', () => {
      it('initializes from created state', async () => {
        const rt = createRuntime();
        expect(rt.state).toBe('created');
        await rt.initialize();
        expect(rt.state).toBe('running');
      });

      it('stops from running state', async () => {
        const rt = createRuntime();
        await rt.initialize();
        await rt.stop();
        expect(rt.state).toBe('stopped');
      });

      it('can restart after stop', async () => {
        const rt = createRuntime();
        await rt.initialize();
        await rt.stop();
        await rt.start();
        expect(rt.state).toBe('running');
      });

      it('throws if initialized twice', async () => {
        const rt = createRuntime();
        await rt.initialize();
        await expect(rt.initialize()).rejects.toThrow();
      });

      it('destroy transitions to destroyed state', async () => {
        const rt = createRuntime();
        await rt.initialize();
        await rt.stop();
        await rt.destroy();
        expect(rt.state).toBe('destroyed');
      });

      if (!skipSuspend) {
        it('suspends and resumes', async () => {
          const rt = createRuntime();
          await rt.initialize();
          await rt.suspend();
          expect(rt.state).toBe('suspended');
          await rt.resume();
          expect(rt.state).toBe('running');
        });
      }
    });

    describe('Health', () => {
      it('reports healthy after initialization', async () => {
        const rt = createRuntime();
        await rt.initialize();
        expect(rt.health.status).toBe('healthy');
      });

      it('reports health with uptime', async () => {
        const rt = createRuntime();
        await rt.initialize();
        expect(rt.health.uptime).toBeGreaterThanOrEqual(0);
        expect(rt.health.serviceId).toBe(rt.id);
      });

      it('health status is readable at any state', () => {
        const rt = createRuntime();
        expect(rt.health).toBeDefined();
        expect(typeof rt.health.status).toBe('string');
      });
    });

    describe('Info', () => {
      it('exposes runtime info', async () => {
        const rt = createRuntime();
        const info = rt.info;
        expect(info.id).toBe(rt.id);
        expect(info.type).toBe(rt.type);
        expect(info.state).toBe(rt.state);
        expect(info.health).toBe(rt.health);
      });
    });

    if (!skipDegrade) {
      describe('Degrade and recover', () => {
        it('degrades from running state', async () => {
          const rt = createRuntime();
          await rt.initialize();
          await rt.degrade(['check-1']);
          expect(rt.state).toBe('degraded');
          expect(rt.health.status).toBe('degraded');
        });

        it('recovers from degraded state', async () => {
          const rt = createRuntime();
          await rt.initialize();
          await rt.degrade(['check-1']);
          await rt.recover();
          expect(rt.state).toBe('running');
          expect(rt.health.status).toBe('healthy');
        });
      });
    }
  });
}
