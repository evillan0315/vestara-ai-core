import type { CapabilityDefinition, CapabilityRelationships } from './model';

export interface TaxonomyEntry {
  definition: CapabilityDefinition;
  relationships?: Partial<CapabilityRelationships>;
}

function cap(
  id: string,
  category: string,
  name: string,
  description: string,
  stability: CapabilityDefinition['stability'] = 'stable',
  metadata?: Record<string, unknown>,
): CapabilityDefinition {
  return {
    id,
    category,
    name,
    version: '1.0.0',
    stability,
    description,
    metadata,
  };
}

function rel(partial: Partial<CapabilityRelationships>): Partial<CapabilityRelationships> {
  return partial;
}

export const BUILTIN_TAXONOMY: TaxonomyEntry[] = [
  // ── repository ────────────────────────────────────────────
  {
    definition: cap('repository.read', 'repository', 'read', 'Read repository contents and history'),
    relationships: rel({}),
  },
  {
    definition: cap('repository.write', 'repository', 'write', 'Write new content to repository'),
    relationships: rel({ requires: ['repository.read'] }),
  },
  {
    definition: cap('repository.commit', 'repository', 'commit', 'Commit staged changes to repository'),
    relationships: rel({ requires: ['repository.write'] }),
  },
  {
    definition: cap('repository.branch', 'repository', 'branch', 'Create, list, and delete branches'),
    relationships: rel({ requires: ['repository.read'] }),
  },
  {
    definition: cap('repository.merge', 'repository', 'merge', 'Merge branches'),
    relationships: rel({ requires: ['repository.read', 'repository.branch'] }),
  },
  {
    definition: cap('repository.clone', 'repository', 'clone', 'Clone a repository'),
    relationships: rel({ requires: ['repository.read'] }),
  },
  {
    definition: cap('repository.push', 'repository', 'push', 'Push commits to remote'),
    relationships: rel({ requires: ['repository.commit'] }),
  },
  {
    definition: cap('repository.pull', 'repository', 'pull', 'Pull changes from remote'),
    relationships: rel({ requires: ['repository.read', 'repository.merge'] }),
  },
  {
    definition: cap('repository.tag', 'repository', 'tag', 'Create and manage tags'),
    relationships: rel({ requires: ['repository.read', 'repository.write'] }),
  },
  {
    definition: cap('repository.diff', 'repository', 'diff', 'Show differences between revisions'),
    relationships: rel({ requires: ['repository.read'] }),
  },
  {
    definition: cap('repository.log', 'repository', 'log', 'View commit log'),
    relationships: rel({ requires: ['repository.read'] }),
  },
  {
    definition: cap('repository.status', 'repository', 'status', 'Show working tree status'),
    relationships: rel({ requires: ['repository.read'] }),
  },

  // ── git ───────────────────────────────────────────────────
  {
    definition: cap('git.fetch', 'git', 'fetch', 'Fetch from remote'),
    relationships: rel({ requires: ['repository.read'] }),
  },
  {
    definition: cap('git.merge', 'git', 'merge', 'Merge branches with git merge'),
    relationships: rel({ requires: ['git.fetch', 'repository.read', 'repository.branch'] }),
  },
  {
    definition: cap('git.rebase', 'git', 'rebase', 'Rebase branches'),
    relationships: rel({ requires: ['git.fetch', 'repository.read'] }),
  },
  {
    definition: cap('git.stash', 'git', 'stash', 'Stash changes'),
    relationships: rel({ requires: ['repository.write'] }),
  },
  {
    definition: cap('git.cherry-pick', 'git', 'cherry-pick', 'Cherry-pick commits'),
    relationships: rel({ requires: ['repository.read', 'repository.write'] }),
  },
  {
    definition: cap('git.reset', 'git', 'reset', 'Reset HEAD to a specified state'),
    relationships: rel({ requires: ['repository.write'] }),
  },
  {
    definition: cap('git.revert', 'git', 'revert', 'Revert commits'),
    relationships: rel({ requires: ['repository.commit'] }),
  },
  {
    definition: cap('git.bisect', 'git', 'bisect', 'Binary search for a faulty commit'),
    relationships: rel({ requires: ['repository.read', 'repository.log'] }),
  },

  // ── agent ─────────────────────────────────────────────────
  {
    definition: cap('agent.plan', 'agent', 'plan', 'Create or refine an execution plan'),
    relationships: rel({ mayProduce: ['repository.commit', 'agent.review'] }),
  },
  {
    definition: cap('agent.implement', 'agent', 'implement', 'Implement changes according to a plan'),
    relationships: rel({ requires: ['agent.plan'], mayProduce: ['repository.commit', 'agent.review'] }),
  },
  {
    definition: cap('agent.review', 'agent', 'review', 'Review code or content'),
    relationships: rel({ requires: ['repository.read'], mayProduce: ['agent.verify'] }),
  },
  {
    definition: cap('agent.verify', 'agent', 'verify', 'Verify implementation correctness'),
    relationships: rel({ requires: ['agent.review'], mayProduce: ['verification.test'] }),
  },
  {
    definition: cap('agent.research', 'agent', 'research', 'Research a topic or codebase'),
    relationships: rel({ requires: ['repository.read', 'knowledge.search'] }),
  },
  {
    definition: cap('agent.debug', 'agent', 'debug', 'Debug code issues'),
    relationships: rel({ requires: ['repository.read'], mayProduce: ['agent.implement'] }),
  },
  {
    definition: cap('agent.refactor', 'agent', 'refactor', 'Refactor code without changing behavior'),
    relationships: rel({ requires: ['agent.plan', 'repository.read'], mayProduce: ['repository.commit'] }),
  },
  {
    definition: cap('agent.test', 'agent', 'test', 'Write and run tests'),
    relationships: rel({ requires: ['repository.read', 'repository.write'], mayProduce: ['verification.test'] }),
  },
  {
    definition: cap('agent.deploy', 'agent', 'deploy', 'Deploy to an environment'),
    relationships: rel({ requires: ['verification.test', 'verification.build-check'] }),
  },
  {
    definition: cap('agent.monitor', 'agent', 'monitor', 'Monitor system health and metrics'),
    relationships: rel({ requires: ['infrastructure.log', 'infrastructure.monitor'] }),
  },
  {
    definition: cap('agent.estimate', 'agent', 'estimate', 'Estimate effort or duration'),
    relationships: rel({ requires: ['agent.plan'] }),
  },
  {
    definition: cap('agent.document', 'agent', 'document', 'Generate or update documentation'),
    relationships: rel({ requires: ['repository.read'], mayProduce: ['repository.commit'] }),
  },

  // ── ai ─────────────────────────────────────────────────────
  {
    definition: cap('ai.chat', 'ai', 'chat', 'Engage in conversational interaction'),
    relationships: rel({}),
  },
  {
    definition: cap('ai.reason', 'ai', 'reason', 'Perform multi-step reasoning'),
    relationships: rel({ requires: ['ai.chat'] }),
  },
  {
    definition: cap('ai.generate', 'ai', 'generate', 'Generate new content'),
    relationships: rel({ requires: ['ai.reason'], mayProduce: ['agent.review'] }),
  },
  {
    definition: cap('ai.analyze', 'ai', 'analyze', 'Analyze data or code'),
    relationships: rel({ requires: ['ai.reason'] }),
  },
  {
    definition: cap('ai.summarize', 'ai', 'summarize', 'Summarize content'),
    relationships: rel({ requires: ['ai.chat'] }),
  },
  {
    definition: cap('ai.translate', 'ai', 'translate', 'Translate between languages'),
    relationships: rel({}),
  },
  {
    definition: cap('ai.explain', 'ai', 'explain', 'Explain concepts or code'),
    relationships: rel({ requires: ['ai.reason'] }),
  },
  {
    definition: cap('ai.suggest', 'ai', 'suggest', 'Provide suggestions'),
    relationships: rel({ requires: ['ai.reason', 'ai.analyze'] }),
  },
  {
    definition: cap('ai.classify', 'ai', 'classify', 'Classify content into categories'),
    relationships: rel({ requires: ['ai.analyze'] }),
  },
  {
    definition: cap('ai.extract', 'ai', 'extract', 'Extract structured information'),
    relationships: rel({ requires: ['ai.analyze'] }),
  },
  {
    definition: cap('ai.embed', 'ai', 'embed', 'Generate embeddings'),
    relationships: rel({}),
  },
  {
    definition: cap('ai.refactor', 'ai', 'refactor', 'AI-assisted code refactoring'),
    relationships: rel({ requires: ['ai.analyze', 'ai.generate'], mayProduce: ['agent.refactor'] }),
  },

  // ── docker ────────────────────────────────────────────────
  {
    definition: cap('docker.build', 'docker', 'build', 'Build a Docker image'),
    relationships: rel({ requires: ['repository.read'] }),
  },
  {
    definition: cap('docker.run', 'docker', 'run', 'Run a Docker container'),
    relationships: rel({ requires: ['docker.build'] }),
  },
  {
    definition: cap('docker.push', 'docker', 'push', 'Push a Docker image to a registry'),
    relationships: rel({ requires: ['docker.build'] }),
  },
  {
    definition: cap('docker.pull', 'docker', 'pull', 'Pull a Docker image from a registry'),
    relationships: rel({}),
  },
  {
    definition: cap('docker.compose', 'docker', 'compose', 'Orchestrate multi-container Docker applications'),
    relationships: rel({ requires: ['docker.build', 'docker.run'] }),
  },
  {
    definition: cap('docker.exec', 'docker', 'exec', 'Execute a command in a running container'),
    relationships: rel({ requires: ['docker.run'] }),
  },
  {
    definition: cap('docker.logs', 'docker', 'logs', 'View container logs'),
    relationships: rel({ requires: ['docker.run'] }),
  },
  {
    definition: cap('docker.inspect', 'docker', 'inspect', 'Inspect Docker objects'),
    relationships: rel({ requires: ['docker.run', 'docker.build'] }),
  },
  {
    definition: cap('docker.network', 'docker', 'network', 'Manage Docker networks'),
    relationships: rel({ requires: ['docker.run'] }),
  },
  {
    definition: cap('docker.volume', 'docker', 'volume', 'Manage Docker volumes'),
    relationships: rel({ requires: ['docker.run'] }),
  },

  // ── verification ──────────────────────────────────────────
  {
    definition: cap('verification.test', 'verification', 'test', 'Run test suites'),
    relationships: rel({ requires: ['repository.read'], mayProduce: ['repository.log'] }),
  },
  {
    definition: cap('verification.lint', 'verification', 'lint', 'Run linters'),
    relationships: rel({ requires: ['repository.read'] }),
  },
  {
    definition: cap('verification.typecheck', 'verification', 'typecheck', 'Run type checker'),
    relationships: rel({ requires: ['repository.read'] }),
  },
  {
    definition: cap('verification.build-check', 'verification', 'build-check', 'Verify project builds successfully'),
    relationships: rel({ requires: ['repository.read'], mayProduce: ['docker.build'] }),
  },
  {
    definition: cap('verification.security-scan', 'verification', 'security-scan', 'Scan for security vulnerabilities'),
    relationships: rel({ requires: ['repository.read'] }),
  },
  {
    definition: cap('verification.coverage', 'verification', 'coverage', 'Measure code coverage'),
    relationships: rel({ requires: ['verification.test'] }),
  },
  {
    definition: cap('verification.benchmark', 'verification', 'benchmark', 'Run performance benchmarks'),
    relationships: rel({ requires: ['repository.read'] }),
  },
  {
    definition: cap('verification.audit', 'verification', 'audit', 'Audit dependencies and licenses'),
    relationships: rel({ requires: ['repository.read'] }),
  },
  {
    definition: cap('verification.format-check', 'verification', 'format-check', 'Verify code formatting'),
    relationships: rel({ requires: ['repository.read'] }),
  },

  // ── tool ──────────────────────────────────────────────────
  {
    definition: cap('tool.filesystem-read', 'tool', 'filesystem-read', 'Read files from the filesystem'),
    relationships: rel({ requires: [] }),
  },
  {
    definition: cap('tool.filesystem-write', 'tool', 'filesystem-write', 'Write files to the filesystem'),
    relationships: rel({ requires: ['tool.filesystem-read'] }),
  },
  {
    definition: cap('tool.shell-exec', 'tool', 'shell-exec', 'Execute shell commands'),
    relationships: rel({ requires: [] }),
  },
  {
    definition: cap('tool.network-request', 'tool', 'network-request', 'Make network requests'),
    relationships: rel({ requires: [] }),
  },
  {
    definition: cap('tool.database-query', 'tool', 'database-query', 'Query databases'),
    relationships: rel({ requires: ['tool.network-request'] }),
  },
  {
    definition: cap('tool.process-manage', 'tool', 'process-manage', 'Manage system processes'),
    relationships: rel({ requires: ['tool.shell-exec'] }),
  },

  // ── infrastructure ────────────────────────────────────────
  {
    definition: cap('infrastructure.provision', 'infrastructure', 'provision', 'Provision infrastructure resources'),
    relationships: rel({ requires: ['tool.shell-exec', 'tool.network-request'] }),
  },
  {
    definition: cap('infrastructure.configure', 'infrastructure', 'configure', 'Configure infrastructure'),
    relationships: rel({ requires: ['infrastructure.provision'] }),
  },
  {
    definition: cap('infrastructure.deploy', 'infrastructure', 'deploy', 'Deploy to infrastructure'),
    relationships: rel({ requires: ['verification.build-check', 'infrastructure.configure'] }),
  },
  {
    definition: cap('infrastructure.scale', 'infrastructure', 'scale', 'Scale infrastructure resources'),
    relationships: rel({ requires: ['infrastructure.configure'] }),
  },
  {
    definition: cap('infrastructure.backup', 'infrastructure', 'backup', 'Create backups'),
    relationships: rel({ requires: ['tool.filesystem-read'] }),
  },
  {
    definition: cap('infrastructure.restore', 'infrastructure', 'restore', 'Restore from backups'),
    relationships: rel({ requires: ['infrastructure.backup'] }),
  },
  {
    definition: cap('infrastructure.monitor', 'infrastructure', 'monitor', 'Monitor infrastructure health'),
    relationships: rel({ requires: ['tool.network-request'] }),
  },
  {
    definition: cap('infrastructure.alert', 'infrastructure', 'alert', 'Configure and manage alerts'),
    relationships: rel({ requires: ['infrastructure.monitor'] }),
  },
  {
    definition: cap('infrastructure.log', 'infrastructure', 'log', 'Manage and query logs'),
    relationships: rel({ requires: ['repository.log'] }),
  },
  {
    definition: cap('infrastructure.trace', 'infrastructure', 'trace', 'Distributed tracing'),
    relationships: rel({ requires: ['infrastructure.log', 'infrastructure.monitor'] }),
  },

  // ── knowledge ─────────────────────────────────────────────
  {
    definition: cap('knowledge.search', 'knowledge', 'search', 'Search across knowledge base'),
    relationships: rel({}),
  },
  {
    definition: cap('knowledge.query', 'knowledge', 'query', 'Query structured knowledge'),
    relationships: rel({ requires: ['knowledge.search'] }),
  },
  {
    definition: cap('knowledge.index', 'knowledge', 'index', 'Index new knowledge'),
    relationships: rel({ requires: ['repository.read'] }),
  },
  {
    definition: cap('knowledge.retrieve', 'knowledge', 'retrieve', 'Retrieve stored knowledge'),
    relationships: rel({ requires: ['knowledge.search'] }),
  },
  {
    definition: cap('knowledge.store', 'knowledge', 'store', 'Store new knowledge'),
    relationships: rel({ requires: ['knowledge.index'] }),
  },
  {
    definition: cap('knowledge.embed', 'knowledge', 'embed', 'Generate and store embeddings'),
    relationships: rel({ requires: ['ai.embed', 'knowledge.store'] }),
  },
  {
    definition: cap('knowledge.classify', 'knowledge', 'classify', 'Classify knowledge entries'),
    relationships: rel({ requires: ['knowledge.search', 'ai.classify'] }),
  },
  {
    definition: cap('knowledge.recommend', 'knowledge', 'recommend', 'Recommend relevant knowledge'),
    relationships: rel({ requires: ['knowledge.search', 'knowledge.retrieve'] }),
  },

  // ── human ─────────────────────────────────────────────────
  {
    definition: cap('human.approve', 'human', 'approve', 'Approve or reject a request'),
    relationships: rel({ verifies: ['agent.review', 'agent.verify'] }),
  },
  {
    definition: cap('human.review', 'human', 'review', 'Review content manually'),
    relationships: rel({ requires: ['repository.read'] }),
  },
  {
    definition: cap('human.validate', 'human', 'validate', 'Validate outputs against requirements'),
    relationships: rel({ requires: ['human.review'] }),
  },
  {
    definition: cap('human.decide', 'human', 'decide', 'Make a decision on behalf of the user'),
    relationships: rel({ requires: ['human.review', 'human.approve'] }),
  },
  {
    definition: cap('human.collaborate', 'human', 'collaborate', 'Collaborate with other participants'),
    relationships: rel({}),
  },
  {
    definition: cap('human.communicate', 'human', 'communicate', 'Send and receive messages'),
    relationships: rel({}),
  },
  {
    definition: cap('human.escalate', 'human', 'escalate', 'Escalate to a higher authority'),
    relationships: rel({ requires: ['human.review'] }),
  },
  {
    definition: cap('human.prioritize', 'human', 'prioritize', 'Set priorities among competing tasks'),
    relationships: rel({ requires: ['agent.estimate'] }),
  },

  // ── system (internal) ─────────────────────────────────────
  {
    definition: cap('system.boot', 'system', 'boot', 'Boot a runtime or subsystem'),
    relationships: rel({}),
  },
  {
    definition: cap('system.shutdown', 'system', 'shutdown', 'Shut down a runtime or subsystem'),
    relationships: rel({}),
  },
  {
    definition: cap('system.health', 'system', 'health', 'Report health status'),
    relationships: rel({}),
  },
  {
    definition: cap('system.config', 'system', 'config', 'Read and write configuration'),
    relationships: rel({}),
  },
];

export function isBuiltinCapability(id: string): boolean {
  return BUILTIN_TAXONOMY.some((e) => e.definition.id === id);
}

export function getBuiltinDefinitions(): CapabilityDefinition[] {
  return BUILTIN_TAXONOMY.map((e) => ({ ...e.definition }));
}

export function getBuiltinRelationships(id: string): Partial<CapabilityRelationships> | undefined {
  return BUILTIN_TAXONOMY.find((e) => e.definition.id === id)?.relationships;
}
