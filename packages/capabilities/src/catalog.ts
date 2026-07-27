import type { CapabilityHierarchy } from './hierarchy';
import { DefaultCapabilityHierarchy } from './hierarchy';
import type { CapabilityDefinition, CapabilityRelationships } from './model';
import { EMPTY_RELATIONSHIPS } from './model';

export interface ValidationResult {
  id: string;
  valid: boolean;
  errors: string[];
}

export interface CapabilityCatalog {
  register(def: CapabilityDefinition): void;

  registerRelationships(id: string, rel: Partial<CapabilityRelationships>): void;

  find(id: string): CapabilityDefinition | undefined;

  search(query: string): CapabilityDefinition[];

  list(): CapabilityDefinition[];

  exists(id: string): boolean;

  validate(ids: string[]): ValidationResult[];

  getRelationships(id: string): CapabilityRelationships;

  getHierarchy(): CapabilityHierarchy;

  findChildren(parentId: string): CapabilityDefinition[];

  findDescendants(parentId: string): CapabilityDefinition[];
}

export class DefaultCapabilityCatalog implements CapabilityCatalog {
  private definitions: Map<string, CapabilityDefinition> = new Map();
  private relationships: Map<string, CapabilityRelationships> = new Map();
  private hierarchy: CapabilityHierarchy | null = null;

  register(def: CapabilityDefinition): void {
    this.definitions.set(def.id, def);
    this.hierarchy = null;
  }

  registerRelationships(id: string, rel: Partial<CapabilityRelationships>): void {
    const existing = this.relationships.get(id) ?? { ...EMPTY_RELATIONSHIPS };
    this.relationships.set(id, {
      requires: rel.requires ?? existing.requires,
      mayProduce: rel.mayProduce ?? existing.mayProduce,
      verifies: rel.verifies ?? existing.verifies,
      conflicts: rel.conflicts ?? existing.conflicts,
      implies: rel.implies ?? existing.implies,
    });
  }

  find(id: string): CapabilityDefinition | undefined {
    return this.definitions.get(id);
  }

  search(query: string): CapabilityDefinition[] {
    const lower = query.toLowerCase();
    return [...this.definitions.values()].filter(
      (d) =>
        d.id.toLowerCase().includes(lower) ||
        d.name.toLowerCase().includes(lower) ||
        d.category.toLowerCase().includes(lower) ||
        d.description.toLowerCase().includes(lower),
    );
  }

  list(): CapabilityDefinition[] {
    return [...this.definitions.values()];
  }

  exists(id: string): boolean {
    return this.definitions.has(id);
  }

  validate(ids: string[]): ValidationResult[] {
    return ids.map((id) => {
      const def = this.definitions.get(id);
      if (!def) return { id, valid: false, errors: [`Capability "${id}" is not registered`] };
      const errors: string[] = [];
      const rels = this.relationships.get(id);
      if (rels) {
        for (const req of rels.requires) {
          if (!this.definitions.has(req)) {
            errors.push(`Required capability "${req}" is not registered`);
          }
        }
      }
      return { id, valid: errors.length === 0, errors };
    });
  }

  getRelationships(id: string): CapabilityRelationships {
    return this.relationships.get(id) ?? { ...EMPTY_RELATIONSHIPS };
  }

  getHierarchy(): CapabilityHierarchy {
    if (!this.hierarchy) {
      this.hierarchy = new DefaultCapabilityHierarchy([...this.definitions.values()]);
    }
    return this.hierarchy;
  }

  findChildren(parentId: string): CapabilityDefinition[] {
    const h = this.getHierarchy();
    return h
      .getChildren(parentId)
      .filter((n) => n.capability)
      .map((n) => n.capability!);
  }

  findDescendants(parentId: string): CapabilityDefinition[] {
    const h = this.getHierarchy();
    const ids = h.getDescendants(parentId);
    return ids.map((id) => this.definitions.get(id)).filter((d): d is CapabilityDefinition => d !== undefined);
  }
}
