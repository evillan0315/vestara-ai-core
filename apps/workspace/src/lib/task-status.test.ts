import { describe, expect, it } from 'vitest';
import { taskMatchesFilter, taskStatusPriority, taskStatusTone } from './task-status';

describe('taskStatusTone', () => {
  it('tones terminal success states as success', () => {
    expect(taskStatusTone('completed')).toBe('success');
    expect(taskStatusTone('approved')).toBe('success');
  });

  it('tones hard stops as error', () => {
    expect(taskStatusTone('blocked')).toBe('error');
    expect(taskStatusTone('failed')).toBe('error');
    expect(taskStatusTone('cancelled')).toBe('error');
  });

  it('tones human gates as warning', () => {
    expect(taskStatusTone('awaiting-approval')).toBe('warning');
    expect(taskStatusTone('needs-review')).toBe('warning');
    expect(taskStatusTone('changes-requested')).toBe('warning');
  });

  it('tones live work as info and idle as muted', () => {
    expect(taskStatusTone('in-progress')).toBe('info');
    expect(taskStatusTone('reviewing')).toBe('info');
    expect(taskStatusTone('pending')).toBe('muted');
    expect(taskStatusTone('ready')).toBe('muted');
    expect(taskStatusTone('something-unknown')).toBe('muted');
  });
});

describe('taskMatchesFilter', () => {
  it('matches every status under all', () => {
    for (const status of ['pending', 'in-progress', 'blocked', 'completed', 'cancelled']) {
      expect(taskMatchesFilter(status, 'all')).toBe(true);
    }
  });

  it('buckets the lifecycle without overlap surprises', () => {
    expect(taskMatchesFilter('in-progress', 'active')).toBe(true);
    expect(taskMatchesFilter('completed', 'active')).toBe(false);
    expect(taskMatchesFilter('blocked', 'attention')).toBe(true);
    expect(taskMatchesFilter('awaiting-approval', 'attention')).toBe(true);
    expect(taskMatchesFilter('in-progress', 'attention')).toBe(false);
    expect(taskMatchesFilter('approved', 'completed')).toBe(true);
    expect(taskMatchesFilter('pending', 'queued')).toBe(true);
    expect(taskMatchesFilter('ready', 'queued')).toBe(true);
    expect(taskMatchesFilter('completed', 'queued')).toBe(false);
  });
});

describe('taskStatusPriority', () => {
  it('orders attention before active before queued before completed', () => {
    const order = ['completed', 'pending', 'in-progress', 'blocked'].sort(
      (left, right) => taskStatusPriority(left) - taskStatusPriority(right),
    );
    expect(order).toEqual(['blocked', 'in-progress', 'pending', 'completed']);
  });
});
