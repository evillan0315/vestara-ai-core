import { describe, expect, it } from 'vitest';
import { applyComposerSuggestion, parseComposerSuggestionCommand } from './composerSuggestion';

describe('composer suggestion command', () => {
  it('recognizes plain and bounded topic commands without treating prose as a command', () => {
    expect(parseComposerSuggestionCommand('I want documentation here\n/suggest')).toEqual({
      mode: 'suggest',
      draft: 'I want documentation here',
    });
    expect(parseComposerSuggestionCommand('/suggest docs')).toEqual({ mode: 'docs', draft: '' });
    expect(parseComposerSuggestionCommand('/suggest unsupported')).toEqual({ mode: 'suggest', draft: '' });
    expect(parseComposerSuggestionCommand('please /suggest this')).toBeNull();
  });

  it('updates the draft without sending it', () => {
    expect(applyComposerSuggestion('I want documentation here', 'replace', 'Add contextual documentation here.')).toBe(
      'Add contextual documentation here.',
    );
    expect(applyComposerSuggestion('I want documentation here', 'append', 'Use the existing drawer.')).toBe(
      'I want documentation here\nUse the existing drawer.',
    );
    expect(applyComposerSuggestion('I want documentation here', 'direction', 'Audit existing capability')).toBe(
      'I want documentation here\nAudit existing capability',
    );
  });
});
