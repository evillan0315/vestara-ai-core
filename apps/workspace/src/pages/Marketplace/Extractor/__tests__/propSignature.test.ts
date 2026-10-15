import { describe, expect, it } from 'vitest';
import { extractSignature } from '../propSignature.js';

const BUNDLE = [
  'var us=Object.create;',
  'var Je=({category:e="other",open:n,className:t="w-[14px] h-[14px]"})=>{return e};',
  'var Np=({branch:e="main",modified:n=!0,insertions:t=12,deletions:r=3,onViewDiff:l})=>{return e};',
  'var Tp=({node:e,depth:n=0})=>{return e};',
  'var Ef=()=>{return null};',
].join('');

describe('extractSignature', () => {
  it('reads renamed props with raw defaults', () => {
    expect(extractSignature(BUNDLE, 'Je')).toEqual([
      { name: 'category', defaultSource: '"other"' },
      { name: 'open', defaultSource: null },
      { name: 'className', defaultSource: '"w-[14px] h-[14px]"' },
    ]);
  });

  it('reads literals, booleans, and numbers', () => {
    expect(extractSignature(BUNDLE, 'Np')).toEqual([
      { name: 'branch', defaultSource: '"main"' },
      { name: 'modified', defaultSource: '!0' },
      { name: 'insertions', defaultSource: '12' },
      { name: 'deletions', defaultSource: '3' },
      { name: 'onViewDiff', defaultSource: null },
    ]);
  });

  it('returns an empty list for a parameterless component', () => {
    expect(extractSignature(BUNDLE, 'Ef')).toEqual([]);
  });

  it('returns null for non-component vars and malformed input', () => {
    expect(extractSignature(BUNDLE, 'us')).toBeNull();
    expect(extractSignature(BUNDLE, 'Missing')).toBeNull();
    expect(extractSignature('var Je=({a:=})=>{}', 'Je')).toBeNull();
    expect(extractSignature('', 'Je')).toBeNull();
    expect(extractSignature(BUNDLE, '')).toBeNull();
  });
});
