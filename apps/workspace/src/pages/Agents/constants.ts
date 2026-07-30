export const ROLE_CATEGORIES: Record<string, string> = {
  architect: 'Development',
  developer: 'Development',
  frontend: 'Development',
  planner: 'Development',
  verifier: 'Verification',
  reviewer: 'Verification',
  tester: 'Verification',
  'security-agent': 'Verification',
  analyst: 'Analysis',
  'performance-agent': 'Analysis',
  'documentation-agent': 'Analysis',
  'release-agent': 'Infrastructure',
  'refactoring-agent': 'Infrastructure',
  conversation: 'Specialized',
  'dashboard-curator': 'Specialized',
  documenter: 'Specialized',
};

export const CATEGORY_ORDER = ['Development', 'Verification', 'Analysis', 'Infrastructure', 'Specialized'];

export const CATEGORY_COLORS: Record<string, string> = {
  Development: '#3b82f6',
  Verification: '#10b981',
  Analysis: '#a855f7',
  Infrastructure: '#f59e0b',
  Specialized: '#6366f1',
};

export const ROLE_COLORS: Record<string, string> = {
  architect: '#8b5cf6',
  developer: '#3b82f6',
  verifier: '#10b981',
  documenter: '#f59e0b',
  analyst: '#a855f7',
  reviewer: '#14b8a6',
  tester: '#84cc16',
  'security-agent': '#ef4444',
  'performance-agent': '#f97316',
  'documentation-agent': '#22c55e',
  'refactoring-agent': '#0ea5e9',
  'release-agent': '#eab308',
  planner: '#d946ef',
  conversation: '#6366f1',
  'dashboard-curator': '#06b6d4',
  frontend: '#ec4899',
};

export const ALL_AGENT_SLOTS = [
  { role: 'architect', defaultName: 'Architect', color: '#8b5cf6', defaultDescription: 'Architecture analysis, design review, dependency analysis', defaultCapabilities: ['architecture-analysis', 'design-review', 'dependency-analysis'] },
  { role: 'developer', defaultName: 'Developer', color: '#3b82f6', defaultDescription: 'Code generation, refactoring, bug fixing', defaultCapabilities: ['code-generation', 'refactoring', 'bug-fixing'] },
  { role: 'verifier', defaultName: 'Verifier', color: '#10b981', defaultDescription: 'Testing, diagnostics, quality analysis', defaultCapabilities: ['testing', 'diagnostics', 'quality-analysis'] },
  { role: 'reviewer', defaultName: 'Reviewer', color: '#14b8a6', defaultDescription: 'Code review, quality assurance, best practices', defaultCapabilities: ['code-review', 'quality-assurance', 'best-practices'] },
  { role: 'tester', defaultName: 'Tester', color: '#84cc16', defaultDescription: 'Test generation, test execution, coverage analysis', defaultCapabilities: ['test-generation', 'test-execution', 'coverage-analysis'] },
  { role: 'documenter', defaultName: 'Documenter', color: '#f59e0b', defaultDescription: 'Documentation, summarization, knowledge management', defaultCapabilities: ['documentation', 'summarization', 'knowledge-management'] },
  { role: 'analyst', defaultName: 'Repository Analyst', color: '#a855f7', defaultDescription: 'Code analysis, quality metrics, dependency scanning', defaultCapabilities: ['code-analysis', 'quality-metrics', 'dependency-scanning'] },
  { role: 'security-agent', defaultName: 'Security Agent', color: '#ef4444', defaultDescription: 'Vulnerability scanning, security audit, compliance checks', defaultCapabilities: ['vulnerability-scanning', 'security-audit', 'compliance-checks'] },
  { role: 'performance-agent', defaultName: 'Performance Agent', color: '#f97316', defaultDescription: 'Benchmarking, performance profiling, optimization suggestions', defaultCapabilities: ['benchmarking', 'performance-profiling', 'optimization'] },
  { role: 'documentation-agent', defaultName: 'Documentation Agent', color: '#22c55e', defaultDescription: 'API doc generation, changelog, release notes', defaultCapabilities: ['api-documentation', 'changelog-generation', 'release-notes'] },
  { role: 'refactoring-agent', defaultName: 'Refactoring Agent', color: '#0ea5e9', defaultDescription: 'Code quality improvement, technical debt reduction', defaultCapabilities: ['code-quality', 'technical-debt', 'pattern-migration'] },
  { role: 'release-agent', defaultName: 'Release Agent', color: '#eab308', defaultDescription: 'Version bumping, package preparation, release orchestration', defaultCapabilities: ['version-management', 'release-packaging', 'changelog'] },
  { role: 'conversation', defaultName: 'Conversation Developer', color: '#6366f1', defaultDescription: 'Conversation flows, voice pipelines, STT/TTS integration', defaultCapabilities: ['conversation-design', 'voice-ux', 'prompt-engineering', 'stt-integration', 'tts-integration'] },
  { role: 'planner', defaultName: 'Planner', color: '#d946ef', defaultDescription: 'Task planning, dependency analysis, workflow orchestration', defaultCapabilities: ['planning', 'dependency-analysis', 'workflow-orchestration'] },
  { role: 'frontend', defaultName: 'Dashboard Developer', color: '#ec4899', defaultDescription: 'React/Tailwind UI development, real-time visualization', defaultCapabilities: ['react-development', 'ui-development', 'tailwind-css'] },
  { role: 'dashboard-curator', defaultName: 'Dashboard Curator', color: '#06b6d4', defaultDescription: 'Milestone tracking, workspace monitoring, progress reporting', defaultCapabilities: ['dashboard-monitoring', 'progress-tracking', 'milestone-management'] },
];
