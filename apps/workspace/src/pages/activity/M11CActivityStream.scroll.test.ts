import { describe, expect, it } from 'vitest';
import { latestScrollPosition, preservedScrollPosition } from './M11CActivityStream';

describe('AR-SCROLL-002 scroll contract', () => {
  it('targets the bottom as the latest end of the ascending list', () => {
    expect(latestScrollPosition(1200)).toBe(1200);
  });

  it('preserves the visible anchor when older content is prepended', () => {
    expect(preservedScrollPosition(240, 1000, 1400)).toBe(640);
    expect(preservedScrollPosition(240, 1000, 1000)).toBe(240);
  });
});
