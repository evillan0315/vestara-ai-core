/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import type { EditExecutionDetail } from '@vestara/shared';
import { AssistantCodeEdit } from '../../components/assistant/AssistantCodeEdit';
import { activityRoomUIReducer, INITIAL_STATE } from '../../hooks/useActivityRoomUI';
import { editInspectionTabs, hasAuthoritativeEditDiff, initialEditInspectionTab } from './activity-edit-inspection';
import { findFileEntryByPath } from './activity-files-navigation';

const editDetail: EditExecutionDetail = {
  contract: 'assistant.execution.v1',
  version: 1,
  operationId: 'call-edit-1',
  kind: 'edit',
  state: 'completed',
  tool: 'edit',
  source: 'opencode',
  timestamp: 1,
  file: 'README.md',
  diffRepresentation: 'patch',
  diffProvenance: 'runtime-provided',
  beforeAfterProvenance: 'unavailable',
  patch: '@@ -1,1 +1,1 @@\n-old\n+new',
};

const unavailableEdit = { ...editDetail, diffRepresentation: 'unavailable' as const, patch: undefined };

describe('Activity edit file drawer handoff', () => {
  it('opens the Files drawer with the exact resolved edit path', () => {
    const state = activityRoomUIReducer(INITIAL_STATE, {
      type: 'OPEN_FILES_DRAWER',
      path: 'README.md',
    });

    expect(state.filesDrawerOpen).toBe(true);
    expect(state.filesDrawerPath).toBe('README.md');
  });

  it('selects the exact file entry rather than matching a display name', () => {
    const nested: Parameters<typeof findFileEntryByPath>[0] = [
      {
        id: 'docs',
        name: 'docs',
        path: 'docs',
        kind: 'dir',
        children: [
          { id: 'docs/readme.md', name: 'README.md', path: 'docs/readme.md', kind: 'file' },
        ],
      },
      { id: 'README.md', name: 'README.md', path: 'README.md', kind: 'file' },
    ];

    expect(findFileEntryByPath(nested, 'README.md')?.path).toBe('README.md');
    expect(findFileEntryByPath(nested, 'README.md')?.path).not.toBe('docs/readme.md');
    expect(findFileEntryByPath(nested, 'missing.md')).toBeNull();
  });

  it('keeps current file and authoritative edit diff as separate drawer tabs', () => {
    expect(editInspectionTabs(editDetail)).toEqual(['current', 'diff']);
    expect(initialEditInspectionTab(editDetail)).toBe('diff');
    expect(hasAuthoritativeEditDiff(editDetail)).toBe(true);
    expect(editInspectionTabs(unavailableEdit)).toEqual(['current']);
    expect(initialEditInspectionTab(unavailableEdit)).toBe('current');
    expect(hasAuthoritativeEditDiff(unavailableEdit)).toBe(false);
  });

  it('reconstructs the same inspection target after a fresh drawer mount', () => {
    const first = activityRoomUIReducer(INITIAL_STATE, { type: 'INSPECT_EDIT_IN_FILES', detail: editDetail });
    const afterReload = activityRoomUIReducer(INITIAL_STATE, {
      type: 'INSPECT_EDIT_IN_FILES',
      detail: first.filesDrawerEdit!,
    });

    expect(afterReload.filesDrawerOpen).toBe(true);
    expect(afterReload.filesDrawerPath).toBe('README.md');
    expect(afterReload.filesDrawerEdit?.operationId).toBe('call-edit-1');
  });

  it('renders the diff read-only without save or revert controls', () => {
    render(createElement(AssistantCodeEdit, { detail: editDetail }));

    expect(screen.getByTestId('code-edit-diff')).toBeTruthy();
    expect(screen.queryByText(/save|revert/i)).toBeNull();
  });
});
