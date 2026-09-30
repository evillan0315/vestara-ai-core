import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
import { Badge, Chip } from '@vestara/ui';
import { useEffect, useMemo, useState } from 'react';
import EmptyState from '../components/EmptyState/EmptyState';
import { WorkspaceOperationalPanel } from '../components/WorkspaceOperationalPanel';
import {
  type InventoryAssertion,
  type InventoryDetail,
  type InventoryProjectionResponse,
  type InventoryRow,
  inventoryApi,
} from '../lib/inventory';

type CategoryFilter = 'all' | 'capability' | 'dependency';
type StatusFilter = 'all' | 'represented' | 'unresolved' | 'excluded';

function dispositionVariant(disposition: InventoryRow['disposition']): 'default' | 'info' | 'warning' {
  if (disposition === 'represented') return 'info';
  if (disposition === 'unresolved') return 'warning';
  return 'default';
}

function compactDigest(digest: string): string {
  return `${digest.slice(0, 10)}…${digest.slice(-8)}`;
}

function categoryLabel(category: InventoryRow['category']): string {
  return category === 'capability' ? 'Capability' : 'Dependency';
}

export function InventoryPanel() {
  const [projection, setProjection] = useState<InventoryProjectionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InventoryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void inventoryApi
      .projection(controller.signal)
      .then((data) => {
        setProjection(data);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Inventory is unavailable.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const rows = useMemo(() => {
    if (!projection) return [];
    const normalizedQuery = query.trim().toLowerCase();
    return projection.rows.filter((row) => {
      if (category !== 'all' && row.category !== category) return false;
      if (status !== 'all' && row.disposition !== status) return false;
      if (!normalizedQuery) return true;
      return `${row.targetId} ${row.description ?? ''}`.toLowerCase().includes(normalizedQuery);
    });
  }, [category, projection, query, status]);

  const openDetail = (targetId: string) => {
    setSelectedTargetId(targetId);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    void inventoryApi
      .detail(targetId)
      .then((data) => setDetail(data.detail))
      .catch((caught: unknown) => setDetailError(caught instanceof Error ? caught.message : 'Target detail is unavailable.'))
      .finally(() => setDetailLoading(false));
  };

  const closeDetail = () => {
    setSelectedTargetId(null);
    setDetail(null);
    setDetailError(null);
  };

  const selectedRow = projection?.rows.find((row) => row.targetId === selectedTargetId);

  return (
    <div className="space-y-4">
      {loading ? (
        <InventoryLoading />
      ) : error ? (
        <EmptyState title="Inventory unavailable" description={error} />
      ) : !projection || projection.rows.length === 0 ? (
        <EmptyState title="No Inventory materialization" description="The loaded knowledge projection contains no Inventory targets." />
      ) : (
        selectedTargetId === null ? (
          <>
            <SummaryCards summary={projection.summary} />
            <WorkspaceOperationalPanel
              icon={<AccountTreeRoundedIcon />}
              title="Inventory targets"
              description="Read-only historical assertions, unresolved questions, and conflict references."
            >
              <div className="space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <label className="flex min-w-0 flex-1 items-center gap-2" htmlFor="inventory-search">
                    <span className="sr-only">Search Inventory</span>
                    <input
                      id="inventory-search"
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search Inventory…"
                      className="min-w-0 flex-1 rounded-[var(--vestara-radius)] border border-[var(--vestara-border-default)] bg-[var(--vestara-surface-panel-raised)] px-3 py-2 text-sm text-[var(--vestara-text-primary)] outline-none placeholder:text-[var(--vestara-text-muted)] focus:border-[var(--vestara-accent-primary)]"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2" aria-label="Inventory category filters">
                    {(['all', 'capability', 'dependency'] as const).map((value) => (
                      <Chip key={value} selected={category === value} onClick={() => setCategory(value)}>
                        {value === 'all' ? 'All' : value === 'capability' ? 'Capabilities' : 'Dependencies'}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2" aria-label="Inventory status filters">
                  <span className="text-xs text-[var(--vestara-text-muted)]">Status:</span>
                  {(['all', 'represented', 'unresolved', 'excluded'] as const).map((value) => (
                    <Chip key={value} size="sm" selected={status === value} onClick={() => setStatus(value)}>
                      {value[0].toUpperCase() + value.slice(1)}
                    </Chip>
                  ))}
                </div>
                {rows.length === 0 ? (
                  <EmptyState title="No matching Inventory targets" description="Try a different search or filter. The Inventory materialization is still available." />
                ) : (
                  <div className="grid gap-2" aria-label="Inventory list">
                    {rows.map((row) => <InventoryRowCard key={row.targetId} row={row} onSelect={openDetail} />)}
                  </div>
                )}
              </div>
            </WorkspaceOperationalPanel>
          </>
        ) : (
          <InventoryDetailPanel
            row={selectedRow}
            detail={detail}
            loading={detailLoading}
            error={detailError}
            onBack={closeDetail}
          />
        )
      )}
    </div>
  );
}

function SummaryCards({ summary }: { summary: InventoryProjectionResponse['summary'] }) {
  return (
    <div className="space-y-2" aria-label="Inventory summary">
      <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--vestara-text-secondary)]">
        <Inventory2RoundedIcon fontSize="small" aria-hidden="true" />
        <span>Historical Inventory knowledge</span>
        <Badge variant="info">Design lineage</Badge>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-[var(--vestara-text-secondary)]">
        <span className="text-lg font-semibold text-[var(--vestara-text-primary)]">{summary.totalTargets} targets</span>
        <span>{summary.capabilities} capabilities · {summary.dependencies} dependencies</span>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Inventory epistemic summary">
        <Badge variant="info">{summary.represented} Represented</Badge>
        <Badge variant="warning">{summary.unresolved} Unresolved</Badge>
        <Badge variant="warning">{summary.conflicts} Conflicts</Badge>
        <Badge variant="default">{summary.excluded} Excluded</Badge>
      </div>
      <p className="text-xs text-[var(--vestara-text-muted)]">
        {summary.assertions} assertions · {summary.historicalEvidenceLinks} historical evidence links · represented does not mean implemented or verified.
      </p>
    </div>
  );
}

function InventoryRowCard({ row, onSelect }: { row: InventoryRow; onSelect: (targetId: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(row.targetId)}
      className="w-full rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] p-3 text-left transition-colors hover:border-[var(--vestara-accent-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vestara-accent-primary)]"
      aria-label={`Inspect ${row.targetId}`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[var(--vestara-text-primary)]">{row.targetId}</span>
            <Badge variant="default">{categoryLabel(row.category)}</Badge>
            <Badge variant={dispositionVariant(row.disposition)}>{row.disposition}</Badge>
            {row.hasConflict && <Badge variant="warning">Conflict</Badge>}
            {row.hasUnresolvedQuestion && <Badge variant="warning">Unresolved question</Badge>}
          </div>
          {row.description && <p className="mt-2 line-clamp-2 text-sm text-[var(--vestara-text-secondary)]">{row.description}</p>}
        </div>
        <div className="flex shrink-0 gap-3 text-xs text-[var(--vestara-text-muted)]">
          <span>Assertions: {row.assertionCount}</span>
          <span>Historical evidence: {row.historicalEvidenceLinkCount}</span>
        </div>
      </div>
    </button>
  );
}

function InventoryLoading() {
  return (
    <div className="rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] p-8 text-center" role="status" aria-label="Loading Inventory">
      <p className="text-sm text-[var(--vestara-text-muted)]">Loading historical Inventory knowledge…</p>
    </div>
  );
}

function InventoryDetailPanel({
  row,
  detail,
  loading,
  error,
  onBack,
}: {
  row?: InventoryRow;
  detail: InventoryDetail | null;
  loading: boolean;
  error: string | null;
  onBack: () => void;
}) {
  return (
    <section className="space-y-4" aria-label="Inventory detail">
      <button
        type="button"
        onClick={onBack}
        className="text-sm font-medium text-[var(--vestara-accent-text)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vestara-accent-primary)]"
      >
        ← Back to Inventory
      </button>
      <div>
        <h2 className="text-base font-semibold text-[var(--vestara-text-primary)]">{row?.targetId ?? 'Inventory target'}</h2>
        <p className="mt-1 text-xs text-[var(--vestara-text-muted)]">Historical Inventory knowledge — design lineage, not current-system verification.</p>
        {row && (
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="default">{categoryLabel(row.category)}</Badge>
            <Badge variant={dispositionVariant(row.disposition)}>{row.disposition}</Badge>
            <Badge variant="info">{row.stratum}</Badge>
            {row.hasConflict && <Badge variant="warning">Conflict</Badge>}
            {row.hasUnresolvedQuestion && <Badge variant="warning">Unresolved question</Badge>}
          </div>
        )}
      </div>
      {loading ? (
        <div className="py-10 text-center text-sm text-[var(--vestara-text-muted)]" role="status">Loading target detail…</div>
      ) : error ? (
        <EmptyState title="Target detail unavailable" description={error} />
      ) : !detail ? (
        <EmptyState title="Target not found" description="This Inventory target is no longer available in the loaded projection." />
      ) : (
        <div className="space-y-5">
          <section aria-labelledby="inventory-assertions-heading">
            <h3 id="inventory-assertions-heading" className="text-sm font-semibold text-[var(--vestara-text-primary)]">Assertions</h3>
            <div className="mt-2 space-y-3">
              {detail.assertions.map((assertion) => <AssertionBlock key={assertion.id} assertion={assertion} />)}
            </div>
          </section>
          {detail.unresolvedQuestion && (
            <section className="rounded-[var(--vestara-radius)] border border-[var(--vestara-status-warning)]/30 bg-[var(--vestara-status-warning)]/10 p-3" aria-labelledby="inventory-unresolved-heading">
              <h3 id="inventory-unresolved-heading" className="text-sm font-semibold text-[var(--vestara-text-primary)]">Unresolved question</h3>
              <p className="mt-1 text-sm text-[var(--vestara-text-secondary)]">{detail.unresolvedQuestion.question}</p>
              <p className="mt-2 text-xs text-[var(--vestara-text-muted)]">Reason: {detail.unresolvedQuestion.reason}</p>
            </section>
          )}
          {detail.conflict && (
            <section className="rounded-[var(--vestara-radius)] border border-[var(--vestara-status-warning)]/30 bg-[var(--vestara-status-warning)]/10 p-3" aria-labelledby="inventory-conflict-heading">
              <h3 id="inventory-conflict-heading" className="text-sm font-semibold text-[var(--vestara-text-primary)]">Conflict</h3>
              <p className="mt-1 text-sm text-[var(--vestara-text-secondary)]">No winner has been selected.</p>
              <p className="mt-2 text-xs text-[var(--vestara-text-muted)]">Assertions: {detail.conflict.assertionIds.join(', ')}</p>
            </section>
          )}
        </div>
      )}
    </section>
  );
}

function AssertionBlock({ assertion }: { assertion: InventoryAssertion }) {
  return (
    <article className="space-y-3 rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-[var(--vestara-text-primary)]">{assertion.id}</span>
        <Badge variant="default">{assertion.status}</Badge>
        <span className="text-xs text-[var(--vestara-text-muted)]">{assertion.evidenceLinkCount} historical evidence links</span>
      </div>
      <p className="text-sm leading-relaxed text-[var(--vestara-text-secondary)]">{assertion.statement}</p>
      <div className="space-y-2" aria-label={`Historical evidence for ${assertion.id}`}>
        <p className="text-xs font-medium text-[var(--vestara-text-muted)]">Historical evidence</p>
        {assertion.evidence.map((link, index) => (
          <dl key={`${link.artifactDigest}-${link.anchorValue}-${index}`} className="grid gap-x-3 gap-y-1 rounded-[var(--vestara-radius)] bg-[var(--vestara-surface-panel-raised)] p-2 text-xs sm:grid-cols-[auto_1fr]">
            <dt className="text-[var(--vestara-text-muted)]">Role</dt>
            <dd><Badge variant="info">{link.role}</Badge></dd>
            <dt className="text-[var(--vestara-text-muted)]">Artifact</dt>
            <dd className="text-[var(--vestara-text-secondary)]">{link.artifact === 'original' ? 'Original artifact' : 'Semantic review overlay'}</dd>
            <dt className="text-[var(--vestara-text-muted)]">Digest</dt>
            <dd className="break-all font-mono text-[var(--vestara-text-secondary)]">{compactDigest(link.artifactDigest)}</dd>
            <dt className="text-[var(--vestara-text-muted)]">Anchor</dt>
            <dd className="text-[var(--vestara-text-secondary)]">{link.anchorKind} / {link.anchorValue}</dd>
          </dl>
        ))}
      </div>
    </article>
  );
}
