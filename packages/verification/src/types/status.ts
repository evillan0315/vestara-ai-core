export type VerificationStatus = 'passed' | 'failed' | 'warning' | 'inconclusive' | 'skipped';

export type VerificationCategory =
  | 'build'
  | 'unit_test'
  | 'integration_test'
  | 'e2e_test'
  | 'lint'
  | 'type_check'
  | 'security'
  | 'performance'
  | 'policy_compliance'
  | 'human_approval'
  | 'documentation'
  | 'artifact'
  | 'custom';
