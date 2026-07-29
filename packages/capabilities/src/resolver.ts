import type { CapabilityCatalog } from './catalog';
import type { CapabilityMatcher } from './model';
import { DefaultCapabilityMatcher } from './model';

export interface ResolvedCapability {
  id: string;
  status: 'direct' | 'implied' | 'expanded-wildcard';
  source?: string;
}

export interface MissingCapability {
  id: string;
  reason: string;
  suggestions: string[];
}

export interface ResolutionResult {
  satisfied: boolean;
  resolved: ResolvedCapability[];
  missing: MissingCapability[];
  score: number;
}

export interface ResolutionExplanation {
  required: string[];
  provided: string[];
  expandedProvided: string[];
  satisfied: ResolvedCapability[];
  missing: MissingCapability[];
  summary: string;
}

export interface CapabilityResolver {
  resolve(required: string[], provided: string[]): ResolutionResult;

  expand(capabilities: string[]): string[];

  satisfies(required: string, provided: string): boolean;

  missing(required: string[], provided: string[]): string[];

  explain(required: string[], provided: string[]): ResolutionExplanation;
}

export class DefaultCapabilityResolver implements CapabilityResolver {
  private catalog: CapabilityCatalog;
  private matcher: CapabilityMatcher;

  constructor(catalog: CapabilityCatalog, matcher?: CapabilityMatcher) {
    this.catalog = catalog;
    this.matcher = matcher ?? new DefaultCapabilityMatcher();
  }

  resolve(required: string[], provided: string[]): ResolutionResult {
    const expandedRequired = this.expand(required);
    const expandedProvided = this.expand(provided);

    const resolved: ResolvedCapability[] = [];
    const missing: MissingCapability[] = [];

    for (const req of expandedRequired) {
      const directMatch = provided.some((p) => this.matcher.compatible(req, p));
      if (directMatch) {
        const source = provided.find((p) => this.matcher.compatible(req, p));
        resolved.push({
          id: req,
          status: source === req ? 'direct' : 'expanded-wildcard',
          source,
        });
        continue;
      }

      const expandedMatch = expandedProvided.some((p) => this.matcher.compatible(req, p));
      if (expandedMatch) {
        resolved.push({
          id: req,
          status: 'expanded-wildcard',
          source: expandedProvided.find((p) => this.matcher.compatible(req, p)),
        });
        continue;
      }

      const implied = this.resolveThroughImplications(req, expandedProvided);
      if (implied) {
        resolved.push({ id: req, status: 'implied', source: implied });
        continue;
      }

      const suggestions = this.findSuggestions(req);
      missing.push({
        id: req,
        reason: `Worker does not advertise "${req}"`,
        suggestions,
      });
    }

    const total = expandedRequired.length;
    const score = total > 0 ? resolved.length / total : 1;

    return {
      satisfied: missing.length === 0,
      resolved,
      missing,
      score,
    };
  }

  expand(capabilities: string[]): string[] {
    const result = new Set<string>();

    for (const cap of capabilities) {
      if (cap.endsWith('.*')) {
        const prefix = cap.slice(0, -2);
        const children = this.catalog.findDescendants(prefix);
        if (children.length > 0) {
          for (const child of children) {
            result.add(child.id);
          }
        } else {
          result.add(cap);
        }
      } else {
        result.add(cap);
        const rels = this.catalog.getRelationships(cap);
        for (const implied of rels.implies) {
          result.add(implied);
        }
      }
    }

    return [...result];
  }

  satisfies(required: string, provided: string): boolean {
    const expandedProvided = this.expand([provided]);
    if (this.matcher.compatible(required, provided)) return true;
    return expandedProvided.some((p) => this.matcher.compatible(required, p));
  }

  missing(required: string[], provided: string[]): string[] {
    const result = this.resolve(required, provided);
    return result.missing.map((m) => m.id);
  }

  explain(required: string[], provided: string[]): ResolutionExplanation {
    const expandedProvided = this.expand(provided);
    const result = this.resolve(required, provided);

    let summary: string;
    if (result.satisfied) {
      const direct = result.resolved.filter((r) => r.status === 'direct').length;
      const implied = result.resolved.filter((r) => r.status === 'implied').length;
      const wildcard = result.resolved.filter((r) => r.status === 'expanded-wildcard').length;
      const parts: string[] = [];
      if (direct > 0) parts.push(`${direct} direct`);
      if (implied > 0) parts.push(`${implied} through implications`);
      if (wildcard > 0) parts.push(`${wildcard} via wildcard expansion`);
      summary = `All ${result.resolved.length} required capabilities satisfied (${parts.join(', ')})`;
    } else {
      summary = `${result.missing.length} of ${result.resolved.length + result.missing.length} required capabilities missing`;
    }

    return {
      required,
      provided,
      expandedProvided,
      satisfied: result.resolved,
      missing: result.missing,
      summary,
    };
  }

  private resolveThroughImplications(required: string, provided: string[]): string | undefined {
    for (const prov of provided) {
      const rels = this.catalog.getRelationships(prov);
      if (rels.implies.includes(required)) return prov;
      if (rels.mayProduce.includes(required)) return prov;
    }

    for (const prov of provided) {
      const rels = this.catalog.getRelationships(prov);
      for (const implied of rels.implies) {
        if (this.matcher.compatible(required, implied)) return prov;
      }
    }

    return undefined;
  }

  private findSuggestions(required: string): string[] {
    const suggestions: string[] = [];
    const parts = required.split('.');
    if (parts.length > 1) {
      const category = parts[0];
      const wildcard = `${category}.*`;
      if (this.catalog.exists(wildcard) || this.catalog.findChildren(category).length > 0) {
        suggestions.push(wildcard);
      }
    }
    const rels = this.catalog.getRelationships(required);
    if (rels.requires.length > 0) {
      for (const req of rels.requires) {
        if (!suggestions.includes(req)) suggestions.push(req);
      }
    }
    return suggestions;
  }
}
