import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Evidence — PCS-026 verification bundles.
 *
 * Browse verification bundles: checks, content-addressed evidence references
 * with provenance, derived confidence factors, and replay steps. Artifact
 * replay opens stored bytes (images render inline; text is fetched).
 */

const API = '/api/evidence';

interface VisualMetadata {
  width: number;
  height: number;
  mediaType: string;
}

interface EvidenceReference {
  ref: string;
  kind: string;
  mediaType: string;
  size: number;
  summary: string;
  provenance: { producer: string; executionId: string; operation?: string; createdAt: string; environment: string; contentHash: string };
  relatedTo?: string[];
  visual?: VisualMetadata;
}

interface Confidence {
  score: number;
  level: 'low' | 'moderate' | 'high' | 'very-high';
  factors: Array<{ dimension: string; score: number; rationale: string }>;
  limitations: string[];
}

interface Bundle {
  id: string;
  executionId: string;
  taskId?: string;
  verifierId: string;
  profileId: string;
  manifestId: string;
  evidence: EvidenceReference[];
  checks: Array<{ checkId: string; name: string; status: string; summary: string; evidenceRefs: string[] }>;
  replay: { mode: string; steps: Array<{ type: string; target: string; command?: string }>; requires: Record<string, unknown> };
  confidence: Confidence;
  createdAt: string;
}

interface Baseline {
  scenarioKey: string;
  artifactDigest: string;
  status: 'missing' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: string;
  candidateDigest?: string;
}

const CONFIDENCE_BADGE: Record<string, string> = {
  'very-high': 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  high: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  moderate: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  low: 'bg-red-500/15 text-red-300 border-red-500/30',
};

const BASELINE_BADGE: Record<string, string> = {
  approved: 'bg-emerald-500/15 text-emerald-300',
  rejected: 'bg-red-500/15 text-red-300',
  missing: 'bg-amber-500/15 text-amber-300',
};

const REVIEWER = 'workspace-reviewer';

const CHECK_BADGE: Record<string, string> = {
  passed: 'bg-emerald-500/15 text-emerald-300',
  failed: 'bg-red-500/15 text-red-300',
  blocked: 'bg-red-500/15 text-red-300',
  skipped: 'bg-zinc-600/20 text-zinc-300',
};

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg border-l-[3px]" style={{ borderLeftColor: accent }}>
      <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-widest">{label}</div>
      <div className="text-lg font-bold text-(--vestara-text) mt-1">{value}</div>
    </div>
  );
}

const VISUAL_EVIDENCE_KINDS: ReadonlySet<string> = new Set(['screenshot', 'visual-comparison']);

function isVisualEvidence(reference: EvidenceReference): boolean {
  return VISUAL_EVIDENCE_KINDS.has(reference.kind);
}

