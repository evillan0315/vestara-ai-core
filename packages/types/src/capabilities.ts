export type CapabilityDomain =
  | 'language'
  | 'framework'
  | 'domain'
  | 'repository'
  | 'infrastructure'
  | 'security'
  | 'architecture'
  | 'project'
  | 'documentation'
  | 'testing'
  | 'review'
  | 'decision'
  | 'communication'
  | 'knowledge'
  | 'tool'
  | 'data'
  | 'model'
  | 'ui'
  | 'api'
  | 'integration'
  | 'custom';

export type CapabilityAction =
  | 'develop'
  | 'analyze'
  | 'review'
  | 'test'
  | 'debug'
  | 'deploy'
  | 'configure'
  | 'migrate'
  | 'document'
  | 'estimate'
  | 'plan'
  | 'approve'
  | 'escalate'
  | 'research'
  | 'generate'
  | 'optimize'
  | 'refactor'
  | 'integrate'
  | 'monitor';

export type ProficiencyLevel = 0 | 1 | 2 | 3 | 4;

export interface Capability {
  domain: CapabilityDomain;
  category: string;
  action: CapabilityAction;
  proficiency?: ProficiencyLevel;
}

export interface CapabilityMatch {
  capability: Capability;
  score: number;
  matched: boolean;
}

export function formatCapability(cap: Capability): string {
  const base = `${cap.domain}:${cap.category}:${cap.action}`;
  return cap.proficiency !== undefined ? `${base}@${cap.proficiency}` : base;
}

export function parseCapability(value: string): Capability | null {
  const parts = value.split(/[:@]/);
  if (parts.length < 3) return null;
  const proficiency = parts[3] !== undefined ? (Number(parts[3]) as ProficiencyLevel) : undefined;
  if (proficiency !== undefined && (proficiency < 0 || proficiency > 4)) return null;
  return {
    domain: parts[0] as CapabilityDomain,
    category: parts[1],
    action: parts[2] as CapabilityAction,
    proficiency,
  };
}

export function matchCapability(required: Capability, provided: Capability): CapabilityMatch {
  const domainMatch = required.domain === provided.domain;
  const categoryMatch = required.category === provided.category;
  const actionMatch = required.action === provided.action;

  if (!domainMatch || !categoryMatch || !actionMatch) {
    return { capability: required, score: 0, matched: false };
  }

  const reqLevel = required.proficiency ?? 0;
  const provLevel = provided.proficiency ?? 0;
  const score = provLevel >= reqLevel ? 1 : provLevel / Math.max(reqLevel, 1);

  return { capability: required, score, matched: score >= 1 };
}
