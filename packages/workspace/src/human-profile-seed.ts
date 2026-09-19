/**
 * Professional Profile v1 seed — first live HUMAN-CONTEXT-003 write.
 *
 * Scope (authorized): exactly two items for one principal —
 *   1. the reconciled-resume PROFESSIONAL SUMMARY as the single `professional`
 *      narrative item (SELF_DESCRIBED, PUBLIC, agentReadable=true), and
 *   2. the Centura "around 2010" approximation beside it (APPROXIMATE,
 *      defaults PRIVATE/false), demonstrating that refined recollection does
 *      not erase earlier testimony.
 *
 * What this is NOT: not a migration, not a bulk ingest, not retrieval, not
 * publication. PUBLIC sensitivity and agentReadable=true grant nothing by
 * themselves — no policy engine, retrieval path, or projection consumes them
 * yet (004/005). Run-once per principal; reruns are detected via the
 * existing list API and skipped (no storage contract changes for idempotency).
 *
 * Architecture Traceability:
 *   HUMAN-CONTEXT-003 — governed knowledge substrate (frozen)
 */

import type { HumanKnowledgeItem } from './human-knowledge';
import type { HumanKnowledgeStorage } from './human-knowledge-storage';
import type { HumanPrincipalStorage } from './human-principal-storage';

export const PROFESSIONAL_PROFILE_V1_SOURCE = 'eddie-resume-reconciled';
export const BIOGRAPHY_V1_SOURCE = 'eddie-biography-founder';

export const PROFESSIONAL_PROFILE_V1_VALUE = [
  'Self-taught senior software and platform engineer with a career spanning technical support,',
  'multimedia and interactive development, web and enterprise software, cloud infrastructure,',
  'DevOps, real-time systems, and AI-native platform architecture. Experienced across frontend,',
  'backend, APIs, databases, Linux, cloud operations, containers, CI/CD, authentication,',
  'real-time communications, and developer tooling.',
  '',
  'Currently building Vestara, an AI-native engineering and orchestration platform focused on',
  'governed human-agent collaboration, execution, permissions, evidence, observability, and',
  'production-ready agent workflows.',
].join('\n');

export const CENTURA_APPROXIMATION_VALUE = 'I probably left Centura around 2010';

export const BIOGRAPHY_V1_VALUE = [
  'Eddie Villanueva is the Founder of Vestara, an AI-native engineering and orchestration platform for',
  'governed human-agent collaboration, execution, permissions, evidence, observability, and',
  'production-ready agent workflows.',
  '',
  'A self-taught senior software and platform engineer, Eddie brings experience across technical',
  'support, multimedia and interactive development, web and enterprise software, cloud infrastructure,',
  'DevOps, real-time systems, and AI-native platform architecture. His work spans frontend and backend',
  'development, APIs, databases, Linux, cloud operations, containers, CI/CD, authentication, real-time',
  'communications, and developer tooling.',
].join('\n');

export interface ProfessionalProfileV1SeedResult {
  professionalItem: HumanKnowledgeItem<string>;
  centuraItem: HumanKnowledgeItem<string>;
  biographyItem: HumanKnowledgeItem<string>;
  /** True when the professional item already existed and nothing was written. */
  skipped: boolean;
}

export async function seedProfessionalProfileV1(
  stores: { principals: HumanPrincipalStorage; knowledge: HumanKnowledgeStorage },
  principalId: string,
): Promise<ProfessionalProfileV1SeedResult> {
  await stores.principals.require(principalId);

  const existing = await stores.knowledge.list<string>(principalId, { subdomain: 'professional' });
  const prior = existing.find(
    (entry) => entry.kind === 'professional-summary' && entry.meta.source === PROFESSIONAL_PROFILE_V1_SOURCE,
  );
  if (prior) {
    const centura = await stores.knowledge.list<string>(principalId, { subdomain: 'career' });
    const priorCentura = centura.find((entry) => entry.value === CENTURA_APPROXIMATION_VALUE);
    if (!priorCentura)
      throw new Error('Seed marker present but Centura companion item missing — refusing partial reseed');
    const biography = await stores.knowledge.list<string>(principalId, { subdomain: 'biography' });
    const priorBiography = biography.find((entry) => entry.meta.source === BIOGRAPHY_V1_SOURCE);
    if (priorBiography) {
      return { professionalItem: prior, centuraItem: priorCentura, biographyItem: priorBiography, skipped: true };
    }
    const biographyItem = await createBiography(stores.knowledge, principalId);
    return { professionalItem: prior, centuraItem: priorCentura, biographyItem, skipped: false };
  }

  const professionalItem = await stores.knowledge.create<string>(principalId, {
    subdomain: 'professional',
    kind: 'professional-summary',
    value: PROFESSIONAL_PROFILE_V1_VALUE,
    meta: {
      source: PROFESSIONAL_PROFILE_V1_SOURCE,
      verificationStatus: 'SELF_DESCRIBED',
      // Confidence that this is Eddie's stated summary as provided — not a
      // truth score over every claim it contains. Never derived from status.
      confidence: 0.9,
      sensitivity: 'PUBLIC',
      // Eligible for future policy consideration only. No retrieval path
      // exists, so this grants nothing today (003: storage ≠ publication).
      agentReadable: true,
      primarySubjectRef: 'eddie',
    },
  });

  const centuraItem = await stores.knowledge.create<string>(principalId, {
    subdomain: 'career',
    kind: 'employment-recollection',
    value: CENTURA_APPROXIMATION_VALUE,
    meta: {
      source: 'eddie-recollection',
      timeRange: { from: '2010', approximate: true },
      verificationStatus: 'APPROXIMATE',
      confidence: 0.4,
      primarySubjectRef: 'eddie',
    },
  });

  const biographyItem = await createBiography(stores.knowledge, principalId);

  return { professionalItem, centuraItem, biographyItem, skipped: false };
}

async function createBiography(knowledge: HumanKnowledgeStorage, principalId: string) {
  return knowledge.create<string>(principalId, {
    subdomain: 'biography',
    kind: 'biography',
    value: BIOGRAPHY_V1_VALUE,
    meta: {
      source: BIOGRAPHY_V1_SOURCE,
      verificationStatus: 'SELF_DESCRIBED',
      confidence: 0.9,
      sensitivity: 'PUBLIC',
      agentReadable: true,
      primarySubjectRef: 'eddie',
    },
  });
}