function EvidenceArtifact({ reference }: { reference: EvidenceReference }) {
  if (isVisualEvidence(reference)) return null;
  const url = `${API}/artifacts/${reference.ref}?mediaType=${encodeURIComponent(reference.mediaType)}`;
  if (reference.mediaType.startsWith('image/')) {
    return (
      <div className="mt-1 overflow-hidden rounded-lg border border-(--vestara-accent-border)">
        <img src={url} alt={reference.summary} className="max-h-48 w-auto" loading="lazy" />
      </div>
    );
  }
  if (reference.mediaType.startsWith('text/') || reference.mediaType.includes('json')) {
    return (
      <button
        onClick={() => void window.open(url, '_blank')}
        className="text-xs text-(--vestara-accent-text) hover:underline cursor-pointer"
      >
        open text artifact
      </button>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-xs text-(--vestara-accent-text) hover:underline">
      download artifact
    </a>
  );
}

// ─── Visual evidence gallery (EVIDENCE-UX-002 M3) ────────────────

type ThumbnailStatus = 'loading' | 'loaded' | 'unavailable' | 'failed';

function VisualEvidenceCard({
  reference,
  thumbnailStatus,
  onThumbnailStatus,
  selected,
  onSelect,
}: {
  reference: EvidenceReference;
  thumbnailStatus: ThumbnailStatus;
  onThumbnailStatus: (ref: string, status: ThumbnailStatus) => void;
  selected: boolean;
  onSelect: (reference: EvidenceReference) => void;
}) {
  const thumbnailUrl = `${API}/artifacts/${reference.ref}/thumbnail`;
  const dims = reference.visual;
  const dimLabel = dims ? `${dims.width} × ${dims.height}` : null;
  const mediaLabel = (reference.visual?.mediaType ?? reference.mediaType).split('/')?.[1]?.toUpperCase() ?? reference.mediaType;

  return (
    <button
      type="button"
      onClick={() => onSelect(reference)}
      className={`text-left rounded-xl border transition-colors overflow-hidden focus:outline-none focus:ring-2 focus:ring-(--vestara-accent) ${
        selected
          ? 'border-(--vestara-accent) bg-(--vestara-accent-bg)'
          : 'border-(--vestara-accent-border) bg-(--vestara-accent-bg)/40 hover:border-(--vestara-accent-border-hover)'
      }`}
      aria-label={`Visual evidence: ${reference.summary}`}
    >
      <div className="aspect-video bg-zinc-900 flex items-center justify-center overflow-hidden">
        {thumbnailStatus === 'loading' && (
          <div className="text-[10px] text-(--vestara-text-muted) animate-pulse">Loading…</div>
        )}
        {thumbnailStatus === 'unavailable' && (
          <div className="text-center px-3">
            <div className="text-[10px] text-(--vestara-text-muted)">Preview unavailable</div>
          </div>
        )}
        {thumbnailStatus === 'failed' && (
          <div className="text-center px-3">
            <div className="text-[10px] text-amber-300">Preview failed</div>
          </div>
        )}
        {thumbnailStatus === 'loaded' && (
          <img
            src={thumbnailUrl}
            alt={reference.summary}
            className="w-full h-full object-contain"
            loading="lazy"
          />
        )}
      </div>
      <div className="p-2 space-y-0.5">
        <div className="text-xs text-(--vestara-text) truncate">{reference.summary}</div>
        <div className="flex items-center gap-2 text-[10px] text-(--vestara-text-dim) flex-wrap">
          {dimLabel && <span>{dimLabel}</span>}
          <span>{mediaLabel}</span>
        </div>
        <div className="text-[10px] text-(--vestara-text-muted)">{reference.provenance.producer}</div>
      </div>
    </button>
  );
}

function EvidenceGallery({
  references,
  selectedRef,
  onSelect,
}: {
  references: EvidenceReference[];
  selectedRef: string | null;
  onSelect: (reference: EvidenceReference) => void;
}) {
  const [thumbnailStates, setThumbnailStates] = useState<Map<string, ThumbnailStatus>>(new Map());
  const requestedRef = useRef(new Set<string>());

  const updateStatus = useCallback((ref: string, status: ThumbnailStatus) => {
    setThumbnailStates((prev) => {
      const next = new Map(prev);
      next.set(ref, status);
      return next;
    });
  }, []);

  useEffect(() => {
    for (const reference of references) {
      if (requestedRef.current.has(reference.ref)) continue;
      requestedRef.current.add(reference.ref);
      updateStatus(reference.ref, 'loading');

      const img = new Image();
      img.onload = () => updateStatus(reference.ref, 'loaded');
      img.onerror = () => updateStatus(reference.ref, 'unavailable');
      img.src = `${API}/artifacts/${reference.ref}/thumbnail`;
    }
  }, [references, updateStatus]);

  if (references.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-semibold text-(--vestara-text)">Visual Evidence</h2>
          <p className="text-[10px] text-(--vestara-text-muted) mt-0.5">
            {references.length} artifact{references.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {references.map((reference) => (
          <VisualEvidenceCard
            key={reference.ref}
            reference={reference}
            thumbnailStatus={thumbnailStates.get(reference.ref) ?? 'loading'}
            onThumbnailStatus={updateStatus}
            selected={selectedRef === reference.ref}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

export default function EvidencePage() {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [detail, setDetail] = useState<Record<string, Bundle>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [loading, setLoading] = useState(true);
  const [baselineBusy, setBaselineBusy] = useState<string | null>(null);
  const [selectedVisualRef, setSelectedVisualRef] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const data = await fetchJson<{ bundles: Bundle[] }>(`${API}/bundles`);
    setBundles(data?.bundles ?? []);
    setLoading(false);
  }, []);

  const refreshBaselines = useCallback(async () => {
    const data = await fetchJson<{ baselines: Baseline[] }>(`${API}/baselines`);
    setBaselines(data?.baselines ?? []);
  }, []);

  useEffect(() => {
    void refresh();
    void refreshBaselines();
  }, [refresh, refreshBaselines]);

  const reviewBaseline = useCallback(
    async (scenarioKey: string, action: 'approve' | 'reject', candidateDigest?: string) => {
      setBaselineBusy(scenarioKey);
      try {
        await fetch(`${API}/baselines/${encodeURIComponent(scenarioKey)}/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(action === 'approve' ? { artifactDigest: candidateDigest } : {}),
            approvedBy: REVIEWER,
          }),
        });
        await refreshBaselines();
      } finally {
        setBaselineBusy(null);
      }
    },
    [refreshBaselines],
  );

  const loadDetail = useCallback(async (executionId: string) => {
    const data = await fetchJson<{ bundle: Bundle }>(`${API}/bundles/${executionId}`);
    if (data) setDetail((prev) => ({ ...prev, [executionId]: data.bundle }));
  }, []);

  const toggleExpand = useCallback(
    (executionId: string) => {
      const next = expandedId === executionId ? null : executionId;
      setExpandedId(next);
      if (next && !detail[executionId]) void loadDetail(executionId);
    },
    [expandedId, detail, loadDetail],
  );

  const stats = useMemo(() => {
    const byLevel: Record<string, number> = {};
    let totalEvidence = 0;
    for (const bundle of bundles) {
      byLevel[bundle.confidence.level] = (byLevel[bundle.confidence.level] || 0) + 1;
      totalEvidence += bundle.evidence.length;
    }
    return { total: bundles.length, high: byLevel['high'] || 0, veryHigh: byLevel['very-high'] || 0, evidence: totalEvidence };
  }, [bundles]);

  const visualReferences = useMemo(() => {
    const seen = new Set<string>();
    const result: EvidenceReference[] = [];
    for (const bundle of bundles) {
      for (const ref of bundle.evidence) {
        if (!isVisualEvidence(ref) || seen.has(ref.ref)) continue;
        seen.add(ref.ref);
        result.push(ref);
      }
    }
    return result;
  }, [bundles]);

  const handleSelectVisual = useCallback((reference: EvidenceReference) => {
    setSelectedVisualRef((prev) => (prev === reference.ref ? null : reference.ref));
  }, []);

  return (
    <div>
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-(--vestara-text)">Engineering Evidence</h1>
          <p className="text-[10px] text-(--vestara-text-muted) mt-1">
            Verification bundles · content-addressed evidence · replay (PCS-026)
          </p>
        </div>
        <button
          onClick={() => void refresh()}
          className="text-xs px-3 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg hover:text-(--vestara-text) transition-colors cursor-pointer"
        >
          ↻ Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Bundles" value={stats.total} accent="#8b5cf6" />
        <StatCard label="High confidence" value={stats.high} accent="#10b981" />
        <StatCard label="Very high" value={stats.veryHigh} accent="#14b8a6" />
        <StatCard label="Evidence items" value={stats.evidence} accent="#6366f1" />
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 className="text-sm font-semibold text-(--vestara-text)">Visual Baselines</h2>
            <p className="text-[10px] text-(--vestara-text-muted) mt-0.5">
              Human-reviewed governance — candidates are only promoted through approve/reject (PCS-026 §9)
            </p>
          </div>
          <button
            onClick={() => void refreshBaselines()}
            className="text-xs px-3 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg hover:text-(--vestara-text) transition-colors cursor-pointer"
          >
            ↻ Refresh
          </button>
        </div>

        {baselines.length === 0 ? (
          <div className="text-center py-8 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
            <p className="text-xs text-(--vestara-text-2)">No visual baselines yet</p>
            <p className="text-xs text-(--vestara-text-muted) mt-1">
              Candidates are recorded after a screenshot capture runs against a configured scenario.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {baselines.map((baseline) => {
              const candidate =
                baseline.candidateDigest ?? (baseline.status !== 'approved' ? baseline.artifactDigest : undefined);
              const actionable = candidate !== undefined;
              return (
                <div
                  key={baseline.scenarioKey}
                  className="rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg)/40 p-3"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <code className="text-[10px] text-(--vestara-text-muted) break-all">{baseline.scenarioKey}</code>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] ${BASELINE_BADGE[baseline.status] ?? 'bg-zinc-600/20 text-zinc-300'}`}>
                      {baseline.status}
                    </span>
                  </div>
                  {candidate ? (
                    <img
                      src={`${API}/artifacts/${candidate}?mediaType=${encodeURIComponent('image/png')}`}
                      alt={`candidate ${baseline.scenarioKey}`}
                      className="mt-2 max-h-32 w-auto rounded-lg border border-(--vestara-accent-border)"
                      loading="lazy"
                    />
                  ) : (
                    <div className="mt-2 text-[10px] text-(--vestara-text-dim)">no candidate capture</div>
                  )}
                  {baseline.approvedBy && (
                    <div className="mt-2 text-[10px] text-(--vestara-text-muted)">
                      {baseline.status === 'approved' ? 'approved' : 'reviewed'} by {baseline.approvedBy}
                      {baseline.approvedAt ? ` · ${new Date(baseline.approvedAt).toLocaleString()}` : ''}
                    </div>
                  )}
                  {actionable && (
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void reviewBaseline(baseline.scenarioKey, 'approve', candidate)}
                        disabled={baselineBusy === baseline.scenarioKey}
                        className="flex-1 text-xs px-3 py-1.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 rounded-lg hover:bg-emerald-500/25 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => void reviewBaseline(baseline.scenarioKey, 'reject')}
                        disabled={baselineBusy === baseline.scenarioKey}
                        className="flex-1 text-xs px-3 py-1.5 bg-red-500/15 border border-red-500/30 text-red-300 rounded-lg hover:bg-red-500/25 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <EvidenceGallery
        references={visualReferences}
        selectedRef={selectedVisualRef}
        onSelect={handleSelectVisual}
      />

      {loading ? (
        <div className="text-center py-12 text-sm text-(--vestara-text-muted)">Loading evidence...</div>
      ) : bundles.length === 0 ? (
        <div className="text-center py-16 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
          <div className="text-4xl text-(--vestara-text-2) mb-3">🧪</div>
          <p className="text-sm text-(--vestara-text-2)">No verification bundles yet</p>
          <p className="text-xs text-(--vestara-text-muted) mt-1">
            Bundles are created after every harness verification run.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {bundles.map((bundle) => {
            const expanded = expandedId === bundle.executionId;
            const detailBundle = detail[bundle.executionId] ?? bundle;
            return (
              <div key={bundle.executionId} className="rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg)/40">
                <button onClick={() => toggleExpand(bundle.executionId)} className="w-full text-left p-4 cursor-pointer">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-sm font-semibold text-(--vestara-text)">{bundle.executionId}</h2>
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] ${CONFIDENCE_BADGE[bundle.confidence.level] ?? 'bg-zinc-600/20 text-zinc-300'}`}>
                          {(bundle.confidence.score * 100).toFixed(0)}% · {bundle.confidence.level}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300">{bundle.profileId}</span>
                      </div>
                      <p className="text-xs text-(--vestara-text-muted) mt-1">
                        verifier: {bundle.verifierId} · {bundle.checks.length} checks · {bundle.evidence.length} evidence ·{' '}
                        {new Date(bundle.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span className="text-(--vestara-text-dim) text-xs">{expanded ? '▴' : '▾'}</span>
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-(--vestara-accent-border) p-4 space-y-4">
                    <div>
                      <div className="text-xs font-medium text-(--vestara-text-2) mb-2">Checks</div>
                      <div className="space-y-1">
                        {detailBundle.checks.map((check) => (
                          <div key={check.checkId} className="flex items-center gap-3 flex-wrap text-xs">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${CHECK_BADGE[check.status] ?? 'bg-zinc-600/20'}`}>
                              {check.status}
                            </span>
                            <span className="text-(--vestara-text)">{check.name}</span>
                            <span className="text-(--vestara-text-dim)">{check.summary}</span>
                            <span className="text-(--vestara-text-dim)">{check.evidenceRefs.length} evidence</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-(--vestara-text-2) mb-2">Evidence</div>
                      <div className="space-y-2">
                        {detailBundle.evidence.length === 0 && (
                          <p className="text-xs text-(--vestara-text-muted)">No content-addressed evidence.</p>
                        )}
                        {detailBundle.evidence.map((reference) => (
                          <div key={reference.ref} className="rounded-lg border border-(--vestara-accent-border) p-2">
                            <div className="flex items-center gap-2 flex-wrap text-xs">
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-violet-500/15 text-violet-300">{reference.kind}</span>
                              <span className="text-(--vestara-text)">{reference.summary}</span>
                              <span className="text-(--vestara-text-dim)">{reference.mediaType} · {reference.size}b</span>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap text-[10px] text-(--vestara-text-muted) mt-1">
                              <span>by {reference.provenance.producer}</span>
                              <span>·</span>
                              <span>{reference.provenance.operation ?? '—'}</span>
                              <span>·</span>
                              <span className="font-mono">{reference.ref.slice(0, 16)}…</span>
                            </div>
                            <EvidenceArtifact reference={reference} />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-(--vestara-text-2) mb-2">Confidence</div>
                      <div className="space-y-1">
                        {detailBundle.confidence.factors.map((factor) => (
                          <div key={factor.dimension} className="flex items-center gap-2 text-xs">
                            <span className="text-(--vestara-text-2) w-36">{factor.dimension}</span>
                            <div className="flex-1 h-1.5 rounded bg-zinc-800 overflow-hidden">
                              <div
                                className="h-full rounded bg-(--vestara-accent)"
                                style={{ width: `${Math.round(factor.score * 100)}%` }}
                              />
                            </div>
                            <span className="text-(--vestara-text-dim) w-16 text-right">{(factor.score * 100).toFixed(0)}%</span>
                          </div>
                        ))}
                        {detailBundle.confidence.limitations.length > 0 && (
                          <div className="mt-1 text-[10px] text-amber-300">
                            {detailBundle.confidence.limitations.map((limitation) => (
                              <div key={limitation}>⚠ {limitation}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-(--vestara-text-2) mb-2">
                        Replay <span className="text-(--vestara-text-dim)">({detailBundle.replay.mode})</span>
                      </div>
                      <div className="space-y-1">
                        {detailBundle.replay.steps.map((step, index) => (
                          <div key={`${step.type}-${index}`} className="flex items-center gap-2 text-[10px]">
                            <span className="text-(--vestara-text-dim)">{index + 1}.</span>
                            <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-(--vestara-text-2)">{step.type}</span>
                            <span className="font-mono text-(--vestara-text-muted)">{step.target.slice(0, 24)}…</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
