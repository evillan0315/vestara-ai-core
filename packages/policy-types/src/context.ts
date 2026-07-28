export interface UserIdentity {
  readonly id: string;
  readonly role: string;
  readonly groups: readonly string[];
}

export interface WorkspaceContext {
  readonly id: string;
  readonly organizationId?: string;
  readonly name: string;
}

export interface RepositoryContext {
  readonly id: string;
  readonly name: string;
  readonly branch?: string;
  readonly isProtected: boolean;
}

export interface SystemContext {
  readonly currentHour: number;
  readonly currentDayOfWeek: number;
  readonly environment: string;
}

export interface RuntimeContext {
  readonly id: string;
  readonly type: string;
  readonly monthlyCost?: number;
  readonly provider?: string;
  readonly tags: Readonly<Record<string, string>>;
}

export interface PolicyContext {
  readonly user: UserIdentity;
  readonly workspace: WorkspaceContext;
  readonly repository?: RepositoryContext;
  readonly system: SystemContext;
  readonly runtime?: RuntimeContext;
  readonly metadata: Readonly<Record<string, unknown>>;
}
