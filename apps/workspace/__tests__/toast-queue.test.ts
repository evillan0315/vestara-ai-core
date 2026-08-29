import { describe, expect, it } from 'vitest';
import { defaultToastDuration, enqueueToast, type Toast } from '../src/components/toast-queue';

function toast(id: string, type: Toast['type'], message: string, createdAt = 1_000): Toast {
  return { id, type, message, createdAt, lastSeenAt: createdAt, count: 1 };
}

describe('toast queue', () => {
  it('deduplicates matching notifications within three seconds', () => {
    const queue = [toast('first', 'info', 'Agent completed')];

    const result = enqueueToast(queue, { type: 'info', message: 'Agent completed' }, 'duplicate', 3_500);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'first', count: 2, lastSeenAt: 3_500 });
  });

  it('creates a new notification outside the deduplication window', () => {
    const queue = [toast('first', 'info', 'Agent completed')];

    const result = enqueueToast(queue, { type: 'info', message: 'Agent completed' }, 'second', 4_001);

    expect(result.map(({ id }) => id)).toEqual(['first', 'second']);
  });

  it('prioritizes errors without interrupting the active notification', () => {
    const queue = [toast('active', 'info', 'Active'), toast('waiting', 'success', 'Waiting')];

    const result = enqueueToast(queue, { type: 'error', message: 'Failed' }, 'error', 2_000);

    expect(result.map(({ id }) => id)).toEqual(['active', 'error', 'waiting']);
  });

  it('preserves FIFO ordering for non-error notifications', () => {
    const queue = [toast('active', 'info', 'Active'), toast('waiting', 'success', 'Waiting')];

    const result = enqueueToast(queue, { type: 'info', message: 'Later' }, 'later', 2_000);

    expect(result.map(({ id }) => id)).toEqual(['active', 'waiting', 'later']);
  });

  it('limits the queue to five notifications', () => {
    const queue = Array.from({ length: 5 }, (_, index) => toast(String(index), 'info', `Message ${index}`));

    const result = enqueueToast(queue, { type: 'info', message: 'Overflow' }, 'overflow', 2_000);

    expect(result).toHaveLength(5);
    expect(result.some(({ id }) => id === 'overflow')).toBe(false);
  });

  it('carries title and action through enqueue', () => {
    const onAction = () => {};
    const result = enqueueToast(
      [],
      { type: 'warning', message: 'Task blocked', title: 'Blocked', action: { label: 'View', onClick: onAction } },
      'warn',
      1_000,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'warning', title: 'Blocked' });
    expect(result[0].action?.label).toBe('View');
  });

  it('uses type-specific default durations', () => {
    expect(defaultToastDuration('error')).toBe(8_000);
    expect(defaultToastDuration('warning')).toBe(6_000);
    expect(defaultToastDuration('success')).toBe(5_000);
    expect(defaultToastDuration('info')).toBe(5_000);
  });
});
