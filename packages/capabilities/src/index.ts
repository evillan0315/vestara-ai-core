export type {
  CapabilityCatalog,
  ValidationResult,
} from './catalog';
export { DefaultCapabilityCatalog } from './catalog';

export type {
  CapabilityHierarchy,
  CapabilityTreeNode,
} from './hierarchy';
export {
  buildCapabilityTree,
  DefaultCapabilityHierarchy,
} from './hierarchy';
export type {
  CapabilityDefinition,
  CapabilityMatcher,
  CapabilityMatchResult,
  CapabilityProfile,
  CapabilityRelationships,
  CapabilityStability,
} from './model';
export {
  createCapabilityProfile,
  DefaultCapabilityMatcher,
  EMPTY_RELATIONSHIPS,
} from './model';
export type {
  CapabilityResolver,
  MissingCapability,
  ResolutionExplanation,
  ResolutionResult,
  ResolvedCapability,
} from './resolver';
export { DefaultCapabilityResolver } from './resolver';
export type { TaxonomyEntry } from './taxonomy';
export {
  BUILTIN_TAXONOMY,
  getBuiltinDefinitions,
  getBuiltinRelationships,
  isBuiltinCapability,
} from './taxonomy';
