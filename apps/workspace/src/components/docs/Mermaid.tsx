/**
 * Mermaid diagram renderer.
 *
 * Lazy-loads the (large) mermaid bundle only when a diagram is present and
 * renders to an SVG via the safe `render` API. Theme follows the Workspace
 * light/dark mode.
 */

import { useEffect, useId, useState } from 'react';
import { useTheme } from '../../lib/theme';

let counter = 0;

export function Mermaid({ code }: { code: string }) {
  const { resolved } = useTheme();
  const uid = useId().replace(/[:]/g, '');
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: resolved === 'light' ? 'default' : 'dark',
          securityLevel: 'strict',
          fontFamily: 'var(--vestara-font-family)',
          themeVariables: {
            fontFamily: 'var(--vestara-font-family)',
          },
        });
        const nonce = `${uid}-${counter++}`;
        const { svg: out } = await mermaid.render(`mmd-${nonce}`, code);
        if (!cancelled) setSvg(out);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || String(err));
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [code, resolved, uid]);

  if (error) {
    return (
      <div className="doc-mermaid-error" role="alert">
        <div className="text-[11px] font-semibold uppercase tracking-wide mb-1">Diagram failed to render</div>
        <pre className="text-[11.5px] whitespace-pre-wrap">{error}</pre>
      </div>
    );
  }

  return (
    /* biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid renders under securityLevel strict */
    <div className="doc-mermaid" dangerouslySetInnerHTML={{ __html: svg }} aria-label="Mermaid diagram" role="img" />
  );
}
