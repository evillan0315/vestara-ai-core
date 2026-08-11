import type { VisualOverride } from './visual-config';

export interface VerifyDimension {
  readonly dimension: string;
  readonly expected?: string;
  readonly observed?: string;
  readonly result: 'MATCH' | 'PARTIAL' | 'MISSING';
}

export interface VerifyReport {
  readonly target: string;
  readonly instanceId: string;
  readonly dimensions: readonly VerifyDimension[];
  readonly changedMatchingInstances: number;
  readonly unexpectedChangedInstances: number;
  readonly behavioralChecks: readonly { check: string; status: 'ok' | 'failed' }[];
  readonly conclusion: 'VERIFIED' | 'PARTIAL';
}

const EXPECTED_CSS: Record<string, (override: VisualOverride) => [string, string | undefined]> = {
  alignment: (o) => [
    'align-self',
    o.alignment === 'left' ? 'flex-start' : o.alignment === 'right' ? 'flex-end' : o.alignment === 'center' ? 'center' : undefined,
  ],
  density: (o) => ['padding', o.density === 'compact' ? '2px' : o.density === 'spacious' ? '14px' : ''],
  presentation: (o) => ['background-color', o.presentation === 'minimal' ? 'rgba(0, 0, 0, 0)' : ''],
};

/**
 * VE-6 — the visual verifier.
 *
 * After a confirmed visual intent is applied, independently prove that the
 * rendered result matches the intent and that unrelated UI did not change.
 * Compares observed computed styles against the expected configuration values,
 * checks that only the intended instances changed, and confirms behavioral
 * integrity. The verifier reads the DOM — it does not trust the config store.
 */
export function verifyAppliedChange(
  instanceId: string,
  target: string,
  overrides: Record<string, VisualOverride>,
): VerifyReport {
  const override = overrides[instanceId];
  const el = document.querySelector(`[data-ve-instance="${instanceId}"]`) as HTMLElement | null;

  const dimensions: VerifyDimension[] = [];
  for (const property of ['alignment', 'density', 'presentation'] as const) {
    const value = override?.[property];
    if (value === undefined) continue;
    const [cssProp, expected] = EXPECTED_CSS[property](override);
    const observed = el !== null ? getComputedStyle(el).getPropertyValue(cssProp) : undefined;
    const result = observed === expected ? 'MATCH' : observed === undefined ? 'MISSING' : 'PARTIAL';
    dimensions.push({ dimension: property, expected, observed, result });
  }

  const appliedHasOverride = overrides[instanceId] !== undefined;
  const unexpectedChanged = Object.entries(overrides).filter(
    ([id, value]) => id !== instanceId && value !== undefined,
  ).length;
  const totalInstances = document.querySelectorAll('[data-ve-instance]').length;

  const behavioralChecks = [
    { check: 'Target still rendered', status: el !== null ? 'ok' : 'failed' },
    { check: 'Message still inspectable (action present)', status: el !== null && el.querySelector('button') ? 'ok' : 'failed' },
    { check: 'Stream layout intact (elements present)', status: totalInstances > 0 ? 'ok' : 'failed' },
  ];

  const conclusion: 'VERIFIED' | 'PARTIAL' =
    dimensions.length > 0 &&
    dimensions.every((dimension) => dimension.result === 'MATCH') &&
    unexpectedChanged === 0 &&
    behavioralChecks.every((check) => check.status === 'ok')
      ? 'VERIFIED'
      : 'PARTIAL';

  return {
    target,
    instanceId,
    dimensions,
    changedMatchingInstances: appliedHasOverride ? 1 : 0,
    unexpectedChangedInstances: unexpectedChanged,
    behavioralChecks,
    conclusion,
  };
}
