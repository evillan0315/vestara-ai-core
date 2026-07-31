/**
 * EntityRegistry — collects entities and relationships from pluggable
 * sources and hydrates a shared EngineeringGraph.
 *
 * Each module registers an EntitySource (nodes) and a RelationshipSource
 * (edges). The registry owns hydration; no module owns relationships.
 */

import { EngineeringGraph } from './graph';
import type { EntityKind } from './ids';
import type {
  EntitySource,
  GraphEntity,
  GraphRelationship,
  GraphStats,
  RelationshipSource,
  SearchOptions,
  SearchResult,
} from './types';

export interface RegistryHydrationResult {
  entities: number;
  relationships: number;
  elapsedMs: number;
}

export class EntityRegistry {
  private entitySources: EntitySource[] = [];
  private relationshipSources: RelationshipSource[] = [];

  constructor(readonly graph: EngineeringGraph = new EngineeringGraph()) {}

  registerEntitySource(source: EntitySource): void {
    this.entitySources.push(source);
  }

  registerRelationshipSource(source: RelationshipSource): void {
    this.relationshipSources.push(source);
  }

  getEntity(id: string): GraphEntity | null {
    return this.graph.getEntity(id);
  }

  allEntities(): GraphEntity[] {
    return this.graph.allEntities();
  }

  entitiesByKind(kind: EntityKind): GraphEntity[] {
    return this.graph.entitiesByKind(kind);
  }

  search(query: string, opts?: SearchOptions): SearchResult[] {
    return this.graph.search(query, opts);
  }

  stats(): GraphStats {
    return this.graph.stats();
  }

  /** Rebuild the graph from all registered sources. */
  async refresh(): Promise<RegistryHydrationResult> {
    const started = Date.now();
    this.graph.clear();

    const ordered = [...this.entitySources].sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));
    const batches = await Promise.all(
      ordered.map((s) => Promise.resolve(s.collect()).catch(() => [] as GraphEntity[])),
    );
    let entities = 0;
    for (const batch of batches) {
      for (const e of batch) {
        if (this.graph.addEntity(e)) entities += 1;
      }
    }

    const relBatches = await Promise.all(
      this.relationshipSources.map((s) => Promise.resolve(s.collect()).catch(() => [] as GraphRelationship[])),
    );
    let relationships = 0;
    for (const batch of relBatches) {
      for (const r of batch) {
        // Drop edges referencing entities that were not registered.
        if (!this.graph.hasEntity(r.from) || !this.graph.hasEntity(r.to)) continue;
        if (this.graph.addRelationship(r)) relationships += 1;
      }
    }

    return { entities, relationships, elapsedMs: Date.now() - started };
  }
}
