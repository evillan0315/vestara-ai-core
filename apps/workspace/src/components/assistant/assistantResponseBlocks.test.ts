/**
 * assistantResponseBlocks parser unit tests (pure functions, no DOM).
 */

import { describe, expect, it } from 'vitest';
import { hasResponseBlocks, parseResponseBlocks } from './assistantResponseBlocks.js';

const EXAMPLE = `Both fixes are in and validated. Refresh the Workspace tab to pick them up.

**Fix A — re-select forces reload** (\`ConversationPanel.tsx:1379-1399\`) Re-clicking the active conversation no longer no-ops.

**Fix B — runtime transcript affordance** (\`ConversationPanel.tsx:1406-1423\`)

**Validation**

* \`pnpm lint:check\` — clean (1586 files)
* \`pnpm vds:validate\` — passed

Files changed: ConversationPanel.tsx, useAssistantConversation.ts.

**Verification**

* lint clean
* transcript affordance works after refresh

**Suggested next steps**

* Start on interactive blocks
* Wire the verifier route

Want me to start on interactive blocks?`;

describe('parseResponseBlocks', () => {
  it('returns empty blocks for empty input', () => {
    const blocks = parseResponseBlocks('');
    expect(hasResponseBlocks(blocks)).toBe(false);
  });

  it('returns empty blocks for ordinary prose', () => {
    const blocks = parseResponseBlocks('Hello there, how can I help you today? I am doing well.');
    expect(hasResponseBlocks(blocks)).toBe(false);
  });

  it('parses fix lines with keys and titles', () => {
    const blocks = parseResponseBlocks(EXAMPLE);
    expect(blocks.fixes).toHaveLength(2);
    expect(blocks.fixes[0].key).toBe('A');
    expect(blocks.fixes[0].title).toContain('re-select forces reload');
    expect(blocks.fixes[1].key).toBe('B');
  });

  it('extracts file refs from fix titles', () => {
    const blocks = parseResponseBlocks(EXAMPLE);
    expect(blocks.fixes[0].fileRefs.length).toBeGreaterThan(0);
    expect(blocks.fixes[0].fileRefs[0]).toContain('ConversationPanel.tsx');
  });

  it('parses validation rows into command + result', () => {
    const blocks = parseResponseBlocks(EXAMPLE);
    expect(blocks.validations).toHaveLength(2);
    expect(blocks.validations[0].command).toContain('pnpm lint:check');
    expect(blocks.validations[0].result).toContain('clean');
  });

  it('parses the files-changed line', () => {
    const blocks = parseResponseBlocks(EXAMPLE);
    expect(blocks.filesChanged).toContain('ConversationPanel.tsx');
    expect(blocks.filesChanged).toContain('useAssistantConversation.ts');
  });

  it('parses verification bullets', () => {
    const blocks = parseResponseBlocks(EXAMPLE);
    expect(blocks.verifications.length).toBeGreaterThan(0);
  });

  it('parses suggestion bullets and trailing questions', () => {
    const blocks = parseResponseBlocks(EXAMPLE);
    expect(blocks.suggestions).toContain('Start on interactive blocks');
    expect(blocks.suggestions.some((s) => s.endsWith('?'))).toBe(true);
  });

  it('caps trailing questions at three', () => {
    const blocks = parseResponseBlocks('Is this ok?\nShould I proceed?\nWhat about third?\nAnd fourth?');
    expect(blocks.suggestions.length).toBeLessThanOrEqual(3);
  });
});
