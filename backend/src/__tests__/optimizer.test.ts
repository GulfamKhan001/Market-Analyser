import { describe, it, expect } from 'vitest';
import { kellyPositionSize, regimeAdjustedSize } from '../portfolio/optimizer';

describe('kellyPositionSize', () => {
  it('returns 0 for zero portfolio value', () => {
    expect(kellyPositionSize(0.6, 0.05, 0.03, 0, 0.5)).toBe(0);
  });

  it('returns 0 for zero avg win', () => {
    expect(kellyPositionSize(0.6, 0, 0.03, 100000, 0.5)).toBe(0);
  });

  it('returns 0 for zero avg loss', () => {
    expect(kellyPositionSize(0.6, 0.05, 0, 100000, 0.5)).toBe(0);
  });

  it('calculates positive Kelly size for favorable edge', () => {
    // winProb=0.6, avgWin=0.05, avgLoss=0.03, portfolio=100000, fraction=0.5
    // Kelly fraction * (winProb/avgLoss - losProb/avgWin) * portfolioValue
    // = 0.5 * (0.6/0.03 - 0.4/0.05) * 100000 = 0.5 * (20 - 8) * 100000 = 600000
    const size = kellyPositionSize(0.6, 0.05, 0.03, 100000, 0.5);
    expect(size).toBeGreaterThan(0);
    expect(size).toBe(600000);
  });

  it('returns 0 when edge is negative', () => {
    // winProb=0.3 (low), loses most of the time
    const size = kellyPositionSize(0.3, 0.02, 0.05, 100000, 0.5);
    expect(size).toBe(0);
  });

  it('half-Kelly produces half the full Kelly', () => {
    const full = kellyPositionSize(0.6, 0.05, 0.03, 100000, 1.0);
    const half = kellyPositionSize(0.6, 0.05, 0.03, 100000, 0.5);
    expect(half).toBeCloseTo(full / 2, 1);
  });

  it('scales linearly with portfolio value', () => {
    const small = kellyPositionSize(0.6, 0.05, 0.03, 50000, 0.5);
    const large = kellyPositionSize(0.6, 0.05, 0.03, 100000, 0.5);
    expect(large).toBeCloseTo(small * 2, 0);
  });
});

describe('regimeAdjustedSize', () => {
  it('RISK_ON applies factor 1.0', () => {
    expect(regimeAdjustedSize(1000, 'RISK_ON')).toBe(1000);
  });

  it('NEUTRAL applies factor 0.75', () => {
    expect(regimeAdjustedSize(1000, 'NEUTRAL')).toBe(750);
  });

  it('RISK_OFF applies factor 0.5', () => {
    expect(regimeAdjustedSize(1000, 'RISK_OFF')).toBe(500);
  });

  it('CRISIS applies factor 0.25', () => {
    expect(regimeAdjustedSize(1000, 'CRISIS')).toBe(250);
  });

  it('unknown regime defaults to 0.75', () => {
    expect(regimeAdjustedSize(1000, 'UNKNOWN')).toBe(750);
  });

  it('handles zero base size', () => {
    expect(regimeAdjustedSize(0, 'RISK_ON')).toBe(0);
  });
});
