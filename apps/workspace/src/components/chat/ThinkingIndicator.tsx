const THINKING_STEPS = [
  'Analyzing your request...',
  'Searching project context...',
  'Reading relevant files...',
  'Evaluating approach...',
  'Generating response...',
];

interface ThinkingIndicatorProps {
  step?: number;
  status?: string;
  toolCalls?: Array<{ tool: string; status: string; label: string }>;
}

export function ThinkingIndicator({ step = 0, status, toolCalls }: ThinkingIndicatorProps) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
        <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        {toolCalls && toolCalls.length > 0 ? (
          <div className="space-y-1">
            {toolCalls.map((tc, i) => (
              <div key={i} className="flex items-center gap-2 text-[12px]">
                {tc.status === 'completed' ? (
                  <svg
                    className="w-3 h-3 text-green-500 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : tc.status === 'running' ? (
                  <span className="w-3 h-3 rounded-full border-2 border-zinc-600 border-t-zinc-400 animate-spin shrink-0" />
                ) : (
                  <svg className="w-3 h-3 text-zinc-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                )}
                <span className={tc.status === 'completed' ? 'text-zinc-400' : 'text-zinc-500'}>{tc.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 text-[13px]">
              {status || THINKING_STEPS[Math.min(step, THINKING_STEPS.length - 1)]}
            </span>
            <span className="flex gap-0.5">
              <span className="w-1 h-1 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-1 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-1 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
