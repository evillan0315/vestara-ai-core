import type { EditExecutionDetail, FileMutationExecutionDetail } from '@vestara/shared';

export type ActivityEditTab = 'current' | 'diff';

export function hasAuthoritativeEditDiff(detail: EditExecutionDetail): boolean {
  return detail.diffRepresentation !== 'unavailable';
}

export function hasAuthoritativeFileMutationPath(detail: FileMutationExecutionDetail): boolean {
  return detail.file.length > 0;
}

export function hasAuthoritativeFileMutationDiff(detail: FileMutationExecutionDetail): boolean {
  return detail.kind === 'edit' && hasAuthoritativeEditDiff(detail);
}

export function editInspectionTabs(detail: FileMutationExecutionDetail): readonly ActivityEditTab[] {
  return hasAuthoritativeFileMutationDiff(detail) ? ['current', 'diff'] : ['current'];
}

export function initialEditInspectionTab(detail: FileMutationExecutionDetail): ActivityEditTab {
  return hasAuthoritativeFileMutationDiff(detail) ? 'diff' : 'current';
}
