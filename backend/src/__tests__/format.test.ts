import { describe, it, expect } from 'vitest';
import { formatCurrency, formatPercent, toDateString, startOfDay, daysAgo, today } from '../utils/format';

describe('formatCurrency', () => {
  it('formats USD by default', () => {
    expect(formatCurrency(1234.56)).toBe('$1,234.56');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('formats negative amounts', () => {
    expect(formatCurrency(-500.1)).toBe('-$500.10');
  });

  it('formats with specified currency', () => {
    const result = formatCurrency(1000, 'EUR');
    expect(result).toContain('1,000.00');
  });

  it('handles large numbers', () => {
    expect(formatCurrency(1000000)).toBe('$1,000,000.00');
  });
});

describe('formatPercent', () => {
  it('formats decimal as percentage', () => {
    expect(formatPercent(0.1234)).toBe('12.34%');
  });

  it('formats zero', () => {
    expect(formatPercent(0)).toBe('0.00%');
  });

  it('formats negative values', () => {
    expect(formatPercent(-0.05)).toBe('-5.00%');
  });

  it('respects decimal parameter', () => {
    expect(formatPercent(0.12345, 3)).toBe('12.345%');
    expect(formatPercent(0.12345, 0)).toBe('12%');
  });
});

describe('toDateString', () => {
  it('formats date as YYYY-MM-DD', () => {
    const d = new Date('2024-06-15T10:30:00Z');
    expect(toDateString(d)).toBe('2024-06-15');
  });

  it('handles start of year', () => {
    const d = new Date('2024-01-01T00:00:00Z');
    expect(toDateString(d)).toBe('2024-01-01');
  });
});

describe('startOfDay', () => {
  it('sets time to midnight UTC', () => {
    const d = startOfDay(new Date('2024-06-15T15:30:45Z'));
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d.getUTCSeconds()).toBe(0);
    expect(d.getUTCMilliseconds()).toBe(0);
  });

  it('defaults to today', () => {
    const d = startOfDay();
    const now = new Date();
    expect(d.getUTCFullYear()).toBe(now.getUTCFullYear());
    expect(d.getUTCMonth()).toBe(now.getUTCMonth());
    expect(d.getUTCDate()).toBe(now.getUTCDate());
  });
});

describe('daysAgo', () => {
  it('returns a date N days in the past', () => {
    const d = daysAgo(7);
    const todayStart = startOfDay(new Date());
    const diffMs = todayStart.getTime() - d.getTime();
    const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
    expect(diffDays).toBeGreaterThanOrEqual(6);
    expect(diffDays).toBeLessThanOrEqual(8);
  });

  it('sets time to midnight UTC', () => {
    const d = daysAgo(30);
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
  });
});

describe('today', () => {
  it('returns today at midnight UTC', () => {
    const d = today();
    const now = new Date();
    expect(d.getUTCFullYear()).toBe(now.getUTCFullYear());
    expect(d.getUTCMonth()).toBe(now.getUTCMonth());
    expect(d.getUTCDate()).toBe(now.getUTCDate());
    expect(d.getUTCHours()).toBe(0);
  });
});
