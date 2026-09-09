/**
 * Canonical AgentCapability vocabulary.
 *
 * CORE-001 found multiple capability concepts sharing the word "capability":
 *   1. AgentCapability (workspace, 42 values) — agent qualification labels
 *   2. CAPABILITY_DESCRIPTIONS (workspace) — human-readable metadata
 *   3. AgentCapabilityName (workspace, 12 filesystem ops) — filesystem operations
 *   4. EngineeringCapability (provider-runtime, 14 values) — routing substrate
 *   5. CapabilityDomain/CapabilityAction (types) — generic capability framework
 *
 * This type is concept #1: what an agent is qualified/intended to do.
 * It is NOT a permission, NOT a filesystem operation, NOT a routing capability.
 *
 * INVARIANT: This union is closed. The `(string & {})` escape hatch from the
 * legacy workspace definition is intentionally removed. New capabilities must
 * be added here explicitly. This prevents the type from effectively becoming
 * `string` by accident.
 */
export type AgentCapability =
  | 'architecture-analysis'
  | 'design-review'
  | 'dependency-analysis'
  | 'code-generation'
  | 'refactoring'
  | 'bug-fixing'
  | 'testing'
  | 'diagnostics'
  | 'quality-analysis'
  | 'documentation'
  | 'summarization'
  | 'knowledge-management'
  | 'security-analysis'
  | 'devops-automation'
  | 'performance-optimization'
  | 'database-design'
  | 'release-management'
  | 'ux-design'
  | 'conversation'
  | 'conversation-design'
  | 'voice-ux'
  | 'prompt-engineering'
  | 'stt-integration'
  | 'tts-integration'
  | 'vad-integration'
  | 'audio-pipeline'
  | 'dashboard-monitoring'
  | 'react-development'
  | 'ui-development'
  | 'tailwind-css'
  | 'dashboard-design'
  | 'data-visualization'
  | 'progress-tracking'
  | 'milestone-management'
  | 'feature-detection'
  | 'development-velocity'
  | 'planning'
  | 'governance'
  | 'web-navigation'
  | 'web-observation'
  | 'web-interaction'
  | 'web-research';

/** All canonical AgentCapability values as a runtime array for iteration. */
export const ALL_AGENT_CAPABILITIES: readonly AgentCapability[] = [
  'architecture-analysis',
  'design-review',
  'dependency-analysis',
  'code-generation',
  'refactoring',
  'bug-fixing',
  'testing',
  'diagnostics',
  'quality-analysis',
  'documentation',
  'summarization',
  'knowledge-management',
  'security-analysis',
  'devops-automation',
  'performance-optimization',
  'database-design',
  'release-management',
  'ux-design',
  'conversation',
  'conversation-design',
  'voice-ux',
  'prompt-engineering',
  'stt-integration',
  'tts-integration',
  'vad-integration',
  'audio-pipeline',
  'dashboard-monitoring',
  'react-development',
  'ui-development',
  'tailwind-css',
  'dashboard-design',
  'data-visualization',
  'progress-tracking',
  'milestone-management',
  'feature-detection',
  'development-velocity',
  'planning',
  'governance',
  'web-navigation',
  'web-observation',
  'web-interaction',
  'web-research',
] as const;

/** Human-readable descriptions for each capability. */
export const CAPABILITY_DESCRIPTIONS: Readonly<Record<AgentCapability, string>> = {
  'architecture-analysis': 'Analyze repository architecture and structure',
  'design-review': 'Review design decisions and patterns',
  'dependency-analysis': 'Analyze package dependencies and detect cycles',
  'code-generation': 'Generate source code from specifications',
  refactoring: 'Refactor existing code for improvement',
  'bug-fixing': 'Identify and fix bugs in code',
  testing: 'Write and run automated tests',
  diagnostics: 'Run diagnostic checks on the system',
  'quality-analysis': 'Analyze code quality metrics',
  documentation: 'Generate and update documentation',
  summarization: 'Summarize conversations, code, or documents',
  'knowledge-management': 'Manage knowledge graph entries',
  'security-analysis': 'Analyze code for security vulnerabilities',
  'devops-automation': 'Automate DevOps workflows',
  'performance-optimization': 'Optimize application performance',
  'database-design': 'Design database schemas and queries',
  'release-management': 'Manage software releases',
  'ux-design': 'Design user interfaces and experiences',
  conversation: 'Handle conversational interactions',
  'conversation-design': 'Design conversation flows',
  'voice-ux': 'Design voice interaction patterns',
  'prompt-engineering': 'Engineer AI prompts',
  'stt-integration': 'Integrate speech-to-text',
  'tts-integration': 'Integrate text-to-speech',
  'vad-integration': 'Integrate voice activity detection',
  'audio-pipeline': 'Manage audio processing pipeline',
  'dashboard-monitoring': 'Monitor dashboard metrics and alerts',
  'react-development': 'Develop React components and applications',
  'ui-development': 'Build user interfaces',
  'tailwind-css': 'Style with Tailwind CSS',
  'dashboard-design': 'Design dashboard layouts',
  'data-visualization': 'Create data visualizations',
  'progress-tracking': 'Track development progress',
  'milestone-management': 'Manage project milestones',
  'feature-detection': 'Detect and catalog features',
  'development-velocity': 'Track development velocity',
  planning: 'Create and manage plans',
  governance: 'Apply governance policies',
  'web-navigation': 'Navigate web pages',
  'web-observation': 'Observe web page content',
  'web-interaction': 'Interact with web elements',
  'web-research': 'Research topics via web search',
};

/** Runtime type guard for AgentCapability. */
export function isAgentCapability(value: string): value is AgentCapability {
  return (ALL_AGENT_CAPABILITIES as readonly string[]).includes(value);
}
