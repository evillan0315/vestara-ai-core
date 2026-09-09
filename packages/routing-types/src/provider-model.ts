/**
 * Canonical provider and model identity contracts.
 *
 * These are runtime-neutral identifiers for AI providers and models.
 * They do NOT encode OpenCode-specific concepts.
 *
 * Branded types prevent accidental string substitution.
 */

/** Branded provider identity. */
export type ProviderId = string & { readonly __brand: 'ProviderId' };

/** Branded model identity. */
export type ModelId = string & { readonly __brand: 'ModelId' };

/** Reference to a specific provider and model combination. */
export interface ProviderModelRef {
  readonly providerId: ProviderId;
  readonly modelId: ModelId;
  readonly modelRevision?: string;
}

/**
 * Create a ProviderId with brand protection.
 * @throws never — pure construction
 */
export function providerId(id: string): ProviderId {
  return id as ProviderId;
}

/**
 * Create a ModelId with brand protection.
 * @throws never — pure construction
 */
export function modelId(id: string): ModelId {
  return id as ModelId;
}
