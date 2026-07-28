import type { UnderstandingProducer, ProducerResult, WorkspaceObservation } from '@vestara/understanding';

export class ActivityProducer implements UnderstandingProducer {
  readonly id = 'activity';

  async produce(observation: WorkspaceObservation): Promise<ProducerResult> {
    const o = observation;
    const evidence: string[] = [];

    const recentChanges = o.gitActivity.recentCommits.map((c) => ({
      description: c.message,
      author: c.author,
      timestamp: c.timestamp,
    }));
    if (recentChanges.length > 0) evidence.push(`commits:${recentChanges.length}`);
    else evidence.push('commits:none');

    const stalledSince = recentChanges.length > 0 ? null : o.workspace.lastOpenedAt;
    if (stalledSince) evidence.push('stalled');

    const decisions = o.workspace.memory.recentMemories
      .filter((m) => m.type === 'decision')
      .map((m, i) => ({
        id: `mem-${i}`,
        title: m.content.slice(0, 80),
        summary: m.content,
        timestamp: m.createdAt,
      }));

    const keyFacts = o.workspace.memory.recentMemories
      .filter((m) => m.type === 'fact' && m.importance >= 5)
      .map((m) => m.content);

    const confidence = recentChanges.length > 0 ? 0.85 : 0.4;

    return {
      fields: {
        activity: {
          recentChanges,
          activeBranches: o.gitActivity.activeBranches,
          uncommittedWork: o.gitActivity.uncommittedChanges > 0,
          stalledSince,
        },
        memory: {
          recentDecisions: decisions,
          keyFacts,
          memoryCount: o.workspace.memory.totalCount,
        },
      },
      confidence,
      evidence,
    };
  }
}
