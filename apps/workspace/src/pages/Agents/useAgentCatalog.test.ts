/** @vitest-environment jsdom */

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CATALOG_AGENTS_FIXTURE, CATALOG_EXECUTIONS_FIXTURE } from './agent-catalog.fixtures';
import { useAgentCatalog } from './useAgentCatalog';

const BASE_FILTERS = { search: '', status: 'all', team: 'all', sort: 'name-asc' as const, capabilities: [] };

function renderCatalog(overrides: Partial<Parameters<typeof useAgentCatalog>[0]> = {}) {
  return renderHook(() =>
    useAgentCatalog({
      agents: CATALOG_AGENTS_FIXTURE,
      executions: CATALOG_EXECUTIONS_FIXTURE,
      catalogTab: 'all',
      filters: BASE_FILTERS,
      selectedAgentId: null,
      ...overrides,
    }),
  );
}

describe('useAgentCatalog', () => {
  it('indexes capabilities across agents', () => {
    const { result } = renderCatalog();
    expect(result.current.allCapabilities).toEqual(expect.arrayContaining(['planning', 'coding', 'review']));
  });

  it('scopes the catalog to the active tab', () => {
    const { result } = renderCatalog({ catalogTab: 'mine' });
    expect(result.current.catalogAgents.map((a) => a.id)).toEqual(['agent-user-1']);
  });

  it('filters by search text and sorts by name', () => {
    const { result } = renderCatalog({ filters: { ...BASE_FILTERS, search: 'review' } });
    // 'review' matches the reviewer role and the review capability; name-asc order.
    expect(result.current.filteredAgents.map((a) => a.id)).toEqual(['agent-user-1', 'agent-system-2']);
  });

  it('resolves the selected agent and its executions', () => {
    const { result } = renderCatalog({ selectedAgentId: 'agent-system-1' });
    expect(result.current.selectedAgent?.id).toBe('agent-system-1');
    expect(result.current.selectedExecutions.map((e) => e.id)).toEqual(['exec-1']);
  });

  it('summarizes executions without changing the counts', () => {
    const { result } = renderCatalog();
    expect(result.current.execSummary).toMatchObject({ completed: 1, running: 1 });
  });
});
