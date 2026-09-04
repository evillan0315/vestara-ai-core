import { useCallback, useState } from 'react';

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return extractText((node as any).props.children);
  }
  return '';
}

export function CodeBlock({
  className,
  children,
  inline,
}: {
  className?: string;
  children?: React.ReactNode;
  inline?: boolean;
}) {
  const text = extractText(children).replace(/\n$/, '');
  // A fenced block carries a language-* class. rehype-highlight appends its
  // own classes (e.g. "hljs language-typescript"), so match anywhere rather
  // than anchoring at the start — otherwise single-line fences degrade to
  // inline code and lose the label + Copy action. (GA-UI-005)
  const langMatch = /language-([\w+-]+)/.exec(className || '');
  const isInline = !langMatch && !text.includes('\n');

  if (isInline) {
    return (
      <code className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[12.5px] text-zinc-200 font-mono">
        {text}
      </code>
    );
  }

  const lang = langMatch?.[1] ?? '';
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [preview, setPreview] = useState(false);
  const canPreview = ['html', 'htm', 'svg', 'jsx', 'tsx'].includes(lang);
  // NOTE (GA-UI-005): there is intentionally no "Run" action. An earlier
  // "Run" button merely copied bash to the clipboard without executing
  // anything — a false execution affordance. Opening/executing content is
  // never a presentation-layer authority.

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setCopyFailed(false);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFailed(true);
      setTimeout(() => setCopyFailed(false), 2000);
    }
  }, [text]);

  // Never let code-action interaction bubble into a panel drag handler
  // (same contract as GA-UI-003 AssistantResponseActions).
  const stopDrag = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <>
      <div className="group relative my-2 rounded-lg overflow-hidden border border-(--vestara-accent-border) bg-(--vestara-accent-bg)">
        <div className="flex items-center justify-between px-4 py-1.5 bg-(--vestara-accent-bg) border-b border-(--vestara-accent-border)">
          <span className="text-[11px] text-zinc-500 font-mono">{lang || 'code'}</span>
          <div className="flex items-center gap-1">
            {canPreview && (
              <button
                type="button"
                onClick={() => setPreview(true)}
                onPointerDown={stopDrag}
                onMouseDown={stopDrag}
                aria-label="Preview rendered HTML"
                title="Preview"
                className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded hover:bg-zinc-700/40 cursor-pointer flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
                Preview
              </button>
            )}
            <button
              type="button"
              onClick={handleCopy}
              onPointerDown={stopDrag}
              onMouseDown={stopDrag}
              aria-label="Copy code"
              title="Copy code"
              className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-zinc-700/40 cursor-pointer"
            >
              {copyFailed ? (
                <>Copy failed</>
              ) : copied ? (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  Copy
                </>
              )}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <pre className="p-4 text-[13px] leading-relaxed">
            <code className={className || ''}>{children}</code>
          </pre>
        </div>
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setPreview(false)}
        >
          <div
            className="w-[90vw] h-[85vh] bg-white rounded-xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2 bg-zinc-100 border-b border-zinc-200">
              <span className="text-[12px] font-medium text-zinc-700">Preview</span>
              <button
                type="button"
                onClick={() => setPreview(false)}
                aria-label="Close preview"
                title="Close preview"
                className="text-zinc-500 hover:text-zinc-700 transition-colors cursor-pointer p-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1">
              {/* Fully opaque sandbox (no allow-scripts): model-generated
                  HTML previews as static content only — scripts in model
                  output never execute, while markup still renders. */}
              <iframe className="w-full h-full" srcDoc={text} sandbox="" title="Preview" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function Table({ children }: { children?: React.ReactNode }) {
  return (
    <div className="overflow-x-auto my-3 border border-(--vestara-accent-border) rounded-lg">
      <table className="w-full text-[12.5px] border-collapse">{children}</table>
    </div>
  );
}
