/**
 * Minimal semantic-version range parser (N03): replaces the approximate
 * charset regex with structural parsing plus satisfiability checks.
 * Supports `*`/`x` wildcards, exact versions, `^`/`~`/`>=`/`<=`/`>`/`<`/`=`,
 * hyphen ranges (`1.0.0 - 2.0.0`), space-separated comparator sets (AND)
 * and `||` unions, with prerelease handling. No new runtime dependency.
 */

export interface Semver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly string[];
}

const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** Parse a strict `X.Y.Z[-prerelease]` version; undefined when malformed. */
export function parseSemver(text: string): Semver | undefined {
  const m = text.trim().match(VERSION_RE);
  if (m === null) {
    return undefined;
  }
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] === undefined ? [] : m[4].split('.'),
  };
}

/** Compare two versions: negative/zero/positive. Prerelease < release. */
export function compareSemver(a: Semver, b: Semver): number {
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (a[key] !== b[key]) {
      return a[key] < b[key] ? -1 : 1;
    }
  }
  if (a.prerelease.length === 0 && b.prerelease.length === 0) {
    return 0;
  }
  if (a.prerelease.length === 0) {
    return 1;
  }
  if (b.prerelease.length === 0) {
    return -1;
  }
  const len = Math.max(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < len; i += 1) {
    const x = a.prerelease[i];
    const y = b.prerelease[i];
    if (x === undefined) {
      return -1;
    }
    if (y === undefined) {
      return 1;
    }
    if (x === y) {
      continue;
    }
    const xn = /^\d+$/.test(x) ? Number(x) : undefined;
    const yn = /^\d+$/.test(y) ? Number(y) : undefined;
    if (xn !== undefined && yn !== undefined) {
      return xn < yn ? -1 : 1;
    }
    return x < y ? -1 : 1;
  }
  return 0;
}

type Comparator = (v: Semver) => boolean;

function comparatorFromToken(op: string, ver: Semver): Comparator {
  switch (op) {
    case '':
    case '=':
      return (v) => compareSemver(v, ver) === 0;
    case '>':
      return (v) => compareSemver(v, ver) > 0;
    case '>=':
      return (v) => compareSemver(v, ver) >= 0;
    case '<':
      return (v) => compareSemver(v, ver) < 0;
    case '<=':
      return (v) => compareSemver(v, ver) <= 0;
    case '^':
      return (v) => {
        if (compareSemver(v, ver) < 0) {
          return false;
        }
        if (ver.major > 0) {
          return v.major === ver.major;
        }
        if (ver.minor > 0) {
          return v.major === 0 && v.minor === ver.minor;
        }
        return v.major === 0 && v.minor === 0 && v.patch === ver.patch;
      };
    case '~':
      return (v) => compareSemver(v, ver) >= 0 && v.major === ver.major && v.minor === ver.minor;
    default:
      return () => false;
  }
}

const OP_RE = /^(v|=|>=|<=|>|<|\^|~)?(.*)$/;

/** Parse one `||`-separated union arm into ANDed comparators. */
function parseUnionArm(arm: string): Comparator[] | undefined {
  const text = arm.trim();
  // N-review: an empty arm (from a leading/trailing/doubled `||`) matches
  // nothing — only a bare `*`/`x` is the match-all wildcard.
  if (text === '') {
    return undefined;
  }
  if (text === '*' || /^[xX]$/.test(text)) {
    return [() => true];
  }
  // Hyphen range: `1.0.0 - 2.0.0` (spaces required around the hyphen).
  const hyphen = text.match(/^(\S+)\s+-\s+(\S+)$/);
  if (hyphen !== null) {
    const lo = parseSemver(hyphen[1] as string);
    const hi = parseSemver(hyphen[2] as string);
    if (lo === undefined || hi === undefined || compareSemver(lo, hi) > 0) {
      return undefined;
    }
    return [(v) => compareSemver(v, lo) >= 0 && compareSemver(v, hi) <= 0];
  }
  const comparators: Comparator[] = [];
  for (const chunk of text.split(/\s+/)) {
    // Wildcard majors (`1.x`, `1.*`) match any minor/patch of that major.
    const wild = chunk.match(/^v?(\d+)\.[xX*](?:\.[xX*])?$/);
    if (wild !== null) {
      const major = Number(wild[1]);
      comparators.push((v) => v.major === major);
      continue;
    }
    const m = chunk.match(OP_RE);
    if (m === null) {
      return undefined;
    }
    const ver = parseSemver(m[2] as string);
    if (ver === undefined) {
      return undefined;
    }
    comparators.push(comparatorFromToken(m[1] as string, ver));
  }
  return comparators.length > 0 ? comparators : undefined;
}

/** True when the range is structurally valid (rejects `1..2`, `=>=>=`). */
export function isValidSemverRange(range: string): boolean {
  const trimmed = range.trim();
  if (trimmed.length === 0 || trimmed.length > 64) {
    return false;
  }
  for (const arm of trimmed.split(/\s*\|\|\s*/)) {
    if (parseUnionArm(arm) === undefined) {
      return false;
    }
  }
  return true;
}

/** True when at least one concrete version satisfies the range. */
export function isSatisfiableSemverRange(range: string): boolean {
  if (!isValidSemverRange(range)) {
    return false;
  }
  // Probe the same major grid as minSatisfyingMajor (0..999) plus the
  // range's own bounds and their successors — a bound like `>5.0.0` is
  // satisfied by 5.0.1, which a 0..3 grid plus the bound itself misses.
  const arms = range.trim().split(/\s*\|\|\s*/).map(parseUnionArm) as Comparator[][];
  const candidates: Semver[] = [];
  for (let major = 0; major <= 999; major += 1) {
    candidates.push({ major, minor: 0, patch: 0, prerelease: [] });
  }
  const boundVersions = [...range.matchAll(/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/g)]
    .map((m) => parseSemver(m[1] as string))
    .filter((v) => v !== undefined) as Semver[];
  for (const b of boundVersions) {
    candidates.push(b);
    candidates.push({ major: b.major, minor: b.minor, patch: b.patch + 1, prerelease: [] });
    candidates.push({ major: b.major, minor: b.minor + 1, patch: 0, prerelease: [] });
  }
  return arms.some((comparators) => candidates.some((v) => comparators.every((c) => c(v))));
}

/** Minimum satisfiable major version, if any (for supported-tuple gates). */
export function minSatisfyingMajor(range: string): number | undefined {
  if (!isValidSemverRange(range)) {
    return undefined;
  }
  const arms = range.trim().split(/\s*\|\|\s*/).map(parseUnionArm) as Comparator[][];
  const boundVersions = [...range.matchAll(/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/g)]
    .map((m) => parseSemver(m[1] as string))
    .filter((v) => v !== undefined) as Semver[];
  for (let major = 0; major <= 999; major += 1) {
    const probes: Semver[] = [{ major, minor: 0, patch: 0, prerelease: [] }];
    for (const minor of [1, 2, 5, 9]) {
      for (const patch of [0, 1]) {
        probes.push({ major, minor, patch, prerelease: [] });
      }
    }
    for (const b of boundVersions) {
      if (b.major === major) {
        probes.push(b);
      }
    }
    if (probes.some((probe) => arms.some((comparators) => comparators.every((c) => c(probe))))) {
      return major;
    }
  }
  return undefined;
}
