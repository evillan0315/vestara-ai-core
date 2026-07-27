import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function Login() {
  const { setActor } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [err, setErr] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) {
      setErr('Enter a name');
      return;
    }
    setActor(n);
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-zinc-950">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-lg p-8">
        <h1 className="text-xl font-bold text-accent mb-2">Vestara Workspace</h1>
        <p className="text-sm text-zinc-500 mb-6">
          Enter your operator identity. This is a local placeholder — no real authentication yet.
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
              className={`w-full px-3 py-2 bg-zinc-950 border rounded-md text-sm text-zinc-300 placeholder-zinc-700 focus:outline-none focus:border-accent transition-colors ${
                err ? 'border-red-400/50' : 'border-zinc-700'
              }`}
            />
            {err && <p className="text-xs text-red-400 mt-1">{err}</p>}
          </div>
          <button type="submit" className="w-full py-2.5 accent-btn rounded-md text-sm font-medium cursor-pointer">
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
