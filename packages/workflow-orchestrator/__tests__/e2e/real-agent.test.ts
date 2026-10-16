import { describe, expect, it } from 'vitest';
import {
  evaluateRunControls,
  REAL_AGENT_FRAMEWORK_DEFAULTS,
  REAL_AGENT_PROFILE_PRESETS,
  type RealAgentE2EProfile,
  recordInvocation,
  redactTranscript,
  resolveRealAgentProfile,
  validateAgentGeneratedPlan,
} from '../e2e-support/real-agent';

const profile: RealAgentE2EProfile = resolveRealAgentProfile('deepseekV4FlashOpenCodeGo');

describe('WFO-E2E-002A real-agent profile', () => {
  it('keeps framework defaults free of any provider or model', () => {
    expect(REAL_AGENT_FRAMEWORK_DEFAULTS.providerId).toBe('none');
    expect(REAL_AGENT_FRAMEWORK_DEFAULTS.modelId).toBe('none');
    expect(REAL_AGENT_FRAMEWORK_DEFAULTS.credentialEnvVar).toBe('');
    expect(REAL_AGENT_FRAMEWORK_DEFAULTS.advisory).toBe(true);
    expect(REAL_AGENT_FRAMEWORK_DEFAULTS.maximumEstimatedCostUsd).toBeGreaterThan(0);
  });

  it('pins Opencode Go presets to their models and credential env vars', () => {
    expect(REAL_AGENT_PROFILE_PRESETS.deepseekV4FlashOpenCodeGo).toMatchObject({
      providerId: 'opencode-go',
      modelId: 'deepseek-v4-flash',
      credentialEnvVar: 'OPENCODE_GO_API_KEY',
    });
    expect(REAL_AGENT_PROFILE_PRESETS.mimoV25OpenCodeGo.modelId).toBe('mimo-v2.5');
    expect(REAL_AGENT_PROFILE_PRESETS.deepseekV4FlashOpenCodeGo.advisory).toBe(true);
  });

  it('uses the "-free" model names on Opencode presets', () => {
    expect(REAL_AGENT_PROFILE_PRESETS.deepseekV4FlashOpenCodeFree.modelId).toBe('deepseek-v4-flash-free');
    expect(REAL_AGENT_PROFILE_PRESETS.mimoV25OpenCodeFree.modelId).toBe('mimo-v2.5-free');
    expect(REAL_AGENT_PROFILE_PRESETS.deepseekV4FlashOpenCodeFree.credentialEnvVar).toBe('OPENCODE_API_KEY');
  });

  it('resolves unknown profile ids to the framework defaults', () => {
    const p = resolveRealAgentProfile('framework-default');
    expect(p.providerId).toBe('none');
    expect(p.modelId).toBe('none');
  });

  it('does not carry the API key value in any profile', () => {
    for (const preset of Object.values(REAL_AGENT_PROFILE_PRESETS)) {
      expect(JSON.stringify(preset)).not.toMatch(/sk-[a-z0-9]/);
    }
  });
});

describe('WFO-E2E-002A model-call controls', () => {
  const base = {
    modelCalls: 1,
    inputTokens: 100,
    outputTokens: 100,
    estimatedCostUsd: 0.1,
    elapsedMs: 1_000,
    planningTurns: 1,
    executionTurns: 1,
    noProgressTurns: 0,
  };

  it('continues within budget and limits', () => {
    expect(evaluateRunControls(base, profile)).toEqual({ status: 'continue', reasons: [] });
  });

  it('stops at the maximum call count', () => {
    const result = evaluateRunControls({ ...base, modelCalls: profile.maximumModelCalls }, profile);
    expect(result.status).toBe('stop');
    expect(result.reasons).toContain('maximum model-call count reached');
  });

  it('pauses (budget-paused) when the cost ceiling is reached', () => {
    const result = evaluateRunControls({ ...base, estimatedCostUsd: profile.maximumEstimatedCostUsd }, profile);
    expect(result.status).toBe('pause');
    expect(result.reasons).toContain('budget threshold reached — budget-paused until policy adjustment');
  });

  it('pauses on repeated no-progress turns and on indeterminate', () => {
    expect(evaluateRunControls({ ...base, noProgressTurns: 2 }, profile).status).toBe('pause');
    expect(evaluateRunControls({ ...base, indeterminate: true }, profile).status).toBe('pause');
  });

  it('stops on a scope violation', () => {
    const result = evaluateRunControls({ ...base, scopeViolation: true }, profile);
    expect(result.status).toBe('stop');
    expect(result.reasons).toContain('scope violation attempted');
  });
});

describe('WFO-E2E-002A invocation evidence', () => {
  it('records hashes, tokens, and a redacted transcript flag', () => {
    const evidence = recordInvocation({
      invocationId: 'inv-1',
      workflowId: 'wf-1',
      taskId: 't-1',
      role: 'planner',
      providerId: 'opencode-go',
      modelId: 'deepseek-v4-flash',
      promptTemplateVersion: 'pt-1',
      context: 'Objective: add health endpoint\nAPI key: sk-abcdefghijklmnopqrstuvwxyz1234',
      response: '{"summary":"plan"}',
      inputTokens: 120,
      outputTokens: 80,
      estimatedCostUsd: 0.05,
      durationMs: 900,
      toolCalls: [{ name: 'filesystem.read', inputHash: 'h', outcome: 'completed', approved: true }],
      producedArtifactIds: ['art-1'],
      startedAt: '2026-08-06T00:00:00.000Z',
      completedAt: '2026-08-06T00:00:01.000Z',
    });
    expect(evidence.contextHash).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.responseHash).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.inputTokens).toBe(120);
    expect(evidence.estimatedCostUsd).toBe(0.05);
    expect(evidence.transcriptRedacted).toBe(true);
    expect(JSON.stringify(evidence)).not.toContain('sk-abcdefghijklmnopqrstuvwxyz1234');
  });

  it('redacts credentials from transcripts', () => {
    const redacted = redactTranscript(
      'Authorization: Bearer abcdef123456 and ghp_abcdefghijklmnopqrstuvwxyz1234567890',
    );
    expect(redacted).not.toContain('abcdef123456');
    expect(redacted).toContain('[REDACTED]');
  });
});

describe('WFO-E2E-002A structured plan schema', () => {
  it('accepts a valid generated plan', () => {
    const plan = {
      summary: 'Add health endpoint',
      assumptions: [],
      steps: [
        {
          id: 's1',
          description: 'Add route',
          assignedRole: 'engineer',
          dependencies: [],
          expectedArtifacts: ['route'],
          verificationRequirements: ['tests'],
        },
      ],
      affectedPaths: ['src'],
      outOfScope: ['infra'],
      requiredApprovals: [],
      risks: [],
      completionCriteria: ['tests pass'],
    };
    expect(validateAgentGeneratedPlan(plan).valid).toBe(true);
  });

  it('rejects a plan without steps', () => {
    const result = validateAgentGeneratedPlan({ summary: 'no steps', steps: [] });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('steps must be a non-empty array');
  });
});
