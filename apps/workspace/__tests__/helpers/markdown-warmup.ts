/**
 * VES-PERF-002 (P1): the markdown pipeline (`MarkdownRendererImpl`) is a lazy
 * chunk. `React.lazy` caches resolution at module scope, so resolving it once
 * per test file makes every subsequent render synchronous — tests keep their
 * deterministic DOM assertions instead of racing the Suspense fallback.
 *
 * Call from `beforeAll` in any suite that asserts rendered markdown.
 */

import { render, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { MarkdownRenderer } from '../../src/components/chat/MarkdownRenderer';

export async function warmMarkdownRenderer(): Promise<void> {
  const { container, unmount } = render(createElement(MarkdownRenderer, { content: 'markdown-warmup' }));
  await waitFor(
    () => {
      // react-markdown wraps plain text in a paragraph; the plain-text
      // Suspense fallback never produces one. Robust to fallback changes.
      if (!container.querySelector('.markdown p')) {
        throw new Error('markdown chunk not resolved');
      }
    },
    { timeout: 10_000 },
  );
  unmount();
}
