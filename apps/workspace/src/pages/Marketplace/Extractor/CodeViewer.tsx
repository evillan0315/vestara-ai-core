/**
 * VESTARA Extractor — syntax-highlighted code viewer.
 *
 * Uses highlight.js (already a workspace dependency) for tokenization.
 * Falls back to plain text if the language fails to load. Token colors
 * come from the Vestara token system via CSS custom properties.
 */

import hljs from 'highlight.js/lib/common';

export default function CodeViewer({ code }: { code: string }) {
  let html: string;
  try {
    const result = hljs.highlight(code, { language: 'typescript' });
    html = result.value;
  } catch {
    html = escapeHtml(code);
  }
  return (
    <pre
      className="overflow-auto p-3 font-mono text-xs leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
