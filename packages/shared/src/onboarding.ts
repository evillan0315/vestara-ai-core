// ─── Onboarding State ────────────────────────────────────────

export type OnboardingStage =
  | 'boot'
  | 'greeting'
  | 'profile_name'
  | 'profile_role'
  | 'profile_complete'
  | 'workspace_transition'
  | 'ready';

import type { ConversationSession, UserProfile } from './conversation-types.js';

export interface OnboardingState {
  stage: OnboardingStage;
  isFirstBoot: boolean;
  profile: UserProfile | null;
  session: ConversationSession | null;
}

// ─── Lifecycle ───────────────────────────────────────────────

export interface LifecycleEvent {
  componentType: 'service' | 'agent' | 'plugin' | 'provider' | 'tool' | 'mission';
  componentId: string;
  componentName: string;
  previousState: string;
  newState: string;
  transition: string;
  duration: number;
  error?: string;
  timestamp: string;
}
