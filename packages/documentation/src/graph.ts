import type { GraphEntity, GraphRelationship } from '@vestara/engineering-graph';
import type {
  DocumentationGraphProjection,
  DocumentationInventory,
  DocumentationPlan,
  DocumentationProposal,
} from './domain.js';

export function projectDocumentationGraph(
  inventory: DocumentationInventory,
  plans: readonly DocumentationPlan[] = [],
  proposals: readonly DocumentationProposal[] = [],
): DocumentationGraphProjection {
  const entities: GraphEntity[] = inventory.documents.map((document) => ({
    id: document.id,
    kind: 'document',
    label: document.title ?? document.path,
    status: document.status,
    owner: document.owner,
    tags: [document.kind, document.authority],
    updatedAt: document.lastReviewedAt,
    meta: { repositoryId: document.repositoryId, path: document.path, checksum: document.checksum },
  }));
  for (const plan of plans) {
    entities.push({
      id: `documentation-plan://${plan.id}`,
      kind: 'documentation-plan',
      label: plan.id,
      status: plan.status,
    });
    for (const task of plan.tasks) {
      entities.push({
        id: `documentation-task://${task.id}`,
        kind: 'documentation-task',
        label: task.title,
        status: task.status,
        owner: task.role,
      });
    }
  }
  for (const proposal of proposals) {
    entities.push({
      id: `documentation-proposal://${proposal.id}`,
      kind: 'documentation-proposal',
      label: proposal.documentPath,
      status: proposal.status,
      tags: [proposal.authority, proposal.operation],
    });
  }
  const relationships: GraphRelationship[] = [];
  for (const document of inventory.documents) {
    for (const reference of document.implementationRefs) {
      relationships.push({ from: document.id, to: `file://${reference.path}`, type: 'documents' });
    }
    for (const adr of document.relatedAdrIds)
      relationships.push({ from: document.id, to: `adr://${adr}`, type: 'governed-by' });
  }
  for (const plan of plans) {
    for (const task of plan.tasks) {
      relationships.push({
        from: `documentation-plan://${plan.id}`,
        to: `documentation-task://${task.id}`,
        type: 'contains',
      });
      for (const dependency of task.dependsOn) {
        relationships.push({
          from: `documentation-task://${task.id}`,
          to: `documentation-task://${dependency}`,
          type: 'depends-on',
        });
      }
    }
  }
  for (const proposal of proposals) {
    relationships.push({
      from: `documentation-task://${proposal.taskId}`,
      to: `documentation-proposal://${proposal.id}`,
      type: 'creates',
    });
    const document = inventory.documents.find(
      (item) => item.repositoryId === proposal.repositoryId && item.path === proposal.documentPath,
    );
    if (document)
      relationships.push({ from: `documentation-proposal://${proposal.id}`, to: document.id, type: 'updates' });
  }
  return { entities, relationships };
}
