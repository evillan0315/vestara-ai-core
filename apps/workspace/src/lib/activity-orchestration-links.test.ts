import { describe, expect, it } from 'vitest';
import {
  activityWorkflowUrl,
  orchestrationProjectUrl,
  parseWorkflowParam,
} from './activity-orchestration-links';

describe('activity-orchestration-links', () => {
  it('links an orchestration project to the Activity Room workflow filter', () => {
    expect(activityWorkflowUrl('project-1')).toBe('/activity?workflow=project-1');
    expect(activityWorkflowUrl('project with spaces')).toBe('/activity?workflow=project%20with%20spaces');
  });

  it('links an Activity Room workflow back to its orchestration project', () => {
    expect(orchestrationProjectUrl('project-1')).toBe('/orchestration?project=project-1');
  });

  it('parses the workflow param fail-closed', () => {
    expect(parseWorkflowParam('project-1')).toBe('project-1');
    expect(parseWorkflowParam('')).toBeNull();
    expect(parseWorkflowParam(null)).toBeNull();
    expect(parseWorkflowParam(undefined)).toBeNull();
    expect(parseWorkflowParam(42)).toBeNull();
  });
});
