import type { DocumentationRequirement } from './domain.js';

export const DEFAULT_DOCUMENTATION_REQUIREMENTS: readonly DocumentationRequirement[] = [
  {
    id: 'package-public-runtime',
    appliesTo: { entityKinds: ['package'], packagePrivate: false },
    requiredKinds: ['readme', 'architecture', 'testing', 'api'],
    optionalKinds: ['operations', 'migration', 'troubleshooting'],
    requiredSections: ['Overview', 'Lifecycle', 'Failure behavior', 'Health behavior', 'Verification'],
    requiredFrontmatter: ['owner'],
    validationRules: ['required-sections', 'implementation-reference', 'public-api-coverage'],
    severity: 'error',
  },
  {
    id: 'package-private',
    appliesTo: { entityKinds: ['package'], packagePrivate: true },
    requiredKinds: ['readme'],
    optionalKinds: ['architecture', 'testing', 'api'],
    requiredSections: ['Overview'],
    requiredFrontmatter: [],
    validationRules: ['required-sections'],
    severity: 'warning',
  },
  {
    id: 'accepted-adr',
    appliesTo: { entityKinds: ['adr'], authorities: ['architecture'] },
    requiredKinds: ['adr'],
    optionalKinds: [],
    requiredSections: ['Context', 'Decision', 'Consequences', 'Alternatives Considered', 'Implementation Notes'],
    requiredFrontmatter: ['id', 'status', 'version'],
    validationRules: ['required-frontmatter', 'required-sections', 'implementation-reference', 'unique-adr-id'],
    severity: 'error',
  },
];

export class DocumentationRequirementRegistry {
  private readonly requirements = new Map<string, DocumentationRequirement>();

  constructor(requirements: readonly DocumentationRequirement[] = DEFAULT_DOCUMENTATION_REQUIREMENTS) {
    for (const requirement of requirements) this.register(requirement);
  }

  register(requirement: DocumentationRequirement): void {
    this.requirements.set(requirement.id, requirement);
  }

  all(): readonly DocumentationRequirement[] {
    return [...this.requirements.values()];
  }

  get(id: string): DocumentationRequirement | undefined {
    return this.requirements.get(id);
  }
}
