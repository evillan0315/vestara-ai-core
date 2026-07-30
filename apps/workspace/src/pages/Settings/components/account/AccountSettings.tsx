/**
 * Account Settings — User profile, API token, and user management.
 *
 * Architecture Traceability:
 *   v8.0: Multi-User Collaboration
 *   Natural Law: Intelligence exists in many forms
 *   Purpose: Let's Change the World
 */

import { useEffect, useState, useRef } from 'react';

interface User {
  id: string;
  username: string;
  role: 'admin' | 'editor' | 'viewer';
  createdAt: string;
  token: string;
}

interface AuthResponse {
  user: { id: string; name: string; role: string; type: string };
  currentUser?: { id: string; username: string; role: string; token: string; createdAt: string } | null;
  allUsers: Array<{ id: string; username: string; role: string; createdAt: string }>;
}

interface AdminUsersResponse {
  users: Array<{ id: string; username: string; role: string; createdAt: string }>;
}

interface AuditEntry {
  id: string;
  userId: string;
  username: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: string;
  ip?: string;
  timestamp: string;
}

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function api<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const body = await res.json();
    if (!res.ok) {
      return { ok: false, error: body.error || `HTTP ${res.status}` };
    }
    return { ok: true, data: body as T };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

export default function AccountSettings() {
  // Current user state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // User list state (admin only)
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  // Create user form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newRole, setNewRole] = useState<'editor' | 'viewer'>('editor');
  const [createLoading, setCreateLoading] = useState(false);
  const [createResult, setCreateResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Token visibility
  const [tokenVisible, setTokenVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const tokenRef = useRef<HTMLInputElement>(null);

  // Audit log state (admin only)
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditFilter, setAuditFilter] = useState<string>('');
  const [auditLimit, setAuditLimit] = useState(50);

  // Fetch current user on mount
  useEffect(() => {
    fetchCurrentUser();
  }, []);

  // Fetch audit log when user is loaded and is admin
  useEffect(() => {
    if (currentUser?.role === 'admin') {
      fetchAuditLog();
    }
  }, [currentUser?.role]);

  async function fetchCurrentUser() {
    setLoading(true);
    setError(null);
    const res = await api<AuthResponse>('/api/auth/me');
    if (res.ok && res.data) {
      // Use full user record (includes token) if available, otherwise build from auth user
      if (res.data.currentUser) {
        setCurrentUser({
          id: res.data.currentUser.id,
          username: res.data.currentUser.username,
          role: res.data.currentUser.role as User['role'],
          createdAt: res.data.currentUser.createdAt,
          token: res.data.currentUser.token,
        });
      } else {
        setCurrentUser({
          id: res.data.user.id,
          username: res.data.user.name,
          role: res.data.user.role as User['role'],
          createdAt: '',
          token: '',
        });
      }
      // If admin, also load user list from the auth response
      if (res.data.allUsers?.length) {
        setUsers(
          res.data.allUsers.map((u) => ({
            id: u.id,
            username: u.username,
            role: u.role as User['role'],
            createdAt: u.createdAt,
            token: '',
          })),
        );
      }
      // Fetch user list separately if admin but no allUsers (e.g., legacy response)
      if (res.data.user.role === 'admin' && !res.data.allUsers?.length) {
        fetchUsers();
      }
    } else {
      setError(res.error || 'Failed to load user info');
    }
    setLoading(false);
  }

  async function fetchUsers() {
    setUsersLoading(true);
    setUsersError(null);
    const res = await api<AdminUsersResponse>('/api/admin/users');
    if (res.ok && res.data) {
      setUsers(
        res.data.users.map((u) => ({
          id: u.id,
          username: u.username,
          role: u.role as User['role'],
          createdAt: u.createdAt,
          token: '',
        })),
      );
    } else {
      setUsersError(res.error || 'Failed to load users');
    }
    setUsersLoading(false);
  }

  async function handleCreateUser() {
    if (!newUsername.trim()) return;
    setCreateLoading(true);
    setCreateResult(null);
    const res = await api<{ user: User }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ username: newUsername.trim(), role: newRole }),
    });
    if (res.ok && res.data?.user) {
      const u = res.data.user;
      setCreateResult({ ok: true, message: `User "${u.username}" created with token: ${u.token}` });
      setUsers((prev) => [...prev, u]);
      setNewUsername('');
      setShowCreateForm(false);
    } else {
      setCreateResult({ ok: false, message: res.error || 'Failed to create user' });
    }
    setCreateLoading(false);
  }

  async function handleRotateToken(userId: string) {
    const res = await api<{ token: string }>(`/api/admin/users/${userId}/rotate-token`, {
      method: 'POST',
    });
    if (res.ok && res.data?.token) {
      const newToken = res.data.token;
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, token: newToken } : u)));
      // If rotating own token, update current user
      if (currentUser?.id === userId) {
        setCurrentUser((prev) => (prev ? { ...prev, token: newToken } : prev));
      }
    }
  }

  async function handleCopyToken() {
    if (!currentUser?.token) return;
    try {
      await navigator.clipboard.writeText(currentUser.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the text
      tokenRef.current?.select();
    }
  }

  async function fetchAuditLog() {
    setAuditLoading(true);
    const params = new URLSearchParams();
    params.set('limit', String(auditLimit));
    if (auditFilter) params.set('action', auditFilter);
    const res = await api<{ entries: AuditEntry[]; total: number }>(`/api/admin/audit-log?${params}`);
    if (res.ok && res.data) {
      setAuditEntries(res.data.entries);
      setAuditTotal(res.data.total);
    }
    setAuditLoading(false);
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-(--vestara-accent) mx-auto" />
        <p className="text-(--vestara-text-2) mt-4">Loading account info…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">{error}</p>
        <button onClick={fetchCurrentUser} className="mt-4 text-(--vestara-accent) hover:underline">
          Retry
        </button>
      </div>
    );
  }

  const isAdmin = currentUser?.role === 'admin';

  return (
    <div className="space-y-8">
      {/* ── Profile Section ── */}
      <section>
        <h2 className="text-lg font-semibold text-(--vestara-text) mb-4">Profile</h2>
        <div className="bg-(--vestara-accent-bg) rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-(--vestara-text-2)">Username</span>
            <span className="text-(--vestara-text) font-medium">{currentUser?.username}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-(--vestara-text-2)">Role</span>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                isAdmin
                  ? 'bg-purple-500/10 text-purple-400'
                  : currentUser?.role === 'editor'
                    ? 'bg-blue-500/10 text-blue-400'
                    : 'bg-(--vestara-accent-bg) text-(--vestara-text-2)'
              }`}
            >
              {currentUser?.role}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-(--vestara-text-2)">User ID</span>
            <span className="text-xs text-(--vestara-text-dim) font-mono">{currentUser?.id}</span>
          </div>
        </div>
      </section>

      {/* ── API Token Section ── */}
      <section>
        <h2 className="text-lg font-semibold text-(--vestara-text) mb-4">API Token</h2>
        <div className="bg-(--vestara-accent-bg) rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <input
              ref={tokenRef}
              type={tokenVisible ? 'text' : 'password'}
              readOnly
              value={currentUser?.token || ''}
              className="flex-1 px-3 py-2 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded text-sm font-mono text-(--vestara-text) focus:outline-none"
            />
            <button
              onClick={() => setTokenVisible((v) => !v)}
              className="px-3 py-2 text-sm text-(--vestara-text-2) hover:text-(--vestara-text) bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded transition-colors"
              title={tokenVisible ? 'Hide token' : 'Show token'}
            >
              {tokenVisible ? '🙈' : '👁️'}
            </button>
            <button
              onClick={handleCopyToken}
              className="px-3 py-2 text-sm bg-(--vestara-accent) text-white rounded hover:opacity-90 transition-opacity"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-(--vestara-text-dim)">
            This token authenticates you with the Vestara API. Include it in the{' '}
            <code className="text-(--vestara-accent)">Authorization: Bearer &lt;token&gt;</code> header.
          </p>
          {isAdmin && (
            <p className="text-xs text-amber-400">
              ⚠️ Keep this token secure. Anyone with it has full admin access.
            </p>
          )}
        </div>
      </section>

      {/* ── User Management Section (admin only) ── */}
      {isAdmin && (<>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-(--vestara-text)">Users</h2>
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-3 py-1.5 text-sm bg-(--vestara-accent) text-white rounded hover:opacity-90 transition-opacity"
            >
              + Add User
            </button>
          </div>

          {/* Create User Form */}
          {showCreateForm && (
            <div className="bg-(--vestara-accent-bg) rounded-lg p-4 mb-4 border border-(--vestara-accent-border)">
              <h3 className="text-sm font-medium text-(--vestara-text) mb-3">New User</h3>
              <div className="flex flex-col gap-3">
                <input
                  type="text"
                  placeholder="Username"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="px-3 py-2 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded text-sm text-(--vestara-text) focus:outline-none focus:border-(--vestara-accent)"
                  autoFocus
                />
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as 'editor' | 'viewer')}
                  className="px-3 py-2 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded text-sm text-(--vestara-text) focus:outline-none focus:border-(--vestara-accent)"
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateUser}
                    disabled={createLoading || !newUsername.trim()}
                    className="px-4 py-2 text-sm bg-(--vestara-accent) text-white rounded hover:opacity-90 transition-colors disabled:opacity-50"
                  >
                    {createLoading ? 'Creating…' : 'Create'}
                  </button>
                  <button
                    onClick={() => {
                      setShowCreateForm(false);
                      setCreateResult(null);
                    }}
                    className="px-4 py-2 text-sm text-(--vestara-text-2) hover:text-(--vestara-text) transition-colors"
                  >
                    Cancel
                  </button>
                </div>
                {createResult && (
                  <div
                    className={`text-sm ${createResult.ok ? 'text-(--vestara-green)' : 'text-(--vestara-red)'}`}
                  >
                    {createResult.message}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* User List */}
          {usersLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-(--vestara-accent) mx-auto" />
            </div>
          ) : usersError ? (
            <div className="text-center py-8">
              <p className="text-(--vestara-red) text-sm">{usersError}</p>
              <button onClick={fetchUsers} className="mt-2 text-sm text-(--vestara-accent) hover:underline">
                Retry
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="bg-(--vestara-accent-bg) rounded-lg p-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                        user.role === 'admin'
                          ? 'bg-purple-500'
                          : user.role === 'editor'
                            ? 'bg-blue-500'
                            : 'bg-gray-500'
                      }`}
                    >
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-(--vestara-text)">
                          {user.username}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            user.role === 'admin'
                              ? 'bg-purple-500/10 text-purple-400'
                              : currentUser?.role === 'editor'
                                ? 'bg-blue-500/10 text-blue-400'
                                : 'bg-(--vestara-accent-bg) text-(--vestara-text-2)'
                          }`}
                        >
                          {user.role}
                        </span>
                        {user.id === currentUser?.id && (
                          <span className="text-xs text-(--vestara-text-dim)">(you)</span>
                        )}
                      </div>
                      <div className="text-xs text-(--vestara-text-dim)">
                        Created {new Date(user.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      readOnly
                      value={user.token}
                      className="w-32 px-2 py-1 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded text-xs font-mono text-(--vestara-text-dim) focus:outline-none"
                    />
                    <button
                      onClick={() => handleRotateToken(user.id)}
                      className="px-2 py-1 text-xs text-(--vestara-accent) hover:underline transition-colors"
                      title="Rotate token"
                    >
                      🔄
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

        {/* ── Audit Log Section (admin only) ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-(--vestara-text)">
              Audit Log
              <span className="ml-2 text-sm font-normal text-(--vestara-text-dim)">{auditTotal} entries</span>
            </h2>
            <div className="flex items-center gap-2">
              <select
                value={auditFilter}
                onChange={(e) => setAuditFilter(e.target.value)}
                className="px-2 py-1 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded text-xs text-(--vestara-text) focus:outline-none"
              >
                <option value="">All actions</option>
                <option value="settings.update">Settings update</option>
                <option value="settings.delete">Settings reset</option>
                <option value="agent.create">Agent create</option>
                <option value="agent.run">Agent run</option>
                <option value="plan.create">Plan create</option>
                <option value="implement.start">Implement start</option>
                <option value="implement.apply">Implement apply</option>
                <option value="project.create">Project create</option>
                <option value="schedule.create">Schedule create</option>
                <option value="user.create">User create</option>
                <option value="user.login">Login</option>
              </select>
              <button
                onClick={fetchAuditLog}
                className="px-3 py-1.5 text-sm bg-(--vestara-accent) text-white rounded hover:opacity-90 transition-opacity"
              >
                Refresh
              </button>
            </div>
          </div>

          {auditLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-(--vestara-accent) mx-auto" />
            </div>
          ) : auditEntries.length === 0 ? (
            <div className="text-center py-8 text-(--vestara-text-dim) text-sm">No audit entries found.</div>
          ) : (
            <div className="space-y-1">
              {auditEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="bg-(--vestara-accent-bg) rounded px-3 py-2 text-xs grid grid-cols-1 sm:grid-cols-[120px_80px_100px_1fr_80px] gap-2 items-center"
                >
                  <span className="text-(--vestara-text-dim) font-mono">
                    {new Date(entry.timestamp).toLocaleString()}
                  </span>
                  <span className="text-(--vestara-text) font-medium">{entry.username}</span>
                  <span className="text-(--vestara-text-2) font-mono text-[10px]">{entry.action}</span>
                  <span className="text-(--vestara-text-2) truncate">
                    {entry.details || entry.resourceId || entry.resource}
                    {entry.details && entry.resourceId ? ` — ${entry.resourceId}` : ''}
                  </span>
                  <span className="text-(--vestara-text-dim) text-right font-mono text-[10px]">
                    {entry.ip || ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </>)}
    </div>
  );
}
