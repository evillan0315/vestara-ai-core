/**
 * @vestara/understanding — WorkspaceUnderstanding
 *
 * An immutable semantic snapshot of the workspace.
 * Derived solely from WorkspaceObservation — never from
 * ad-hoc queries or AI inference.
 *
 * Every conclusion has a provenance: the observation field
 * it was derived from.
 *
 * Invariants:
 *   1. All fields are readonly — Understanding is a snapshot.
 *   2. Every value traces to one or more observation signals.
 *   3. No field is populated by AI. (AI may enrich a separate
 *      `narrative` field, but the structured understanding
 *      must be deterministic.)
 */

// ─── Identity ────────────────────────────────────────────────

export interface IdentityUnderstanding {
  readonly name: string;
  readonly primaryLanguage: string;
  readonly languageConfidence: number;
  readonly framework: string | null;
  readonly packageManager: string | null;
  readonly buildTool: string | null;
  readonly testFramework: string | null;
}

// ─── Architecture ────────────────────────────────────────────

export type ArchitectureKind = 'monorepo' | 'multi-module' | 'single-module' | 'unknown';

export interface ArchitectureUnderstanding {
  readonly kind: ArchitectureKind;
  readonly layers: readonly {
    readonly packageName: string;
    readonly layer: string;
    readonly confidence: number;
  }[];
  readonly dependencyCycles: readonly string[][];
  readonly entryPoints: readonly {
    readonly path: string;
    readonly role: string;
    readonly confidence: number;
  }[];
}

// ─── Maturity ────────────────────────────────────────────────

export type MaturityLevel = 'early' | 'developing' | 'established' | 'mature';

export interface MaturityUnderstanding {
  readonly level: MaturityLevel;
  readonly healthScore: number;
  readonly testCoverage: string;
  readonly documentationLevel: string;
  readonly codeQuality: string;
  readonly risks: readonly {
    readonly category: string;
    readonly severity: string;
    readonly summary: string;
    readonly observationSource: string;
  }[];
}

// ─── Activity ────────────────────────────────────────────────

export interface RecentChange {
  readonly description: string;
  readonly author: string;
  readonly timestamp: string;
}

export interface ActivityUnderstanding {
  readonly currentMilestone: string | null;
  readonly recentChanges: readonly RecentChange[];
  readonly activeBranches: readonly string[];
  readonly uncommittedWork: boolean;
  readonly stalledSince: string | null;
}

// ─── Decisions ───────────────────────────────────────────────

export interface DecisionRecord {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly timestamp: string;
}

export interface MemoryUnderstanding {
  readonly recentDecisions: readonly DecisionRecord[];
  readonly keyFacts: readonly string[];
  readonly memoryCount: number;
}

// ─── State ───────────────────────────────────────────────────

export interface StateUnderstanding {
  readonly status: string;
  readonly isIndexed: boolean;
  readonly indexFreshness: 'fresh' | 'stale' | 'missing';
  readonly isCached: boolean;
}

// ─── Root Model ─────────────────────────────────────────────

export interface WorkspaceUnderstanding {
  readonly id: string;
  readonly generatedAt: string;
  readonly fromObservationTimestamp: string;

  readonly identity: IdentityUnderstanding;
  readonly architecture: ArchitectureUnderstanding;
  readonly maturity: MaturityUnderstanding;
  readonly activity: ActivityUnderstanding;
  readonly memory: MemoryUnderstanding;
  readonly state: StateUnderstanding;

  /**
   * Deterministic narrative — derived entirely from
   * understanding fields above. AI-free.
   */
  readonly summary: string;
}
