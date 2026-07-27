import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <div className="text-6xl font-bold text-zinc-800 mb-4">404</div>
      <h1 className="text-xl font-semibold text-zinc-300 mb-2">Page not found</h1>
      <p className="text-sm text-zinc-500 mb-6">The page you're looking for doesn't exist or has been moved.</p>
      <div className="flex gap-3 justify-center">
        <Link to="/dashboard" className="text-xs px-4 py-2 accent-btn rounded">
          Go to Dashboard
        </Link>
        <button
          onClick={() => window.history.back()}
          className="text-xs px-4 py-2 bg-zinc-800 border border-zinc-700 text-zinc-400 rounded hover:bg-zinc-700 transition-colors cursor-pointer"
        >
          Go Back
        </button>
      </div>
      <div className="mt-8 text-xs text-zinc-700">
        <p>
          Keyboard shortcut: press{' '}
          <kbd className="px-1 py-0.5 bg-zinc-800 border border-zinc-700 rounded font-mono">g</kbd> then{' '}
          <kbd className="px-1 py-0.5 bg-zinc-800 border border-zinc-700 rounded font-mono">d</kbd> for Dashboard
        </p>
      </div>
    </div>
  );
}
