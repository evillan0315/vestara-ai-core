/**
 * Task → agent resolution: every orchestration capability set used by the
 * project templates resolves to its owning canonical agent (primary or
 * subagent), so workflow nodes carry real attribution.
 */
import { describe, expect, it } from 'vitest';
import { ORCHESTRATION_TEMPLATES } from '../src/orchestration-templates';
import { resolveTaskAgentId } from '../src/task-agent-resolver';

describe('resolveTaskAgentId', () => {
  it('routes plan-shaped tasks to the planner', () => {
    expect(resolveTaskAgentId(['planning', 'architecture-analysis'])).toBe('agent-planner');
    expect(resolveTaskAgentId(['architecture-analysis', 'planning'])).toBe('agent-planner');
  });

  it('routes implementation tasks to the developer (primary)', () => {
    expect(resolveTaskAgentId(['code-generation'])).toBe('agent-developer');
    expect(resolveTaskAgentId(['refactoring'])).toBe('agent-developer');
    expect(resolveTaskAgentId(['bug-fixing'])).toBe('agent-developer');
  });

  it('routes verification tasks to the verifier subagent', () => {
    expect(resolveTaskAgentId(['testing'])).toBe('agent-verifier');
    expect(resolveTaskAgentId(['testing', 'quality-analysis'])).toBe('agent-verifier');
  });

  it('routes review tasks to the reviewer subagent', () => {
    expect(resolveTaskAgentId(['design-review'])).toBe('agent-reviewer');
  });

  it('routes investigation tasks to the analyst', () => {
    expect(resolveTaskAgentId(['diagnostics'])).toBe('agent-verifier');
    expect(resolveTaskAgentId(['dependency-analysis', 'diagnostics'])).toBe('agent-analyst');
  });

  it('routes design tasks to the architect', () => {
    expect(resolveTaskAgentId(['database-design'])).toBe('agent-architect');
    expect(resolveTaskAgentId(['architecture-analysis', 'database-design'])).toBe('agent-architect');
  });

  it('routes governance tasks to the system agent', () => {
    expect(resolveTaskAgentId(['governance'])).toBe('agent-system');
    expect(resolveTaskAgentId(['milestone-management', 'progress-tracking'])).toBe('agent-system');
  });

  it('routes web tasks to the browser subagent', () => {
    expect(resolveTaskAgentId(['web-navigation', 'web-observation'])).toBe('agent-browser');
  });

  it('returns undefined when nothing matches', () => {
    expect(resolveTaskAgentId([])).toBeUndefined();
    expect(resolveTaskAgentId(['nope-not-a-capability'])).toBeUndefined();
  });

  it('covers every capability set used by the orchestration templates', () => {
    for (const template of ORCHESTRATION_TEMPLATES) {
      for (const task of template.tasks) {
        expect(resolveTaskAgentId([...task.requiredCapabilities]), `${template.id} / ${task.summary}`).toBeDefined();
      }
    }
  });
});
