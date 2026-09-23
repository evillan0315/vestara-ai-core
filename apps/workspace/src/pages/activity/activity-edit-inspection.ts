import type { EditExecutionDetail } from '@vestara/shared';

export type ActivityEditTab = 'current' | 'diff';

export function hasAuthoritativeEditDiff(detail: EditExecutionDetail): boolean {
  return detail.diffRepresentation !== 'unavailable';
}

export function editInspectionTabs(detail: EditExecutionDetail): readonly ActivityEditTab[] {
  return hasAuthoritativeEditDiff(detail) ? ['current', 'diff'] : ['current'];
}

export function initialEditInspectionTab(detail: EditExecutionDetail): ActivityEditTab {
  return hasAuthoritativeEditDiff(detail) ? 'diff' : 'current';
}
