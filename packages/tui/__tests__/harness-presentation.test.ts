import { describe, expect, it } from 'vitest';
import { harnessStatusTone } from '../src/state/harness-presentation.js';

describe('harness status tone', () => {
  it('maps success states', () => {
    expect(harnessStatusTone('completed')).toBe('success');
    expect(harnessStatusTone('verified')).toBe('success');
    expect(harnessStatusTone('approved')).toBe('success');
  });

  it('maps failure states', () => {
    expect(harnessStatusTone('failed')).toBe('error');
    expect(harnessStatusTone('error')).toBe('error');
    expect(harnessStatusTone('cancelled')).toBe('error');
  });

  it('maps warning states', () => {
    expect(harnessStatusTone('blocked')).toBe('warning');
    expect(harnessStatusTone('attention-required')).toBe('warning');
    expect(harnessStatusTone('approval-required')).toBe('warning');
  });

  it('maps active states', () => {
    expect(harnessStatusTone('running')).toBe('active');
    expect(harnessStatusTone('executing')).toBe('active');
    expect(harnessStatusTone('thinking')).toBe('active');
  });

  it('maps unknown and missing states to muted', () => {
    expect(harnessStatusTone('something-else')).toBe('muted');
    expect(harnessStatusTone(undefined)).toBe('muted');
  });
});
