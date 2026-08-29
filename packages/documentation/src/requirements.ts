import type { DocumentationEntity, DocumentationRequirement } from './domain.js';

export const PUBLIC_PACKAGE_README_SECTIONS = [
  'Overview',
  'Responsibilities',
  'Architecture',
  'Public API',
  'Lifecycle',
  'Failure behavior',
  'Health behavior',
  'Security and permissions',
  'Usage',
  'Testing',
  'Verification',
  'Dependencies',
  'Ownership',
  'Related ADRs',
  'Related documentation',
] as const;

export const PUBLIC_PACKAGE_README_FRONTMATTER = [
  'id',
  'kind',
  'authority',
  'status',
  'owner',
  'version',
  'last-reviewed',
  'next-review',
  'implementation-ref',
  'verification-status',
] as const;

export const DEFAULT_DOCUMENTATION_REQUIREMENTS: readonly DocumentationRequirement[] = [
  {
    id: 'package-public-runtime',
    appliesTo: { entityKinds: ['package'], packagePrivate: false },
    requiredKinds: ['readme', 'architecture', 'testing', 'api'],
    optionalKinds: ['operations', 'migration', 'troubleshooting'],
    requiredSections: PUBLIC_PACKAGE_README_SECTIONS,
    requiredFrontmatter: PUBLIC_PACKAGE_README_FRONTMATTER,
    validationRules: ['required-frontmatter', 'required-sections', 'implementation-reference', 'public-api-coverage'],
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

  forPackage(packagePrivate: boolean): DocumentationRequirement {
    const requirement = this.get(packagePrivate ? 'package-private' : 'package-public-runtime');
    if (!requirement) throw new Error(`No documentation requirement registered for packagePrivate=${packagePrivate}`);
    return requirement;
  }
}

export interface DocumentationRequirementViolation {
  readonly field: string;
  readonly message: string;
  readonly ruleId: 'package-readme-required-frontmatter' | 'package-readme-required-section';
}

export function validatePackageReadmeRequirement(
  document: DocumentationEntity,
  requirement: DocumentationRequirement,
): readonly DocumentationRequirementViolation[] {
  const violations: DocumentationRequirementViolation[] = [];
  const headings = new Set(document.parsed.headings.map((heading) => heading.trim().toLowerCase()));
  for (const field of requirement.requiredFrontmatter) {
    if (document.parsed.frontmatter[field] !== undefined) continue;
    violations.push({
      field,
      ruleId: 'package-readme-required-frontmatter',
      message: `README is missing required frontmatter: ${field}`,
    });
  }
  for (const section of requirement.requiredSections) {
    if (headings.has(section.toLowerCase())) continue;
    violations.push({
      field: section,
      ruleId: 'package-readme-required-section',
      message: `README is missing required section: ${section}`,
    });
  }
  return violations;
}
