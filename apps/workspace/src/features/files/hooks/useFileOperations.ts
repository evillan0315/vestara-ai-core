/**
 * FILES-PAGE-001 FP-8: Shared file-operation controller.
 *
 * Single command layer for every Files surface (explorer menu, directory
 * table, inspector actions). Each operation calls the governed /api/files/*
 * endpoints (→ FilesystemRuntime); 402 responses become first-class
 * approval state (FP-10) with approve/reject + automatic retry.
 *
 * The hook never touches the filesystem and never mutates the tree: it
 * reports outcomes and notifies the owner (structural change → tabs/cache
 * cleanup + refetch) through callbacks.
 *
 * Architecture Traceability:
 *   FILES-PAGE-001 FP-8/FP-9/FP-10.
 */

import { useCallback, useMemo, useState } from 'react';

export type FileOpStatus =
  | { readonly status: 'idle' }
  | { readonly status: 'active'; readonly label: string; readonly detail?: string }
  | { readonly status: 'success'; readonly label: string; readonly detail?: string }
  | { readonly status: 'failure'; readonly label: string; readonly detail: string }
  | {
      readonly status: 'approval';
      readonly label: string;
      readonly detail: string;
      readonly approvalId: string;
    };

interface Attempt {
  readonly label: string;
  readonly endpoint: string;
  readonly body: Record<string, unknown>;
  readonly affected: readonly string[];
}

export interface UseFileOperationsOptions {
  /** Invoked with workspace paths invalidated by a successful mutation. */
  onStructuralChange?: (paths: readonly string[]) => void;
  /** Invoked after a successful mutation so insights/tree refetch. */
  onRefresh?: () => void;
}

export interface UseFileOperationsReturn {
  readonly state: FileOpStatus;
  readonly dismiss: () => void;
  create: (path: string, isDirectory: boolean, content?: string) => Promise<boolean>;
  rename: (oldPath: string, newPath: string) => Promise<boolean>;
  duplicate: (sourcePath: string) => Promise<boolean>;
  move: (sourcePath: string, destinationPath: string) => Promise<boolean>;
  remove: (path: string) => Promise<boolean>;
  download: (path: string) => Promise<boolean>;
  approve: () => Promise<boolean>;
  reject: () => Promise<boolean>;
}

async function postJson(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<{ status: number; data: any }> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

function duplicateName(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? `${name.slice(0, dot)} copy${name.slice(dot)}` : `${name} copy`;
}

export function useFileOperations(options: UseFileOperationsOptions = {}): UseFileOperationsReturn {
  const [state, setState] = useState<FileOpStatus>({ status: 'idle' });
  const [pendingAttempt, setPendingAttempt] = useState<Attempt | null>(null);
  const { onStructuralChange, onRefresh } = options;

  const run = useCallback(
    async (attempt: Attempt): Promise<boolean> => {
      setState({ status: 'active', label: attempt.label });
      try {
        const { status, data } = await postJson(attempt.endpoint, attempt.body);
        if (status === 402) {
          const approvalId = (data as any)?.approvalId as string | undefined;
          if (!approvalId) {
            setState({ status: 'failure', label: attempt.label, detail: 'Approval required but no approval id was returned.' });
            return false;
          }
          setPendingAttempt(attempt);
          setState({
            status: 'approval',
            label: attempt.label,
            detail: (data as any)?.error ?? 'High-risk operation requires approval.',
            approvalId,
          });
          return false;
        }
        if (status < 200 || status >= 300) {
          setState({ status: 'failure', label: attempt.label, detail: (data as any)?.error ?? `HTTP ${status}` });
          return false;
        }
        setPendingAttempt(null);
        setState({ status: 'success', label: attempt.label });
        onStructuralChange?.(attempt.affected);
        onRefresh?.();
        return true;
      } catch (err) {
        setState({ status: 'failure', label: attempt.label, detail: err instanceof Error ? err.message : 'network error' });
        return false;
      }
    },
    [onStructuralChange, onRefresh],
  );

  const dismiss = useCallback(() => {
    setPendingAttempt(null);
    setState({ status: 'idle' });
  }, []);

  const create = useCallback(
    (path: string, isDirectory: boolean, content?: string) =>
      run({ label: `Create ${path}`, endpoint: '/api/files/create', body: { path, isDirectory, content }, affected: [] }),
    [run],
  );

  const rename = useCallback(
    (oldPath: string, newPath: string) =>
      run({ label: `Rename ${oldPath}`, endpoint: '/api/files/rename', body: { oldPath, newPath }, affected: [oldPath] }),
    [run],
  );

  const duplicate = useCallback(
    (sourcePath: string) => {
      const parent = sourcePath.includes('/') ? sourcePath.slice(0, sourcePath.lastIndexOf('/')) : '';
      const name = sourcePath.split('/').pop() ?? sourcePath;
      const destinationPath = parent ? `${parent}/${duplicateName(name)}` : duplicateName(name);
      return run({
        label: `Duplicate ${name}`,
        endpoint: '/api/files/copy',
        body: { sourcePath, destinationPath },
        affected: [],
      });
    },
    [run],
  );

  const move = useCallback(
    (sourcePath: string, destinationPath: string) =>
      run({
        label: `Move ${sourcePath}`,
        endpoint: '/api/files/move',
        body: { sourcePath, destinationPath },
        affected: [sourcePath],
      }),
    [run],
  );

  const remove = useCallback(
    (path: string) => run({ label: `Delete ${path}`, endpoint: '/api/files/delete', body: { path }, affected: [path] }),
    [run],
  );

  const download = useCallback(async (path: string): Promise<boolean> => {
    setState({ status: 'active', label: `Download ${path}` });
    try {
      const res = await fetch(`/api/files/download?path=${encodeURIComponent(path)}`);
      if (!res.ok) {
        setState({ status: 'failure', label: `Download ${path}`, detail: `HTTP ${res.status}` });
        return false;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = path.split('/').pop() ?? path;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setState({ status: 'success', label: `Download ${path}` });
      return true;
    } catch (err) {
      setState({ status: 'failure', label: `Download ${path}`, detail: err instanceof Error ? err.message : 'network error' });
      return false;
    }
  }, []);

  const approve = useCallback(async (): Promise<boolean> => {
    const attempt = pendingAttempt;
    if (state.status !== 'approval' || !attempt) return false;
    setState({ status: 'active', label: `Approving ${attempt.label}` });
    try {
      const { status } = await postJson(`/api/files/approvals/${state.approvalId}/approve`, {});
      if (status < 200 || status >= 300) {
        setState({ status: 'failure', label: attempt.label, detail: `Approve failed: HTTP ${status}` });
        return false;
      }
      // Retry the original mutation with the granted approval id.
      return run({ ...attempt, body: { ...attempt.body, approvalId: state.approvalId } });
    } catch (err) {
      setState({ status: 'failure', label: attempt.label, detail: err instanceof Error ? err.message : 'network error' });
      return false;
    }
  }, [pendingAttempt, state, run]);

  const reject = useCallback(async (): Promise<boolean> => {
    if (state.status !== 'approval') return false;
    try {
      await postJson(`/api/files/approvals/${state.approvalId}/reject`, {});
    } catch {
      /* rejection is best-effort; the pending approval expires server-side */
    }
    setPendingAttempt(null);
    setState({ status: 'idle' });
    return true;
  }, [state]);

  return useMemo(
    () => ({ state, dismiss, create, rename, duplicate, move, remove, download, approve, reject }),
    [state, dismiss, create, rename, duplicate, move, remove, download, approve, reject],
  );
}
