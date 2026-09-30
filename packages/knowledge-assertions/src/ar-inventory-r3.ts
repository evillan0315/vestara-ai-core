import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  Assertion,
  AssertionEvidenceLink,
  ConflictView,
  KnowledgeStratum,
  ReconciliationDisposition,
  UnresolvedQuestion,
} from './index';

const R3_FIXTURE = join(__dirname, '../fixtures/ar-inventory-002b-r3.json');
const ORIGINAL_DIGEST = '8e43b592a37ad71adac1792e0d73f5c1370ff40469e4a9a255986b437ebc5e3a';
const OVERLAY_DIGEST = '154350501d21af433e80646401e06f54aaa7751acf5858417a28b0e81ca66a95';
const fixtureByProjection = new WeakMap<InventoryReadProjection, R3Fixture>();

export interface HistoricalEvidenceLinkView {
  readonly role: AssertionEvidenceLink['role'];
  readonly artifactDigest: string;
  readonly artifact: 'original' | 'overlay';
  readonly anchorKind: string;
  readonly anchorValue: string;
}

export interface InventoryAssertionView {
  readonly id: string;
  readonly statement: string;
  readonly status: Assertion['status'];
  readonly stratum: KnowledgeStratum;
  readonly evidenceLinkCount: number;
  readonly evidence: readonly HistoricalEvidenceLinkView[];
}

export interface InventoryUnresolvedView {
  readonly id: string;
  readonly question: string;
  readonly reason: UnresolvedQuestion['reason'];
  readonly stratum?: KnowledgeStratum;
}

export interface InventoryConflictView {
  readonly id: string;
  readonly assertionIds: readonly string[];
  readonly stratum: KnowledgeStratum;
  readonly derivation: ConflictView['derivation'];
}

export type InventoryCategory = 'capability' | 'dependency';

export interface InventorySummaryView {
  readonly totalTargets: number;
  readonly capabilities: number;
  readonly dependencies: number;
  readonly represented: number;
  readonly unresolved: number;
  readonly excluded: number;
  readonly conflicts: number;
  readonly assertions: number;
  readonly historicalEvidenceLinks: number;
  readonly stratum: KnowledgeStratum;
}

export interface InventoryRowView {
  readonly targetId: string;
  readonly category: InventoryCategory;
  readonly disposition: ReconciliationDisposition['state'];
  readonly assertionCount: number;
  readonly historicalEvidenceLinkCount: number;
  readonly hasUnresolvedQuestion: boolean;
  readonly hasConflict: boolean;
  readonly stratum: KnowledgeStratum;
  readonly description?: string;
}

export interface InventoryDetailView extends InventoryRowView {
  readonly assertions: readonly InventoryAssertionView[];
  readonly unresolvedQuestion?: InventoryUnresolvedView;
  readonly conflict?: InventoryConflictView;
}

export interface InventoryReadProjection {
  readonly summary: InventorySummaryView;
  readonly rows: readonly InventoryRowView[];
}

export interface R3Fixture {
  readonly sourceEvidence: {
    readonly originalArtifactDigest: string;
    readonly overlayArtifactDigest: string;
  };
  readonly stratum: KnowledgeStratum;
  readonly assertions: readonly Assertion[];
  readonly unresolvedQuestions: readonly UnresolvedQuestion[];
  readonly conflicts: readonly ConflictView[];
  readonly dispositions: readonly (ReconciliationDisposition & { readonly rowId: string })[];
  readonly accounting: {
    readonly denominator: number;
    readonly represented: number;
    readonly unresolved: number;
    readonly excluded: number;
  };
}

export class InventoryMaterializationUnavailableError extends Error {
  readonly code = 'INVENTORY_MATERIALIZATION_UNAVAILABLE';

  constructor(cause: unknown) {
    super('The frozen Inventory knowledge materialization is unavailable.', { cause });
    this.name = 'InventoryMaterializationUnavailableError';
  }
}

export function loadInventoryR3Projection(): InventoryReadProjection {
  try {
    const fixture = JSON.parse(readFileSync(R3_FIXTURE, 'utf8')) as R3Fixture;
    return projectInventoryR3(fixture);
  } catch (error) {
    throw new InventoryMaterializationUnavailableError(error);
  }
}

