import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { workspaceSocket } from '../lib/ws';

interface Toast {
  id: string;
  type: 'success' | 'info' | 'error';
  message: string;
  createdAt: number;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (t: Omit<Toast, 'id' | 'createdAt'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToasts(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToasts requires ToastProvider');
  return ctx;
}

const EVENT_ICONS: Record<string, { type: Toast['type']; label: string }> = {
  'plan.created': { type: 'info', label: 'Plan created' },
  'changeset.created': { type: 'info', label: 'Change Set created' },
  'changeset.applied': { type: 'success', label: 'Change Set applied' },
  'verification.completed': { type: 'success', label: 'Verification completed' },
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
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (t: Omit<Toast, 'id' | 'createdAt'>) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const toast: Toast = { ...t, id, createdAt: Date.now() };
      setToasts((prev) => [toast, ...prev].slice(0, 5));
      timers.current.set(
        id,
        setTimeout(() => removeToast(id), 5000),
      );
    },
    [removeToast],
  );

  useEffect(() => {
    const off = workspaceSocket.onEvent((event) => {
      const mapping = EVENT_ICONS[event.type];
      if (mapping) {
        addToast({ type: mapping.type, message: event.message || mapping.label });
      }
    });
    return off;
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-start gap-2 px-4 py-3 rounded-lg border shadow-lg text-sm transition-all ${
              t.type === 'success'
                ? 'bg-green-400/10 border-green-400/30 text-green-300'
                : t.type === 'error'
                  ? 'bg-red-400/10 border-red-400/30 text-red-300'
                  : 'bg-blue-400/10 border-blue-400/30 text-blue-300'
            }`}
          >
            <span className="shrink-0 mt-0.5">{t.type === 'success' ? '✓' : t.type === 'error' ? '✗' : 'ℹ'}</span>
            <span className="flex-1">{t.message}</span>
            <button onClick={() => removeToast(t.id)} className="text-zinc-600 hover:text-zinc-400 cursor-pointer">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
