import type { RuntimeCategory, RuntimeDefinition, RuntimeLifecycleConfig, RuntimeType } from '@vestara/types';

const DEFAULT_LIFECYCLE: RuntimeLifecycleConfig = {
  maxDegradedMs: 300_000,
  maxRecoveryAttempts: 3,
  healthCheckIntervalMs: 30_000,
  quarantineTimeoutMs: 600_000,
};

const SYSTEM_LIFECYCLE: RuntimeLifecycleConfig = {
  maxDegradedMs: 60_000,
  maxRecoveryAttempts: 5,
  healthCheckIntervalMs: 10_000,
  quarantineTimeoutMs: 300_000,
};

export const REGISTRY: Record<RuntimeType, RuntimeDefinition> = {
  runtime: {
    type: 'runtime',
    parent: null,
    category: 'core',
    singleton: false,
    persistable: false,
    capabilities: [],
    lifecycle: DEFAULT_LIFECYCLE,
    dependencies: [],
    metadata: { displayName: 'Runtime', description: 'Abstract base runtime — not instantiated directly' },
    version: '1.0.0',
  },
  system: {
    type: 'system',
    parent: 'runtime',
    category: 'core',
    singleton: true,
    persistable: true,
    capabilities: ['system:configure', 'system:monitor', 'system:shutdown'],
    lifecycle: SYSTEM_LIFECYCLE,
    dependencies: [],
    metadata: { displayName: 'System', description: 'Kernel itself' },
    version: '1.0.0',
  },
  kernel: {
    type: 'kernel',
    parent: 'system',
    category: 'core',
    singleton: true,
    persistable: true,
    capabilities: ['system:configure', 'system:monitor', 'system:shutdown'],
    lifecycle: SYSTEM_LIFECYCLE,
    dependencies: [],
    metadata: { displayName: 'Kernel', description: 'System kernel (alias for system)' },
    version: '1.0.0',
  },
  workspace: {
    type: 'workspace',
    parent: 'runtime',
    category: 'core',
    singleton: true,
    persistable: true,
    capabilities: ['project:manage', 'session:manage', 'repository:read'],
    lifecycle: DEFAULT_LIFECYCLE,
    dependencies: ['memory', 'repository', 'project'],
    metadata: { displayName: 'Workspace', description: 'User workspace/desktop' },
    version: '1.0.0',
  },
  agent: {
    type: 'agent',
    parent: 'runtime',
    category: 'core',
    singleton: false,
    persistable: true,
    capabilities: ['language:typescript:develop', 'language:rust:develop', 'architecture:design:develop'],
    lifecycle: DEFAULT_LIFECYCLE,
    dependencies: ['memory', 'tool'],
    metadata: { displayName: 'Agent', description: 'AI agent runtime' },
    version: '1.0.0',
  },
  'ai-agent': {
    type: 'ai-agent',
    parent: 'agent',
    category: 'core',
    singleton: false,
    persistable: true,
    capabilities: [
      'language:typescript:develop',
      'language:rust:develop',
      'architecture:design:develop',
      'review:code:review',
    ],
    lifecycle: DEFAULT_LIFECYCLE,
    dependencies: ['memory', 'tool', 'model'],
    metadata: { displayName: 'AI Agent', description: 'General AI coding agent' },
    version: '1.0.0',
  },
  workflow: {
    type: 'workflow',
    parent: 'runtime',
    category: 'core',
    singleton: false,
    persistable: true,
    capabilities: ['workflow:execute:plan'],
    lifecycle: DEFAULT_LIFECYCLE,
    dependencies: [],
    metadata: { displayName: 'Workflow', description: 'Multi-step workflow executor' },
    version: '1.0.0',
  },
  session: {
    type: 'session',
    parent: 'runtime',
    category: 'core',
    singleton: false,
    persistable: true,
    capabilities: ['session:manage:monitor'],
    lifecycle: DEFAULT_LIFECYCLE,
    dependencies: [],
    metadata: { displayName: 'Session', description: 'User or agent session' },
    version: '1.0.0',
  },
  repository: {
    type: 'repository',
    parent: 'runtime',
    category: 'core',
    singleton: false,
    persistable: true,
    capabilities: ['repository:git:analyze', 'repository:git:develop'],
    lifecycle: DEFAULT_LIFECYCLE,
    dependencies: ['git'],
    metadata: { displayName: 'Repository', description: 'Git repository manager' },
    version: '1.0.0',
  },
  project: {
    type: 'project',
    parent: 'runtime',
    category: 'core',
    singleton: false,
    persistable: true,
    capabilities: ['project:manage:develop'],
    lifecycle: DEFAULT_LIFECYCLE,
    dependencies: [],
    metadata: { displayName: 'Project', description: 'Project workspace manager' },
    version: '1.0.0',
  },
  plugin: {
    type: 'plugin',
    parent: 'runtime',
    category: 'extension',
    singleton: false,
    persistable: false,
    capabilities: [],
    lifecycle: DEFAULT_LIFECYCLE,
    dependencies: [],
    metadata: { displayName: 'Plugin', description: 'Plugin runtime' },
    version: '1.0.0',
  },
  widget: {
    type: 'widget',
    parent: 'runtime',
    category: 'extension',
    singleton: false,
    persistable: true,
    capabilities: ['ui:widget:develop'],
    lifecycle: DEFAULT_LIFECYCLE,
    dependencies: [],
    metadata: { displayName: 'Widget', description: 'Dashboard widget runtime' },
    version: '1.0.0',
  },
  memory: {
    type: 'memory',
    parent: 'runtime',
    category: 'core',
    singleton: true,
    persistable: true,
    capabilities: ['memory:store:develop', 'memory:query:analyze'],
    lifecycle: DEFAULT_LIFECYCLE,
    dependencies: ['state'],
    metadata: { displayName: 'Memory', description: 'Persistent memory store' },
    version: '1.0.0',
  },
  tool: {
    type: 'tool',
    parent: 'runtime',
    category: 'extension',
    singleton: false,
    persistable: false,
    capabilities: ['tool:execute:develop'],
    lifecycle: DEFAULT_LIFECYCLE,
    dependencies: [],
    metadata: { displayName: 'Tool', description: 'Tool executor (filesystem, shell, etc.)' },
    version: '1.0.0',
  },
  model: {
    type: 'model',
    parent: 'runtime',
    category: 'core',
    singleton: false,
    persistable: true,
    capabilities: ['model:inference:develop', 'model:training:develop'],
    lifecycle: DEFAULT_LIFECYCLE,
    dependencies: [],
    metadata: { displayName: 'Model', description: 'AI model provider runtime' },
    version: '1.0.0',
  },
  service: {
    type: 'service',
    parent: 'runtime',
    category: 'core',
    singleton: false,
    persistable: true,
    capabilities: [],
    lifecycle: DEFAULT_LIFECYCLE,
    dependencies: [],
    metadata: { displayName: 'Service', description: 'Background service runtime' },
    version: '1.0.0',
  },
  build: {
    type: 'build',
    parent: 'runtime',
    category: 'core',
    singleton: false,
    persistable: false,
    capabilities: ['build:compile:develop', 'build:test:test'],
    lifecycle: DEFAULT_LIFECYCLE,
    dependencies: [],
    metadata: { displayName: 'Build', description: 'Build/pipeline runtime' },
    version: '1.0.0',
  },
  terminal: {
    type: 'terminal',
    parent: 'runtime',
    category: 'core',
    singleton: false,
    persistable: false,
    capabilities: ['terminal:shell:develop'],
    lifecycle: DEFAULT_LIFECYCLE,
    dependencies: [],
    metadata: { displayName: 'Terminal', description: 'Terminal session runtime' },
    version: '1.0.0',
  },
  git: {
    type: 'git',
    parent: 'runtime',
    category: 'core',
    singleton: false,
    persistable: false,
    capabilities: ['repository:git:develop', 'repository:git:analyze'],
    lifecycle: DEFAULT_LIFECYCLE,
    dependencies: [],
    metadata: { displayName: 'Git', description: 'Git operations runtime' },
    version: '1.0.0',
  },
  intent: {
    type: 'intent',
    parent: 'runtime',
    category: 'core',
    singleton: false,
    persistable: true,
    capabilities: ['intent:plan:plan', 'intent:decompose:analyze'],
    lifecycle: DEFAULT_LIFECYCLE,
    dependencies: [],
    metadata: { displayName: 'Intent', description: 'Intent-to-plan runtime' },
    version: '1.0.0',
  },
  planner: {
    type: 'planner',
    parent: 'runtime',
    category: 'core',
    singleton: false,
    persistable: true,
    capabilities: ['plan:generate:plan', 'plan:optimize:optimize'],
    lifecycle: DEFAULT_LIFECYCLE,
    dependencies: ['intent'],
    metadata: { displayName: 'Planner', description: 'Execution plan generator' },
    version: '1.0.0',
  },
  scheduler: {
    type: 'scheduler',
    parent: 'system',
    category: 'core',
    singleton: true,
    persistable: true,
    capabilities: ['schedule:assign:plan', 'schedule:optimize:optimize'],
    lifecycle: SYSTEM_LIFECYCLE,
    dependencies: ['job-manager'],
    metadata: { displayName: 'Scheduler', description: 'Job scheduler' },
    version: '1.0.0',
  },
  'job-manager': {
    type: 'job-manager',
    parent: 'system',
    category: 'core',
    singleton: true,
    persistable: true,
    capabilities: ['job:manage:develop', 'job:lifecycle:monitor'],
    lifecycle: SYSTEM_LIFECYCLE,
    dependencies: ['event-bus'],
    metadata: { displayName: 'Job Manager', description: 'Job lifecycle manager' },
    version: '1.0.0',
  },
  'event-bus': {
    type: 'event-bus',
    parent: 'system',
    category: 'core',
    singleton: true,
    persistable: false,
    capabilities: ['event:publish:develop', 'event:subscribe:monitor'],
    lifecycle: SYSTEM_LIFECYCLE,
    dependencies: [],
    metadata: { displayName: 'Event Bus', description: 'Event routing' },
    version: '1.0.0',
  },
  verification: {
    type: 'verification',
    parent: 'system',
    category: 'core',
    singleton: true,
    persistable: true,
    capabilities: ['verification:check:test', 'verification:policy:configure'],
    lifecycle: SYSTEM_LIFECYCLE,
    dependencies: [],
    metadata: { displayName: 'Verification', description: 'Verification engine' },
    version: '1.0.0',
  },
  trust: {
    type: 'trust',
    parent: 'system',
    category: 'core',
    singleton: true,
    persistable: true,
    capabilities: ['trust:score:analyze', 'trust:evaluate:monitor'],
    lifecycle: SYSTEM_LIFECYCLE,
    dependencies: ['verification'],
    metadata: { displayName: 'Trust', description: 'Trust scoring engine' },
    version: '1.0.0',
  },
  recovery: {
    type: 'recovery',
    parent: 'system',
    category: 'core',
    singleton: true,
    persistable: true,
    capabilities: ['recovery:execute:develop', 'recovery:plan:plan'],
    lifecycle: SYSTEM_LIFECYCLE,
    dependencies: ['health', 'trust'],
    metadata: { displayName: 'Recovery', description: 'Recovery manager' },
    version: '1.0.0',
  },
  lock: {
    type: 'lock',
    parent: 'system',
    category: 'core',
    singleton: true,
    persistable: false,
    capabilities: ['lock:acquire:develop', 'lock:release:develop'],
    lifecycle: SYSTEM_LIFECYCLE,
    dependencies: [],
    metadata: { displayName: 'Lock', description: 'Resource lock manager' },
    version: '1.0.0',
  },
  permission: {
    type: 'permission',
    parent: 'system',
    category: 'core',
    singleton: true,
    persistable: true,
    capabilities: ['permission:check:develop', 'permission:grant:configure'],
    lifecycle: SYSTEM_LIFECYCLE,
    dependencies: [],
    metadata: { displayName: 'Permission', description: 'Permission manager' },
    version: '1.0.0',
  },
  state: {
    type: 'state',
    parent: 'system',
    category: 'core',
    singleton: true,
    persistable: true,
    capabilities: ['state:persist:develop', 'state:query:analyze'],
    lifecycle: SYSTEM_LIFECYCLE,
    dependencies: [],
    metadata: { displayName: 'State', description: 'State/DB manager' },
    version: '1.0.0',
  },
  config: {
    type: 'config',
    parent: 'system',
    category: 'core',
    singleton: true,
    persistable: true,
    capabilities: ['config:load:develop', 'config:validate:develop'],
    lifecycle: SYSTEM_LIFECYCLE,
    dependencies: [],
    metadata: { displayName: 'Config', description: 'Configuration manager' },
    version: '1.0.0',
  },
  health: {
    type: 'health',
    parent: 'system',
    category: 'core',
    singleton: true,
    persistable: true,
    capabilities: ['health:check:monitor', 'health:report:monitor'],
    lifecycle: SYSTEM_LIFECYCLE,
    dependencies: [],
    metadata: { displayName: 'Health', description: 'Health monitoring' },
    version: '1.0.0',
  },
  'worker-pool': {
    type: 'worker-pool',
    parent: 'runtime',
    category: 'core',
    singleton: true,
    persistable: true,
    capabilities: ['worker:manage:develop', 'worker:assign:plan'],
    lifecycle: DEFAULT_LIFECYCLE,
    dependencies: ['scheduler'],
    metadata: { displayName: 'Worker Pool', description: 'Worker management' },
    version: '1.0.0',
  },
  dashboard: {
    type: 'dashboard',
    parent: 'runtime',
    category: 'core',
    singleton: true,
    persistable: true,
    capabilities: ['ui:dashboard:develop', 'ui:widget:develop'],
    lifecycle: DEFAULT_LIFECYCLE,
    dependencies: ['workspace', 'event-bus'],
    metadata: { displayName: 'Dashboard', description: 'Dashboard/UI runtime' },
    version: '1.0.0',
  },
};

