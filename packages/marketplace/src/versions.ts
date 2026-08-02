/**
 * Semver parsing, ordering, and stability helpers for catalog versions.
 *
 * Range semantics (`satisfies`) are delegated to `@vestara/extension-runtime`;
 * this module owns structural parsing and ordering only.
 */

export interface ParsedSemver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly (string | number)[];
  readonly build: readonly string[];
}

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function isSemver(version: string): boolean {
  return SEMVER_PATTERN.test(version.trim());
}

export function parseSemver(version: string): ParsedSemver {
  const match = SEMVER_PATTERN.exec(version.trim());
  if (!match) throw new Error(`Invalid semantic version: ${version}`);
  const prerelease = match[4] ? parsePrerelease(match[4]) : [];
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease,
    build: match[5] ? match[5].split('.') : [],
  };
}

function parsePrerelease(raw: string): readonly (string | number)[] {
  return raw.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

/** Stable = no prerelease suffix. */
export function isStable(version: string): boolean {
  return parseSemver(version).prerelease.length === 0;
}

function comparePrerelease(a: readonly (string | number)[], b: readonly (string | number)[]): number {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (left === undefined) return -1; // a has fewer identifiers → a is newer
    if (right === undefined) return 1;
    if (typeof left === 'number' && typeof right === 'number') {
      if (left !== right) return left - right;
      continue;
    }
    if (typeof left === 'number') return -1; // numeric < alphanumeric
    if (typeof right === 'number') return 1;
    const compared = left.localeCompare(right);
    if (compared !== 0) return compared;
  }
  return 0;
}

/** Compare two semver strings. Returns <0, 0, >0. Prerelease < release. */
export function compareSemver(left: string, right: string): number {
  const a = parseSemver(left);
  const b = parseSemver(right);
  for (const field of ['major', 'minor', 'patch'] as const) {
    const difference = a[field] - b[field];
    if (difference !== 0) return difference;
  }
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
  if (a.prerelease.length === 0) return 1; // release > prerelease
  if (b.prerelease.length === 0) return -1;
  return comparePrerelease(a.prerelease, b.prerelease);
}

/** Descending sort (newest first), stable for equal versions. */
export function sortVersionsDesc(versions: readonly string[]): string[] {
  return [...versions].sort((a, b) => {
    const compared = compareSemver(b, a);
    return compared !== 0 ? compared : a.localeCompare(b);
  });
}

/** Highest version overall (prereleases included). */
export function latestVersion(versions: readonly string[]): string | undefined {
  return sortVersionsDesc(versions)[0];
}

/** Highest stable version, falling back to the highest overall when none is stable. */
export function latestStableVersion(versions: readonly string[]): string | undefined {
  const descending = sortVersionsDesc(versions);
  return descending.find(isStable) ?? descending[0];
}

/** Select the newest version satisfying `range` (stable preferred). */
export function selectVersion(
  versions: readonly string[],
  range: string | undefined,
  satisfies: (version: string, range: string) => boolean,
): string | undefined {
  if (!range || range === '*' || range === 'latest') return latestStableVersion(versions);
  const candidates = sortVersionsDesc(versions).filter((version) => satisfies(version, range));
  return candidates.find(isStable) ?? candidates[0];
}

export function versionBumpType(current: string, target: string): 'major' | 'minor' | 'patch' | 'prerelease' {
  if (compareSemver(target, current) <= 0) return 'prerelease';
  const a = parseSemver(current);
  const b = parseSemver(target);
  if (b.major > a.major) return 'major';
  if (b.minor > a.minor) return 'minor';
  return 'patch';
}
