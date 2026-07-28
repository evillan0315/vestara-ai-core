export type ScopeLevel = 'global' | 'organization' | 'workspace' | 'project' | 'runtime';

export interface PolicyScope {
  level: ScopeLevel;
  targets?: PolicyScopeTarget[];
}

export interface PolicyScopeTarget {
  type: 'organization' | 'workspace' | 'project' | 'runtime' | 'repository' | 'environment';
  id: string;
}

export interface PolicyScopeQuery {
  level?: ScopeLevel;
  organizationId?: string;
  workspaceId?: string;
  projectId?: string;
  runtimeId?: string;
}
