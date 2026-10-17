import { z } from 'zod';

export const BootStepSchema = z.object({
  id: z.string(),
  label: z.string(),
  detail: z.string(),
  durationMs: z.number().optional(),
});

export type BootStep = z.infer<typeof BootStepSchema>;

export const BootPhaseSchema = z.enum(['hash', 'title', 'glow', 'logging', 'ready', 'desktop']);
export type BootPhase = z.infer<typeof BootPhaseSchema>;

export const BootSteps: BootStep[] = [
  { id: 'root', label: 'Mounting Immutable Root (A/B)', detail: 'Slot A • verity=enabled • ro', durationMs: 400 },
  { id: 'kernel', label: 'Loading Kernel', detail: 'vestara-kernel 6.8.1-hardened • sealed', durationMs: 350 },
  { id: 'ext', label: 'Initializing Extension Runtime', detail: 'sandbox • wasm • 0 extensions', durationMs: 300 },
  {
    id: 'ai',
    label: 'Starting AI Core (Provider-agnostic)',
    detail: 'local inference • no telemetry',
    durationMs: 500,
  },
  { id: 'workspace', label: 'Connecting Workspace', detail: 'encrypted vault • /workspace', durationMs: 400 },
];

export const VerifiedHash = 'a3f9c2e71b4d8f06a9c1e5b2d7f0a4c8e9b3d2f1a6c0e8b7d5f3a2c9e1b0d4f6a8';
