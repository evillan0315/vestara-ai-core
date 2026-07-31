/**
 * Engineering graph core types: entities, relationships, sources, and
 * derived artifacts (stats, insights, health).
 */

import type { EntityKind } from './ids';

export const RELATIONSHIP_TYPES = [
  'implements',
  'references',
  'contains',
  'depends-on',
  'creates',
  'updates',
  'deletes',
  'reviews',
  'tests',
  'verifies',
  'approves',
  'owns',
  'executes',
  'observes',
  'diagnoses',
  'documents',
  'links-to',
  'imports',
  'exports',
  'calls',
  'publishes',
  'subscribes',
  'belongs-to',
  'generated-by',
  'uses-capability',
  'touches-file',
  'produced-artifact',
  'caused',
  'triggered',
  'resolved',
  'related',
  'describes',
  'verified-by',
  'governed-by',
  'supersedes',
  'generated-from',
  'owned-by',
  'requires',
  'violates',
  'aligned-with',
] as const;

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export function isRelationshipType(value: string): value is RelationshipType {
  return (RELATIONSHIP_TYPES as readonly string[]).includes(value);
}

/** A node in the engineering graph. */
export interface GraphEntity {
  id: string;
  kind: EntityKind;
  label: string;
  status?: string;
  owner?: string;
  tags?: string[];
  description?: string;
  updatedAt?: string;
  meta?: Record<string, unknown>;
}

/** A directed edge between two entities. */
export interface GraphRelationship {
  /** Stable id; derived from from/to/type when omitted. */
  id?: string;
  from: string;
  to: string;
  type: RelationshipType;
  label?: string;
  weight?: number;
  timestamp?: string;
}

export interface RelationshipDirection {
  direction?: 'out' | 'in' | 'both';
  type?: RelationshipType | 'any';
  limit?: number;
}

export interface SearchOptions {
  kind?: EntityKind | 'any';
  limit?: number;
  fields?: Array<'label' | 'id' | 'tags' | 'description' | 'status' | 'owner' | 'meta'>;
}

export interface SearchResult {
  entity: GraphEntity;
  score: number;
}

export interface GraphStats {
  nodes: number;
  edges: number;
  kinds: Record<string, number>;
  relationshipTypes: Record<string, number>;
}

export interface GraphInsight {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  entityId?: string;
}

export interface GraphHealth {
  coverage: number;
  orphaned: number;
  relationshipIntegrity: number;
  docsCoverage: number;
  verificationCoverage: number;
  dependencyHealth: number;
  checks: Array<{ id: string; name: string; status: 'pass' | 'warn' | 'fail'; detail: string }>;
}

/** A source that contributes entities to the graph. */
export interface EntitySource {
  kind: EntityKind;
  /** Lower runs first; used to seed repository/workspace before leaves. */
  priority?: number;
  collect(): GraphEntity[] | Promise<GraphEntity[]>;
}

/** A source that contributes relationships between already-registered entities. */
export interface RelationshipSource {
  collect(): GraphRelationship[] | Promise<GraphRelationship[]>;
}

export type RelationshipDirectionValue = NonNullable<RelationshipDirection['direction']>;
