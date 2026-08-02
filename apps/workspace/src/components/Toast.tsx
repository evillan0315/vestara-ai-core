import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { workspaceSocket } from '../lib/ws';
import {
  defaultToastDuration,
  enqueueToast,
  type Toast,
  type ToastInput,
  type ToastType,
} from './toast-queue';

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: ToastInput) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToasts(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToasts requires ToastProvider');
  return ctx;
}

const TICK_MS = 120;
const EXIT_MS = 180;

interface ToastStyle {
  readonly bar: string;
  readonly icon: string;
  readonly progress: string;
  readonly bg: string;
}

const TYPE_STYLES: Record<ToastType, ToastStyle> = {
  success: { bar: 'bg-emerald-400', icon: 'text-emerald-400', progress: 'bg-emerald-400', bg: 'bg-emerald-400/5' },
  error: { bar: 'bg-red-400', icon: 'text-red-400', progress: 'bg-red-400', bg: 'bg-red-400/5' },
  warning: { bar: 'bg-amber-400', icon: 'text-amber-400', progress: 'bg-amber-400', bg: 'bg-amber-400/5' },
  info: { bar: 'bg-sky-400', icon: 'text-sky-400', progress: 'bg-sky-400', bg: 'bg-sky-400/5' },
};

function IconFor({ type }: { type: ToastType }) {
  switch (type) {
    case 'success':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case 'error':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="m15 9-6 6" />
          <path d="m9 9 6 6" />
        </svg>
      );
    case 'warning':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
      );
    default:
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      );
  }
}

interface ToastItemProps {
  readonly toast: Toast;
  readonly leaving: boolean;
  readonly onDismiss: (id: string) => void;
}

function ToastItem({ toast, leaving, onDismiss }: ToastItemProps) {
  const duration = toast.durationMs ?? defaultToastDuration(toast.type);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(1);
  const remainingRef = useRef(duration);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (paused) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    timerRef.current = setInterval(() => {
      remainingRef.current = Math.max(0, remainingRef.current - TICK_MS);
      setProgress(remainingRef.current / duration);
      if (remainingRef.current <= 0) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        onDismiss(toast.id);
      }
    }, TICK_MS);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [paused, duration, toast.id, onDismiss]);

  const style = TYPE_STYLES[toast.type];

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={`relative flex w-full items-start gap-3 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/95 px-4 py-3 shadow-xl backdrop-blur-sm ${
        leaving ? 'toast-exit' : 'toast-enter'
      }`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${style.bar}`} aria-hidden="true" />
      <span className={`pointer-events-none absolute inset-0 ${style.bg}`} aria-hidden="true" />
      <span className={`relative mt-0.5 shrink-0 ${style.icon}`}>
        <IconFor type={toast.type} />
      </span>
      <div className="relative min-w-0 flex-1">
        {toast.title ? <p className="text-sm font-semibold text-(--vestara-text)">{toast.title}</p> : null}
        <p className={`text-sm ${toast.title ? 'text-(--vestara-text-2)' : 'text-(--vestara-text)'}`}>{toast.message}</p>
      </div>
      {toast.action ? (
        <button
          type="button"
          onClick={toast.action.onClick}
          className="relative shrink-0 cursor-pointer text-xs font-medium text-(--vestara-accent-text) hover:text-(--vestara-accent-text-hover)"
        >
          {toast.action.label}
        </button>
      ) : null}
      {toast.count > 1 ? (
        <span className="relative shrink-0 text-xs font-semibold text-(--vestara-text-muted)" title={`${toast.count} occurrences`}>
          ×{toast.count}
        </span>
      ) : null}
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
        className="relative shrink-0 cursor-pointer text-(--vestara-text-muted) hover:text-(--vestara-text)"
      >
        ✕
      </button>
      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-black/30" aria-hidden="true">
        <span
          className={`block h-full ${style.progress}`}
          style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%`, transition: `width ${TICK_MS}ms linear` }}
        />
      </span>
    </div>
  );
}

const EVENT_ICONS: Record<string, { type: Toast['type']; label: string }> = {
  'plan.created': { type: 'info', label: 'Plan created' },
  'plan.approved': { type: 'success', label: 'Plan approved' },
  'changeset.created': { type: 'info', label: 'Change Set created' },
  'changeset.applied': { type: 'success', label: 'Change Set applied' },
  'verification.started': { type: 'info', label: 'Verification started' },
  'verification.completed': { type: 'success', label: 'Verification completed' },
  'harness.verification-bundle': { type: 'success', label: 'Evidence bundle created' },
  'collab.submitted': { type: 'info', label: 'Submitted for review' },
  'collab.approved': { type: 'success', label: 'Approved' },
  'collab.rejected': { type: 'error', label: 'Rejected' },
  'session.created': { type: 'info', label: 'Session created' },
  'agent.started': { type: 'info', label: 'Agent started' },
  'agent.completed': { type: 'success', label: 'Agent completed' },
  'agent.created': { type: 'info', label: 'Agent created' },
  'agent.updated': { type: 'info', label: 'Agent updated' },
  'agent.deleted': { type: 'error', label: 'Agent deleted' },
  'project:created': { type: 'info', label: 'Project created' },
  'task:created': { type: 'info', label: 'Task created' },
  'system.heartbeat': { type: 'info', label: 'Heartbeat' },
  'system.error': { type: 'error', label: 'System error' },
  'orchestration.plan.generated': { type: 'info', label: 'Plan generated' },
  'orchestration.project.completed': { type: 'success', label: 'Project completed' },
  'orchestration.task.completed': { type: 'success', label: 'Task completed' },
  'orchestration.task.failed': { type: 'error', label: 'Task failed' },
  'orchestration.task.blocked': { type: 'warning', label: 'Task blocked' },
  'orchestration.verification.failed': { type: 'error', label: 'Verification failed' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [exiting, setExiting] = useState<ReadonlySet<string>>(new Set());
  const exitTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    setExiting((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    if (exitTimers.current.has(id)) return;
    const timer = setTimeout(() => {
      exitTimers.current.delete(id);
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
      setExiting((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, EXIT_MS);
    exitTimers.current.set(id, timer);
  }, []);

  const addToast = useCallback((toast: ToastInput) => {
    const now = Date.now();
    const id = `toast-${now}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((queue) => enqueueToast(queue, toast, id, now));
  }, []);

  useEffect(() => {
    const off = workspaceSocket.onEvent((event) => {
      const mapping = EVENT_ICONS[event.type];
      if (mapping) {
        addToast({ type: mapping.type, message: event.message || mapping.label });
      }
    });
    return () => {
      off();
      for (const timer of exitTimers.current.values()) clearTimeout(timer);
      exitTimers.current.clear();
    };
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(100vw-2rem,24rem)] flex-col gap-2">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastItem toast={toast} leaving={exiting.has(toast.id)} onDismiss={removeToast} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
