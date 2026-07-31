/**
 * @vestara/engineering-graph
 *
 * The canonical relationship engine for the Workspace. Every module consumes
 * this package for entity identity, relationships, backlinks, search,
 * traceability, impact analysis, insights, and health. No module owns
 * relationship logic anymore.
 */

export type {
  GraphDiff,
  GraphEvent,
  GraphEventType,
  GraphQuery,
  GraphQueryResult,
  GraphSnapshot,
  GraphState,
} from './events';

export {
  applyEvent,
  diffStates,
  EngineeringEventStore,
  executeGraphQuery,
} from './events';
export {
  EngineeringGraph,
  kindOf,
} from './graph';

export type { EntityKind, ParsedEntityId } from './ids';
export {
  ENTITY_KINDS,
  encodeEntityId,
  entityId,
  idOf,
  isEntityKind,
  isValidEntityId,
  parseEntityId,
} from './ids';
export type { RegistryHydrationResult } from './registry';
export { EntityRegistry } from './registry';
export type {
  EntitySource,
  GraphEntity,
  GraphHealth,
  GraphInsight,
  GraphRelationship,
  GraphStats,
  RelationshipDirection,
  RelationshipDirectionValue,
  RelationshipSource,
  RelationshipType,
  SearchOptions,
  SearchResult,
} from './types';
export {
  isRelationshipType,
  RELATIONSHIP_TYPES,
} from './types';
