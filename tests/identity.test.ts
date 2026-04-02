import { describe, it, expect } from 'vitest';
import { generatePseudonym, resolveDisplayName } from '../src/peer/identity.js';

describe('generatePseudonym', () => {
  it('produces adjective-animal format', () => {
    const name = generatePseudonym('abc123');
    expect(name).toMatch(/^[a-z]+-[a-z]+$/);
  });

  it('is deterministic for same input', () => {
    const a = generatePseudonym('test-uuid-1');
    const b = generatePseudonym('test-uuid-1');
    expect(a).toBe(b);
  });

  it('produces different names for different inputs', () => {
    const a = generatePseudonym('uuid-aaa');
    const b = generatePseudonym('uuid-bbb');
    expect(a).not.toBe(b);
  });
});

describe('resolveDisplayName', () => {
  it('returns pseudonym when identity is pseudo', () => {
    const name = resolveDisplayName('some-uuid', {
      identity: 'pseudo',
      displayName: null,
    });
    expect(name).toMatch(/^[a-z]+-[a-z]+$/);
  });

  it('returns custom displayName when set', () => {
    const name = resolveDisplayName('some-uuid', {
      identity: 'pseudo',
      displayName: 'CustomName',
    });
    expect(name).toBe('CustomName');
  });

  it('returns gitName when identity is git and gitName provided', () => {
    const name = resolveDisplayName('some-uuid', {
      identity: 'git',
      displayName: null,
      gitName: 'Nakul Bharti',
    });
    expect(name).toBe('Nakul Bharti');
  });

  it('falls back to pseudonym when git identity requested but no gitName', () => {
    const name = resolveDisplayName('some-uuid', {
      identity: 'git',
      displayName: null,
      gitName: undefined,
    });
    expect(name).toMatch(/^[a-z]+-[a-z]+$/);
  });
});
