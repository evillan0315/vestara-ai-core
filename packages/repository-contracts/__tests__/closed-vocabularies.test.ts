/**
 * VES-REPO-002 — closed vocabularies stay closed.
 */
import { describe, expect, it } from 'vitest';
import { REPOSITORY_ACCESS_MODES } from '../src/access-mode';
import { ATTRIBUTION_CONFIDENCES, CHANGE_ATTRIBUTIONS } from '../src/changeset';
import { REPOSITORY_CONFLICT_CLASSES } from '../src/conflict';
import { MUTATION_KINDS } from '../src/intent';
import { SCOPE_LEVELS } from '../src/scope';
import { SNAPSHOT_REASONS } from '../src/snapshot';
import { ACTIVE_WORK_STATES } from '../src/work';

describe('closed vocabularies', () => {
  it('access modes are exactly OBSERVE/ANALYZE/VERIFY/MUTATE', () => {
    expect(REPOSITORY_ACCESS_MODES).toEqual(['OBSERVE', 'ANALYZE', 'VERIFY', 'MUTATE']);
  });

  it('attribution supports human/external/mixed/unknown alongside executions', () => {
    expect(CHANGE_ATTRIBUTIONS).toEqual(['vestara-execution', 'human', 'external', 'mixed', 'unknown']);
  });

  it('confidence permits PROVEN/CORRELATED/AMBIGUOUS/UNKNOWN', () => {
    expect(ATTRIBUTION_CONFIDENCES).toEqual(['PROVEN', 'CORRELATED', 'AMBIGUOUS', 'UNKNOWN']);
  });

  it('all nine conflict classes C1-C9 are representable', () => {
    expect(REPOSITORY_CONFLICT_CLASSES).toEqual([
      'exact-path',
      'directory-overlap',
      'contract',
      'dependency',
      'schema-migration',
      'generated',
      'verification-drift',
      'head-drift',
      'external-mutation',
    ]);
  });

  it('work states, mutation kinds, scope levels, snapshot reasons are frozen', () => {
    expect(ACTIVE_WORK_STATES).toEqual([
      'registered',
      'waiting',
      'active',
      'verifying',
      'completed',
      'failed',
      'cancelled',
    ]);
    expect(MUTATION_KINDS).toEqual(['source', 'configuration', 'schema', 'migration', 'generated', 'documentation']);
    expect(SCOPE_LEVELS).toEqual(['repository', 'application', 'package', 'domain', 'authority', 'path']);
    expect(SNAPSHOT_REASONS).toEqual(['execution-start', 'verification-start', 'execution-end', 'manual']);
  });
});
