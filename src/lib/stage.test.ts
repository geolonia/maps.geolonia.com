import { describe, expect, it } from 'vitest';
import { nextStage, resolveStage } from './stage';

describe('resolveStage', () => {
  it('defaults to v1', () => {
    expect(resolveStage(null, null)).toBe('v1');
  });

  it('uses the stored stage when the hash has none', () => {
    expect(resolveStage(null, 'dev')).toBe('dev');
  });

  it('prefers the hash over the stored stage', () => {
    expect(resolveStage('v1', 'dev')).toBe('v1');
    expect(resolveStage('dev', 'v1')).toBe('dev');
  });

  it('ignores unknown stages', () => {
    expect(resolveStage('../evil', null)).toBe('v1');
    expect(resolveStage(null, 'staging')).toBe('v1');
    expect(resolveStage('unknown', 'dev')).toBe('dev');
  });
});

describe('nextStage', () => {
  it('toggles between v1 and dev', () => {
    expect(nextStage('v1')).toBe('dev');
    expect(nextStage('dev')).toBe('v1');
  });
});
