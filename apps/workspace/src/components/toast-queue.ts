export type ToastType = 'success' | 'info' | 'error';

export interface Toast {
  readonly id: string;
  readonly type: ToastType;
  readonly message: string;
  readonly createdAt: number;
  readonly lastSeenAt: number;
  readonly count: number;
}

export interface ToastInput {
  readonly type: ToastType;
  readonly message: string;
}

export const TOAST_DEDUPLICATION_WINDOW_MS = 3_000;
export const MAX_QUEUED_TOASTS = 5;

export function enqueueToast(queue: readonly Toast[], input: ToastInput, id: string, now: number): Toast[] {
  const duplicateIndex = queue.findIndex(
    (toast) =>
      toast.type === input.type &&
      toast.message === input.message &&
      now - toast.lastSeenAt <= TOAST_DEDUPLICATION_WINDOW_MS,
  );

  if (duplicateIndex >= 0) {
    return queue.map((toast, index) =>
      index === duplicateIndex ? { ...toast, count: toast.count + 1, lastSeenAt: now } : toast,
    );
  }

  const toast: Toast = { ...input, id, createdAt: now, lastSeenAt: now, count: 1 };
  if (queue.length === 0) return [toast];

  const next = input.type === 'error' ? [queue[0], toast, ...queue.slice(1)] : [...queue, toast];
  return next.slice(0, MAX_QUEUED_TOASTS);
}
