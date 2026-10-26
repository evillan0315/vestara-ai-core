import { describe, expect, it } from 'vitest';
import { findOrchestrationTemplate, ORCHESTRATION_TEMPLATES } from '../src/orchestration-templates';

describe('orchestration project templates (PCS-025)', () => {
  it('publishes unique, stable ids', () => {
    const ids = ORCHESTRATION_TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('feature-delivery');
  });

  it('every template carries a complete creation preset', () => {
    for (const template of ORCHESTRATION_TEMPLATES) {
      expect(template.name.trim()).not.toBe('');
      expect(template.description.trim()).not.toBe('');
      expect(template.goal.trim()).not.toBe('');
      expect(template.tasks.length).toBeGreaterThan(0);
      for (const task of template.tasks) {
        expect(task.summary.trim()).not.toBe('');
        expect(task.files.every((file) => file.trim() !== '')).toBe(true);
        expect(task.requiredCapabilities.every((capability) => capability.trim() !== '')).toBe(true);
      }
    }
  });

  it('resolves a template by id and fails closed for unknown ids', () => {
    expect(findOrchestrationTemplate('feature-delivery')?.name).toBe('Feature Delivery');
    expect(findOrchestrationTemplate('does-not-exist')).toBeUndefined();
  });
});