export function projectInventoryR3(fixture: R3Fixture): InventoryReadProjection {
  if (
    fixture.sourceEvidence.originalArtifactDigest !== ORIGINAL_DIGEST ||
    fixture.sourceEvidence.overlayArtifactDigest !== OVERLAY_DIGEST
  ) {
    throw new Error('R3 historical artifact identities do not match the accepted materialization.');
  }
  for (const assertion of fixture.assertions) {
    for (const link of assertion.evidence) historicalEvidenceLinkView(link);
  }

  const assertionsByTarget = new Map<string, Assertion[]>();
  for (const assertion of fixture.assertions) {
    const targetId = assertion.target.id;
    const assertions = assertionsByTarget.get(targetId) ?? [];
    assertions.push(assertion);
    assertionsByTarget.set(targetId, assertions);
  }

  const questionsByTarget = new Map<string, UnresolvedQuestion>();
  for (const question of fixture.unresolvedQuestions) {
    if (question.target) questionsByTarget.set(question.target.id, question);
  }

  const conflictsByTarget = new Map<string, ConflictView>();
  for (const conflict of fixture.conflicts) conflictsByTarget.set(conflict.target.id, conflict);

  const dispositionsByRow = new Map(fixture.dispositions.map((disposition) => [disposition.rowId, disposition]));
  const rows = [...dispositionsByRow.keys()].sort(compareInventoryRows).map((rowId) => {
    const disposition = dispositionsByRow.get(rowId);
    if (!disposition) throw new Error(`Missing disposition for ${rowId}`);
    const assertions = assertionsByTarget.get(`inventory:${rowId}`) ?? [];
    return rowView(rowId, fixture.stratum, assertions, disposition, questionsByTarget, conflictsByTarget);
  });

  const projection: InventoryReadProjection = {
    summary: {
      totalTargets: fixture.accounting.denominator,
      capabilities: rows.filter((row) => row.category === 'capability').length,
      dependencies: rows.filter((row) => row.category === 'dependency').length,
      represented: fixture.accounting.represented,
      unresolved: fixture.accounting.unresolved,
      excluded: fixture.accounting.excluded,
      conflicts: fixture.conflicts.length,
      assertions: fixture.assertions.length,
      historicalEvidenceLinks: fixture.assertions.reduce((count, assertion) => count + assertion.evidence.length, 0),
      stratum: fixture.stratum,
    },
    rows,
  };
  fixtureByProjection.set(projection, fixture);
  return projection;
}

export function inventoryDetail(
  projection: InventoryReadProjection,
  targetId: string,
): InventoryDetailView | undefined {
  const row = projection.rows.find((candidate) => candidate.targetId === targetId);
  if (!row) return undefined;

  const fixture = fixtureByProjection.get(projection) ?? loadInventoryR3Fixture();
  const assertions = fixture.assertions
    .filter((assertion) => assertion.target.id === `inventory:${targetId}`)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(assertionView);
  const question = fixture.unresolvedQuestions.find((candidate) => candidate.target?.id === `inventory:${targetId}`);
  const conflict = fixture.conflicts.find((candidate) => candidate.target.id === `inventory:${targetId}`);
  return {
    ...row,
    assertions,
    unresolvedQuestion: question
      ? { id: question.id, question: question.question, reason: question.reason, stratum: question.stratum }
      : undefined,
    conflict: conflict
      ? {
          id: conflict.id,
          assertionIds: conflict.assertionIds,
          stratum: conflict.stratum,
          derivation: conflict.derivation,
        }
      : undefined,
  };
}

function loadInventoryR3Fixture(): R3Fixture {
  try {
    return JSON.parse(readFileSync(R3_FIXTURE, 'utf8')) as R3Fixture;
  } catch (error) {
    throw new InventoryMaterializationUnavailableError(error);
  }
}

function rowView(
  rowId: string,
  stratum: KnowledgeStratum,
  assertions: readonly Assertion[],
  disposition: ReconciliationDisposition & { readonly rowId: string },
  questionsByTarget: ReadonlyMap<string, UnresolvedQuestion>,
  conflictsByTarget: ReadonlyMap<string, ConflictView>,
): InventoryRowView {
  const evidenceLinkCount = assertions.reduce((count, assertion) => count + assertion.evidence.length, 0);
  return {
    targetId: rowId,
    category: rowId.startsWith('AR-CAP-') ? 'capability' : 'dependency',
    disposition: disposition.state,
    assertionCount: assertions.length,
    historicalEvidenceLinkCount: evidenceLinkCount,
    hasUnresolvedQuestion: questionsByTarget.has(`inventory:${rowId}`),
    hasConflict: conflictsByTarget.has(`inventory:${rowId}`),
    stratum,
    description: assertions[0]?.statement,
  };
}

function assertionView(assertion: Assertion): InventoryAssertionView {
  return {
    id: assertion.id,
    statement: assertion.statement,
    status: assertion.status,
    stratum: assertion.stratum,
    evidenceLinkCount: assertion.evidence.length,
    evidence: assertion.evidence.map(historicalEvidenceLinkView),
  };
}

function historicalEvidenceLinkView(link: AssertionEvidenceLink): HistoricalEvidenceLinkView {
  if (link.kind !== 'historical-fragment') throw new Error('R3 contains a non-historical evidence link');
  const { artifactDigest, anchor } = link.historicalLocator;
  const artifact =
    artifactDigest === ORIGINAL_DIGEST ? 'original' : artifactDigest === OVERLAY_DIGEST ? 'overlay' : undefined;
  if (!artifact) throw new Error(`R3 contains an unknown historical artifact digest: ${artifactDigest}`);
  return { role: link.role, artifactDigest, artifact, anchorKind: anchor.kind, anchorValue: anchor.value };
}

function compareInventoryRows(left: string, right: string): number {
  const categoryRank = (id: string) => (id.startsWith('AR-CAP-') ? 0 : 1);
  const rankDifference = categoryRank(left) - categoryRank(right);
  if (rankDifference !== 0) return rankDifference;
  return Number(left.match(/(\d+)$/)?.[1] ?? 0) - Number(right.match(/(\d+)$/)?.[1] ?? 0);
}
