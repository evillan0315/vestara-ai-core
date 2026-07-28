export type EvidenceType =
  | 'build_log'
  | 'test_report'
  | 'coverage_report'
  | 'lint_output'
  | 'type_check_output'
  | 'security_finding'
  | 'performance_benchmark'
  | 'human_approval'
  | 'screenshot'
  | 'git_diff'
  | 'artifact'
  | 'policy_report'
  | 'custom';

export interface Evidence {
  readonly type: EvidenceType;
  readonly contentType: string;
  readonly data: unknown;
  readonly description: string;
  readonly timestamp: string;
}

export interface EvidenceBundle {
  readonly id: string;
  readonly checkId: string;
  readonly items: readonly Evidence[];
  readonly summary: string;
}
