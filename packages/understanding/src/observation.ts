/**
 * @vestara/understanding — WorkspaceObservation
 *
 * Raw, deterministic signals gathered from the workspace.
 * No interpretation, no inference, no AI synthesis.
 * Every field is a verifiable fact that can be traced to
 * a file system operation, a database query, or a git call.
 *
 * Invariant: Observation contains only facts, never conclusions.
 */

// ─── Repository Identity ─────────────────────────────────────

export interface GitState {
  readonly root: string | null;
  readonly branch: string | null;
  readonly commit: string | null;
  readonly remote: string | null;
}

export interface RepositoryIdentity {
  readonly name: string;
  readonly id: string;
  readonly canonicalPath: string;
  readonly git: GitState;
  readonly repositoryHash: string;
}

// ─── File Signals ────────────────────────────────────────────

export interface FileSignals {
  readonly totalCount: number;
  readonly totalSizeKB: number;
  readonly byExtension: Record<string, number>;
  readonly configFilesPresent: string[];
}

export interface LanguageSignal {
  readonly extension: string;
  readonly fileCount: number;
  readonly weight: number;
}

// ─── Package Signals ─────────────────────────────────────────

export interface PackageSignal {
  readonly name: string;
  readonly path: string;
  readonly dependencies: readonly string[];
  readonly devDependencies: readonly string[];
  readonly isPrivate: boolean;
}

export interface DependencySignals {
  readonly packages: readonly PackageSignal[];
  readonly totalDependencies: number;
  readonly totalDevDependencies: number;
}

// ─── Config Signals ─────────────────────────────────────────

export interface ConfigSignals {
  readonly hasPackageJson: boolean;
  readonly hasTsconfig: boolean;
  readonly hasDocker: boolean;
  readonly hasCI: boolean;
  readonly isMonorepo: boolean;
  readonly detectedPackageManager: string | null;
  readonly detectedBuildTool: string | null;
  readonly detectedTestFramework: string | null;
}

// ─── Entry Point Signals ────────────────────────────────────

export interface EntryPointSignal {
  readonly path: string;
  readonly type: string;
  readonly source: string;
}

// ─── Health Signals ─────────────────────────────────────────

export interface HealthSignals {
  readonly overall: number;
  readonly codeQuality: number;
  readonly testCoverage: number;
  readonly dependencyHealth: number;
  readonly documentation: number;
  readonly risks: readonly {
    category: string;
    severity: string;
    location: string;
    detail: string;
  }[];
}

// ─── Workspace State Signals ────────────────────────────────

export interface KnowledgeState {
  readonly documentsIndexed: number;
  readonly chunksCreated: number;
  readonly lastIndexedAt: string | null;
}

export interface MemoryState {
  readonly totalCount: number;
  readonly lastConsolidatedAt: string | null;
  readonly recentMemories: readonly {
    readonly type: string;
    readonly content: string;
    readonly importance: number;
    readonly createdAt: string;
  }[];
}

export interface PreferenceSignals {
  readonly activeProvider: string | null;
  readonly activeModel: string | null;
  readonly autoIndexEnabled: boolean;
}

export interface ConversationSignals {
  readonly totalConversations: number;
  readonly recentTopics: readonly string[];
}

// ─── Git Activity Signals ───────────────────────────────────

export interface GitActivity {
  readonly recentCommits: readonly {
    readonly message: string;
    readonly author: string;
    readonly timestamp: string;
  }[];
  readonly activeBranches: readonly string[];
  readonly uncommittedChanges: number;
  readonly filesChangedSinceOpen: readonly string[];
}

// ─── Root Model ─────────────────────────────────────────────

export interface WorkspaceObservation {
  readonly timestamp: string;

  readonly identity: RepositoryIdentity;
  readonly files: FileSignals;
  readonly languageSignals: readonly LanguageSignal[];
  readonly dependencies: DependencySignals;
  readonly config: ConfigSignals;
  readonly entryPoints: readonly EntryPointSignal[];
  readonly health: HealthSignals;
  readonly gitActivity: GitActivity;

  readonly workspace: {
    readonly status: string;
    readonly lastOpenedAt: string | null;
    readonly knowledge: KnowledgeState;
    readonly memory: MemoryState;
    readonly preferences: PreferenceSignals;
    readonly conversations: ConversationSignals;
  };
}
