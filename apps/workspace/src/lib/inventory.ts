export type InventoryCategory = 'capability' | 'dependency';
export type InventoryDisposition = 'represented' | 'unresolved' | 'excluded';

export interface InventorySummary {
  readonly totalTargets: number;
  readonly capabilities: number;
  readonly dependencies: number;
  readonly represented: number;
  readonly unresolved: number;
  readonly excluded: number;
  readonly conflicts: number;
  readonly assertions: number;
  readonly historicalEvidenceLinks: number;
  readonly stratum: string;
}

export interface InventoryRow {
  readonly targetId: string;
  readonly category: InventoryCategory;
  readonly disposition: InventoryDisposition;
  readonly assertionCount: number;
  readonly historicalEvidenceLinkCount: number;
  readonly hasUnresolvedQuestion: boolean;
  readonly hasConflict: boolean;
  readonly stratum: string;
  readonly description?: string;
}

export interface HistoricalEvidenceLink {
  readonly role: 'supporting' | 'contesting' | 'contextual';
  readonly artifactDigest: string;
  readonly artifact: 'original' | 'overlay';
  readonly anchorKind: string;
  readonly anchorValue: string;
}

export interface InventoryAssertion {
  readonly id: string;
  readonly statement: string;
  readonly status: 'asserted' | 'superseded' | 'retracted';
  readonly stratum: string;
  readonly evidenceLinkCount: number;
  readonly evidence: readonly HistoricalEvidenceLink[];
}

export interface InventoryUnresolvedQuestion {
  readonly id: string;
  readonly question: string;
  readonly reason: string;
  readonly stratum?: string;
}

export interface InventoryConflict {
  readonly id: string;
  readonly assertionIds: readonly string[];
  readonly stratum: string;
  readonly derivation: { readonly source: string; readonly version: string };
}

export interface InventoryDetail extends InventoryRow {
  readonly assertions: readonly InventoryAssertion[];
  readonly unresolvedQuestion?: InventoryUnresolvedQuestion;
  readonly conflict?: InventoryConflict;
}

export interface InventoryProjectionResponse {
  readonly summary: InventorySummary;
  readonly rows: readonly InventoryRow[];
}

export interface InventoryDetailResponse {
  readonly detail: InventoryDetail;
}

export class InventoryApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'InventoryApiError';
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }
  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload && 'error' in payload && typeof payload.error === 'object' && payload.error
        ? 'message' in payload.error && typeof payload.error.message === 'string'
          ? payload.error.message
          : 'Inventory data is unavailable.'
        : 'Inventory data is unavailable.';
    throw new InventoryApiError(response.status, message);
  }
  return payload as T;
}

export const inventoryApi = {
  projection(signal?: AbortSignal): Promise<InventoryProjectionResponse> {
    return get<InventoryProjectionResponse>('/api/inventory', signal);
  },
  detail(targetId: string, signal?: AbortSignal): Promise<InventoryDetailResponse> {
    return get<InventoryDetailResponse>(`/api/inventory/${encodeURIComponent(targetId)}`, signal);
  },
};
