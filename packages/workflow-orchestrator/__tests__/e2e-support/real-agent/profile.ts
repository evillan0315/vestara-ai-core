/**
 * WFO-E2E-002 real-agent run profiles.
 *
 * Framework defaults select no provider and no model — those are repository
 * experiment choices, not architectural defaults. Named presets pin a provider
 * + model + credential env var. The credential VALUE is never stored in a
 * profile; only the env var name the adapter resolves at invocation time.
 */

export type RealAgentProviderId = 'opencode-go' | 'opencode' | 'none';

export type RealAgentRole = 'planner' | 'engineer' | 'reviewer' | 'verifier';

export interface RealAgentE2EProfile {
  readonly profileId: string;
  readonly providerId: RealAgentProviderId;
  readonly modelId: string;
  /** Env var holding the API key (never the value). Empty when no provider is selected. */
  readonly credentialEnvVar: string;
  readonly plannerModelId?: string;
  readonly reviewerModelId?: string;
  readonly verifierModelId?: string;

  readonly maximumModelCalls: number;
  readonly maximumInputTokens: number;
  readonly maximumOutputTokens: number;
  readonly maximumEstimatedCostUsd: number;
  readonly maximumDurationMs: number;

  readonly maximumPlanningTurns: number;
  readonly maximumExecutionTurns: number;
  readonly maximumRepairCycles: number;

  readonly requireHumanPlanApproval: boolean;
  readonly requireHumanProtectedActionApproval: boolean;
  readonly allowNetworkAccess: boolean;
  /** Real-agent runs are advisory until qualified — they never mutate authority. */
  readonly advisory: boolean;
}

export interface RealAgentE2EProfileOverrides extends Partial<RealAgentE2EProfile> {}

/** Framework defaults: no provider, no model, safe limits, advisory mode. */
export const REAL_AGENT_FRAMEWORK_DEFAULTS: RealAgentE2EProfile = {
  profileId: 'framework-default',
  providerId: 'none',
  modelId: 'none',
  credentialEnvVar: '',
  maximumModelCalls: 40,
  maximumInputTokens: 60_000,
  maximumOutputTokens: 20_000,
  maximumEstimatedCostUsd: 2,
  maximumDurationMs: 10 * 60 * 1_000,
  maximumPlanningTurns: 2,
  maximumExecutionTurns: 6,
  maximumRepairCycles: 2,
  requireHumanPlanApproval: true,
  requireHumanProtectedActionApproval: true,
  allowNetworkAccess: false,
  advisory: true,
};

function preset(
  profileId: string,
  providerId: Exclude<RealAgentProviderId, 'none'>,
  modelId: string,
  credentialEnvVar: string,
): RealAgentE2EProfile {
  return { ...REAL_AGENT_FRAMEWORK_DEFAULTS, profileId, providerId, modelId, credentialEnvVar };
}

/** Repository experiment profiles — explicit provider + model choices, not policy. */
export const REAL_AGENT_PROFILE_PRESETS: Readonly<Record<string, RealAgentE2EProfile>> = {
  deepseekV4FlashOpenCodeGo: preset(
    'opencode-go-deepseek-v4-flash',
    'opencode-go',
    'deepseek-v4-flash',
    'OPENCODE_GO_API_KEY',
  ),
  mimoV25OpenCodeGo: preset('opencode-go-mimo-v2.5', 'opencode-go', 'mimo-v2.5', 'OPENCODE_GO_API_KEY'),
  deepseekV4FlashOpenCodeFree: preset(
    'opencode-free-deepseek-v4-flash',
    'opencode',
    'deepseek-v4-flash-free',
    'OPENCODE_API_KEY',
  ),
  mimoV25OpenCodeFree: preset('opencode-free-mimo-v2.5', 'opencode', 'mimo-v2.5-free', 'OPENCODE_API_KEY'),
};

export type RealAgentProfilePresetId = keyof typeof REAL_AGENT_PROFILE_PRESETS;

export function resolveRealAgentProfile(
  profileId: RealAgentProfilePresetId | 'framework-default',
  overrides: RealAgentE2EProfileOverrides = {},
): RealAgentE2EProfile {
  const base = REAL_AGENT_PROFILE_PRESETS[profileId] ?? REAL_AGENT_FRAMEWORK_DEFAULTS;
  return { ...base, ...overrides };
}
