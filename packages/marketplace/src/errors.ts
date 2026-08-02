export const MARKETPLACE_ERROR_CODES = {
  NOT_FOUND: 'marketplace.not-found',
  INVALID_REFERENCE: 'marketplace.invalid-reference',
  REGISTRY_FAILED: 'marketplace.registry-failed',
  INVALID_PACKAGE: 'marketplace.invalid-package',
  INCOMPATIBLE: 'marketplace.incompatible',
  MISSING_DEPENDENCY: 'marketplace.missing-dependency',
  DEPENDENCY_CONFLICT: 'marketplace.dependency-conflict',
  DEPENDENCY_CYCLE: 'marketplace.dependency-cycle',
  RESOLUTION_FAILED: 'marketplace.resolution-failed',
  INSTALL_FAILED: 'marketplace.install-failed',
  UPDATE_FAILED: 'marketplace.update-failed',
  UNINSTALL_FAILED: 'marketplace.uninstall-failed',
  APPROVAL_REQUIRED: 'marketplace.approval-required',
} as const;

export type MarketplaceErrorCode = (typeof MARKETPLACE_ERROR_CODES)[keyof typeof MARKETPLACE_ERROR_CODES];

export class MarketplaceError extends Error {
  readonly code: MarketplaceErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(code: MarketplaceErrorCode, message: string, details?: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = 'MarketplaceError';
    this.code = code;
    this.details = details;
  }
}

export class MarketplaceNotFoundError extends MarketplaceError {
  constructor(reference: string, details?: Readonly<Record<string, unknown>>) {
    super(MARKETPLACE_ERROR_CODES.NOT_FOUND, `Marketplace asset not found: ${reference}`, details);
    this.name = 'MarketplaceNotFoundError';
  }
}

export class MarketplaceRegistryError extends MarketplaceError {
  constructor(registryId: string, message: string, details?: Readonly<Record<string, unknown>>) {
    super(MARKETPLACE_ERROR_CODES.REGISTRY_FAILED, `Registry ${registryId} failed: ${message}`, {
      registryId,
      ...details,
    });
    this.name = 'MarketplaceRegistryError';
  }
}

export class MarketplaceCompatibilityError extends MarketplaceError {
  constructor(packageName: string, version: string | undefined, reason: string) {
    super(
      MARKETPLACE_ERROR_CODES.INCOMPATIBLE,
      `Package ${packageName}${version ? `@${version}` : ''} is incompatible: ${reason}`,
      { packageName, version },
    );
    this.name = 'MarketplaceCompatibilityError';
  }
}

export class MarketplaceResolutionError extends MarketplaceError {
  readonly missingDependencies: readonly string[];
  readonly conflictingRequirements: readonly VersionConflict[];
  readonly cycle?: readonly string[];
  readonly incompatible: readonly string[];

  constructor(
    message: string,
    details: {
      readonly missingDependencies?: readonly string[];
      readonly conflictingRequirements?: readonly VersionConflict[];
      readonly cycle?: readonly string[];
      readonly incompatible?: readonly string[];
    } = {},
  ) {
    super(MARKETPLACE_ERROR_CODES.RESOLUTION_FAILED, message, { ...details });
    this.name = 'MarketplaceResolutionError';
    this.missingDependencies = details.missingDependencies ?? [];
    this.conflictingRequirements = details.conflictingRequirements ?? [];
    this.cycle = details.cycle;
    this.incompatible = details.incompatible ?? [];
  }
}

export interface VersionConflict {
  readonly packageName: string;
  readonly requiredBy: readonly string[];
  readonly requirements: readonly string[];
}

export class MarketplaceInstallError extends MarketplaceError {
  constructor(packageName: string, version: string | undefined, message: string) {
    super(
      MARKETPLACE_ERROR_CODES.INSTALL_FAILED,
      `Failed to install ${packageName}${version ? `@${version}` : ''}: ${message}`,
      {
        packageName,
        version,
      },
    );
    this.name = 'MarketplaceInstallError';
  }
}

export class MarketplaceApprovalRequiredError extends MarketplaceError {
  readonly pendingPermissions: readonly string[];

  constructor(packageName: string, pendingPermissions: readonly string[]) {
    super(
      MARKETPLACE_ERROR_CODES.APPROVAL_REQUIRED,
      `Install of ${packageName} requires approval for ${pendingPermissions.length} permission(s); re-run with --yes or confirm interactively`,
      { packageName, pendingPermissions },
    );
    this.name = 'MarketplaceApprovalRequiredError';
    this.pendingPermissions = pendingPermissions;
  }
}

/** Helpers that keep error output secret-safe: never include manifest content. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
