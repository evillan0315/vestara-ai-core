import { Runtime, type RuntimeConfig, type RuntimeHooks } from '../index';

export interface JobRef {
  id: string;
  type: string;
  status: string;
  createdAt: string;
}

export interface ToolBinding {
  name: string;
  invoke: (input: unknown) => Promise<unknown>;
}

export class AgentRuntime extends Runtime {
  private _jobs: Map<string, JobRef> = new Map();
  private _tools: Map<string, ToolBinding> = new Map();

  constructor(config: RuntimeConfig, tools: ToolBinding[] = [], hooks?: RuntimeHooks) {
    super(config, {
      onInitialize: async () => {
        for (const tool of tools) {
          this._tools.set(tool.name, tool);
        }
        this.startPeriodicHealthCheck(() => this.degrade(['agent-unresponsive']));
        if (hooks?.onInitialize) await hooks.onInitialize();
      },
      onStop: async () => {
        this.stopPeriodicHealthCheck();
        if (hooks?.onStop) await hooks.onStop();
      },
      onDestroy: async () => {
        this.stopPeriodicHealthCheck();
        this._jobs.clear();
        this._tools.clear();
        if (hooks?.onDestroy) await hooks.onDestroy();
      },
      onSuspend: async () => {
        this.stopPeriodicHealthCheck();
        if (hooks?.onSuspend) await hooks.onSuspend();
      },
      onResume: async () => {
        this.startPeriodicHealthCheck(() => this.degrade(['agent-unresponsive']));
        if (hooks?.onResume) await hooks.onResume();
      },
      onDegrade: hooks?.onDegrade,
      onRecover: hooks?.onRecover,
      onQuarantine: hooks?.onQuarantine,
    });
  }

  get jobCount(): number {
    return this._jobs.size;
  }

  get toolCount(): number {
    return this._tools.size;
  }

  submitJob(id: string, type: string): void {
    this._jobs.set(id, { id, type, status: 'requested', createdAt: new Date().toISOString() });
  }

  updateJobStatus(id: string, status: string): void {
    const job = this._jobs.get(id);
    if (job) {
      job.status = status;
    }
  }

  getJob(id: string): JobRef | undefined {
    return this._jobs.get(id);
  }

  hasTool(name: string): boolean {
    return this._tools.has(name);
  }

  getActiveJobs(): JobRef[] {
    return Array.from(this._jobs.values()).filter((j) => j.status === 'running' || j.status === 'requested');
  }
}