export function getRuntimeDefinition(type: RuntimeType): RuntimeDefinition {
  const def = REGISTRY[type];
  if (!def) {
    throw new Error(`Unknown runtime type: "${type}"`);
  }
  return def;
}

export function getRuntimeDependencies(type: RuntimeType): RuntimeType[] {
  return getRuntimeDefinition(type).dependencies;
}

export function getRuntimeChildren(type: RuntimeType): RuntimeType[] {
  return (Object.keys(REGISTRY) as RuntimeType[]).filter((t) => REGISTRY[t].parent === type);
}

export function getRuntimeTree(type: RuntimeType): RuntimeType[] {
  const result: RuntimeType[] = [type];
  for (const child of getRuntimeChildren(type)) {
    result.push(...getRuntimeTree(child));
  }
  return result;
}

export function isSingleton(type: RuntimeType): boolean {
  return getRuntimeDefinition(type).singleton;
}

export function isSystemRuntime(type: RuntimeType): boolean {
  let current: RuntimeType | null = type;
  const seen = new Set<RuntimeType>();
  while (current && !seen.has(current)) {
    seen.add(current);
    if (current === 'system') return true;
    current = REGISTRY[current]?.parent ?? null;
  }
  return false;
}

export interface RuntimeRegistry {
  getDefinition(type: RuntimeType): RuntimeDefinition;
  getDependencies(type: RuntimeType): RuntimeType[];
  getChildren(type: RuntimeType): RuntimeType[];
  getTree(type: RuntimeType): RuntimeType[];
  isSingleton(type: RuntimeType): boolean;
  isSystemRuntime(type: RuntimeType): boolean;
  getAllTypes(): RuntimeType[];
  getAllCoreTypes(): RuntimeType[];
  getAllExtensionTypes(): RuntimeType[];
  getAllCustomTypes(): RuntimeType[];
}

export function createRuntimeRegistry(): RuntimeRegistry {
  function getDef(type: RuntimeType): RuntimeDefinition {
    return getRuntimeDefinition(type);
  }

  return {
    getDefinition: getDef,
    getDependencies: getRuntimeDependencies,
    getChildren: getRuntimeChildren,
    getTree: getRuntimeTree,
    isSingleton,
    isSystemRuntime,
    getAllTypes: () => Object.keys(REGISTRY) as RuntimeType[],
    getAllCoreTypes: () => (Object.keys(REGISTRY) as RuntimeType[]).filter((t) => REGISTRY[t].category === 'core'),
    getAllExtensionTypes: () =>
      (Object.keys(REGISTRY) as RuntimeType[]).filter((t) => REGISTRY[t].category === 'extension'),
    getAllCustomTypes: () => (Object.keys(REGISTRY) as RuntimeType[]).filter((t) => REGISTRY[t].category === 'custom'),
  };
}
