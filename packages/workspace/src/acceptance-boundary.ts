/**
 * AcceptanceBoundary — the durable, authoritative acceptance contract for a
 * multi-agent workflow (post-ORB organizational invariant).
 *
 * The invariant this establishes: a workflow may transform plans and
 * implementations, but it must not silently lose, weaken, or replace the
 * acceptance obligations derived from the authorized objective. Each stage is
 * independently anchored to this boundary; an upstream participant's summary
 * never substitutes for it.
 *
 * Distinction preserved:
 *   objective → interpretation → acceptance obligations → execution → evidence
 *   → acceptance conclusion
 *
 * Plans and implementations may evolve underneath the boundary. The boundary
 * itself is append-only: obligations derived from the objective accumulate and
 * are never weakened, and material uncertainty affecting acceptance remains
 * observable (`conditional`) instead of silently collapsing into
 * organizational truth.
 */

export interface AcceptanceObligation {
  readonly id: string;
  readonly description: string;
  readonly source: 'objective' | 'interpretation';
}

export interface AcceptanceBoundary {
  readonly workflowId: string;
  /** Authorized objective — the immutable anchor, never replaced. */
  readonly objective: string;
  /** Acceptance obligations derived from the objective (append-only). */
  readonly obligations: readonly AcceptanceObligation[];
  /** Material uncertainties affecting acceptance (unresolved by default). */
  readonly materialUncertainties: readonly string[];
  /** Role that derived the current boundary state. */
  readonly derivedBy: string;
  readonly derivedAt: string;
  /** True when a material uncertainty affecting acceptance is unresolved. */
  readonly conditional: boolean;
}

export interface AcceptanceDeclaration {
  readonly obligations?: readonly string[];
  readonly uncertainties?: readonly string[];
  readonly derivedBy?: string;
}

/** Seed a boundary from the authorized objective. The objective is the anchor. */
export function seedAcceptanceBoundary(workflowId: string, objective: string): AcceptanceBoundary {
  return {
    workflowId,
    objective,
    obligations: [],
    materialUncertainties: [],
    derivedBy: 'objective',
    derivedAt: new Date().toISOString(),
    conditional: false,
  };
}

/**
 * Merge a derived declaration into the boundary. Obligations are appended and
 * never removed; unresolved material uncertainty makes the boundary
 * conditional. The objective anchor is never replaced.
 */
export function refineAcceptanceBoundary(
  boundary: AcceptanceBoundary,
  declaration: AcceptanceDeclaration,
): AcceptanceBoundary {
  const obligations: AcceptanceObligation[] = [...boundary.obligations];
  for (const [index, description] of (declaration.obligations ?? []).entries()) {
    obligations.push({
      id: `${boundary.workflowId}-ob-${obligations.length}-${index}`,
      description,
      source: 'interpretation',
    });
  }
  const materialUncertainties = [...boundary.materialUncertainties, ...(declaration.uncertainties ?? [])];
  return {
    ...boundary,
    obligations,
    materialUncertainties,
    derivedBy: declaration.derivedBy ?? boundary.derivedBy,
    derivedAt: new Date().toISOString(),
    conditional: materialUncertainties.length > 0,
  };
}

/**
 * Render the boundary as an authoritative instruction section. Every stage
 * receives this section, sourced from the workflow's boundary record — never
 * from an upstream participant's summary.
 */
export function renderAcceptanceBoundary(boundary: AcceptanceBoundary): string {
  const lines = [
    'Acceptance boundary (authoritative — do not substitute or weaken):',
    `Objective: ${boundary.objective}`,
  ];
  for (const obligation of boundary.obligations) {
    lines.push(`- Acceptance obligation: ${obligation.description}`);
  }
  if (boundary.materialUncertainties.length > 0) {
    lines.push('Material uncertainties affecting acceptance (unresolved):');
    for (const uncertainty of boundary.materialUncertainties) lines.push(`- ${uncertainty}`);
    lines.push('Acceptance status: CONDITIONAL');
  } else {
    lines.push('Acceptance status: unconditional');
  }
  return lines.join('\n');
}

/**
 * Parse a structured acceptance declaration from an agent output (the
 * interpreting stage emits this block):
 *
 *   ACCEPTANCE BOUNDARY
 *   - obligation: <observable behavioral requirement>
 *   - obligation: <...>
 *   - uncertainty: <material uncertainty affecting acceptance>
 *   END ACCEPTANCE BOUNDARY
 *
 * Declaration authority semantics (established from ORB Run 4 evidence):
 *   • a block is a declaration only if it carries at least one real (non-
 *     placeholder) obligation or uncertainty — the format template and
 *     reasoning drafts are NOT declarations;
 *   • among the well-formed declarations, the FINAL one is authoritative
 *     (the interpreting participant's closing declaration after reasoning).
 *
 * Returns undefined when no well-formed declaration exists — the boundary then
 * remains anchored to the objective alone.
 */
export function parseAcceptanceDeclaration(output: string): AcceptanceDeclaration | undefined {
  const blocks = [...output.matchAll(/ACCEPTANCE BOUNDARY\s*\n([\s\S]*?)\nEND ACCEPTANCE BOUNDARY/g)];
  if (blocks.length === 0) return undefined;
  const declarations: AcceptanceDeclaration[] = [];
  for (const match of blocks) {
    const declaration = parseDeclarationBlock(match[1]);
    if (declaration && isRealDeclaration(declaration)) declarations.push(declaration);
  }
  if (declarations.length === 0) return undefined;
  return declarations[declarations.length - 1];
}

function parseDeclarationBlock(block: string): AcceptanceDeclaration | undefined {
  const obligations: string[] = [];
  const uncertainties: string[] = [];
  for (const line of block.split('\n')) {
    const trimmed = line.trim();
    const obligation = trimmed.match(/^[-*]\s*obligation:\s*(.+)$/);
    const uncertainty = trimmed.match(/^[-*]\s*uncertainty:\s*(.+)$/);
    if (obligation) obligations.push(obligation[1].trim());
    if (uncertainty) uncertainties.push(uncertainty[1].trim());
  }
  if (obligations.length === 0 && uncertainties.length === 0) return undefined;
  return { obligations, uncertainties };
}

/** A declaration is real only if it carries content, not the format template. */
function isRealDeclaration(declaration: AcceptanceDeclaration): boolean {
  const placeholder = /<[^>]*>|observable obligation|material uncertainty|^\.{3,}$/i;
  const hasRealObligation = (declaration.obligations ?? []).some((text) => !placeholder.test(text));
  const hasRealUncertainty = (declaration.uncertainties ?? []).some((text) => !placeholder.test(text));
  return hasRealObligation || hasRealUncertainty;
}
