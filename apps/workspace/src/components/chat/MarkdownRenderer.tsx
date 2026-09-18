/**
 * VES-PERF-002 (P1): lazy entry point for the markdown pipeline.
 *
 * The heavy renderer (`react-markdown` + `remark-gfm` + `rehype-highlight` +
 * `highlight.js`) previously sat in the main `index` chunk, so every route paid
 * for it. It is now a separate chunk, warmed by `preloadMarkdownRenderer()`
 * when the assistant opens — before any message needs to render.
 *
 * The wrapper stays `memo`-wrapped and synchronous so existing consumers and
 * component contracts are unchanged.
 */

import { Suspense, lazy, memo } from 'react';

const MarkdownRendererImpl = lazy(() => import('./MarkdownRendererImpl'));

export interface MarkdownRendererProps {
  content: string;
}

/**
 * Warm the markdown chunk ahead of use (assistant open / conversation
 * selection). Safe to call repeatedly — the bundler caches the module.
 */
export function preloadMarkdownRenderer(): void {
  void import('./MarkdownRendererImpl');
}

export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <Suspense
      fallback={
        // Content stays visible during the brief window before the chunk
        // resolves (it is preloaded on assistant intent), and text queries in
        // tests keep working without special-casing.
        <div className="markdown whitespace-pre-wrap">{content}</div>
      }
    >
      <MarkdownRendererImpl content={content} />
    </Suspense>
  );
});
