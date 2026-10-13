import { describe, expect, it } from 'vitest';
import { isSatisfiableSemverRange, isValidSemverRange, minSatisfyingMajor } from '../../tooling/release/semver.js';

describe('semver range parser (N03 review)', () => {
  it('empty || arms never match-all', () => {
    expect(isValidSemverRange('1.0.0 ||')).toBe(false);
    expect(isValidSemverRange('|| 1.0.0')).toBe(false);
    expect(isValidSemverRange('||')).toBe(false);
    expect(isValidSemverRange('>=1.0.0 ||')).toBe(false);
    expect(isValidSemverRange('*')).toBe(true);
    expect(isValidSemverRange('>=0.1.0')).toBe(true);
  });

  it('open-ended ranges past the old probe grid are satisfiable', () => {
    expect(isSatisfiableSemverRange('>5.0.0')).toBe(true);
    expect(isSatisfiableSemverRange('>=999.0.0')).toBe(true);
    expect(minSatisfyingMajor('>5.0.0')).toBe(5);
    expect(isSatisfiableSemverRange('>=2.0.0 <1.0.0')).toBe(false);
  });
});
