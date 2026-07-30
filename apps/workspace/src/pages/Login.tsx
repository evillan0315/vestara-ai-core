import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function Login() {
  const { setActor } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim() || 'local-operator';
    if (!n) {
      setErr('Enter a name');
      return;
    }

    setSubmitting(true);
    setErr('');

    // Authenticate with the API server
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: n }),
      });
      if (res.ok) {
        const data = await res.json();
        // Store the token and user info
        if (data.user?.token) {
          localStorage.setItem('vestara-auth-token', data.user.token);
          localStorage.setItem('vestara-actor', data.user.username || n);
        }
      }
      // Even if the API is unreachable, fall back to local identity
    } catch {
      // API server may not be running — use local identity
    }

    setActor(n);
    setSubmitting(false);
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-zinc-950">
      <div className="w-full max-w-sm bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-8">
        <h1 className="text-xl font-bold text-accent mb-2">Vestara Workspace</h1>
        <p className="text-sm text-(--vestara-text-2)mb-6">
          Enter your operator name to log in. Creates a local session or authenticates with the workspace server.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              placeholder="local-operator"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (err) setErr('');
              }}
              disabled={submitting}
              className={`w-full px-3 py-2 bg-zinc-950 border rounded-md text-sm text-zinc-300 placeholder-zinc-700 focus:outline-none focus:border-accent transition-colors ${
                err ? 'border-red-400/50' : 'border-(--vestara-accent-border)'
              }`}
            />
            {err && <p className="text-xs text-red-400 mt-1">{err}</p>}
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 accent-btn rounded-md text-sm font-medium cursor-pointer disabled:opacity-50"
          >
            {submitting ? 'Signing in...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
