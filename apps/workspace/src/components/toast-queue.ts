export type ToastType = 'success' | 'info' | 'warning' | 'error';

export interface ToastAction {
  readonly label: string;
  readonly onClick: () => void;
}

export interface Toast {
  readonly id: string;
  readonly type: ToastType;
  readonly message: string;
  readonly title?: string;
  readonly action?: ToastAction;
  /** Auto-dismiss duration in ms. Defaults by type when omitted. */
  readonly durationMs?: number;
  readonly createdAt: number;
  readonly lastSeenAt: number;
  readonly count: number;
}

export interface ToastInput {
  readonly type: ToastType;
  readonly message: string;
  readonly title?: string;
  readonly action?: ToastAction;
  readonly durationMs?: number;
}

export const TOAST_DEDUPLICATION_WINDOW_MS = 3_000;
export const MAX_QUEUED_TOASTS = 5;
export const DEFAULT_TOAST_DURATION_MS = 5_000;
export const ERROR_TOAST_DURATION_MS = 8_000;
export const WARNING_TOAST_DURATION_MS = 6_000;

export function defaultToastDuration(type: ToastType): number {
  switch (type) {
    case 'error':
      return ERROR_TOAST_DURATION_MS;
    case 'warning':
      return WARNING_TOAST_DURATION_MS;
    default:
      return DEFAULT_TOAST_DURATION_MS;
  }
}

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
