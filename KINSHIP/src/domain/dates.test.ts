import { describe, expect, it } from 'vitest';
import { formatFuzzyDate, parseFuzzyDate, sortKey, spansConflict } from '@/domain/dates';

describe('dates', () => {
  it('keeps exact, partial, and uncertain dates distinct', () => {
    const exact = parseFuzzyDate('2 April 1888');
    expect(exact).toMatchObject({ precision: 'exact', original: '2 April 1888', start: { year: 1888, month: 4, day: 2 } });
    expect(parseFuzzyDate('1888-04-02')?.precision).toBe('exact');
    expect(parseFuzzyDate('1918')).toMatchObject({ precision: 'year', start: { year: 1918 } });
    expect(parseFuzzyDate('March 1922')).toMatchObject({ precision: 'month', start: { year: 1922, month: 3 } });
    expect(parseFuzzyDate('c. 1892')).toMatchObject({ precision: 'approximate', original: 'c. 1892', start: { year: 1892 } });
    expect(parseFuzzyDate('before 1920')?.precision).toBe('before');
    expect(parseFuzzyDate('after 1990')?.precision).toBe('after');
    expect(parseFuzzyDate('1920-1925')).toMatchObject({ precision: 'range', start: { year: 1920 }, end: { year: 1925 } });
    expect(parseFuzzyDate('1920s')).toMatchObject({ precision: 'range', end: { year: 1929 } });
    expect(parseFuzzyDate('unknown')?.precision).toBe('unknown');
    expect(parseFuzzyDate('')).toBeNull();
  });

  it('does not turn an approximate year into an exact day', () => {
    const date = parseFuzzyDate('about 1892');
    expect(date?.precision).toBe('approximate');
    expect(date?.start).toEqual({ year: 1892 });
    expect(sortKey(date)).toBe(18920000);
    expect(formatFuzzyDate(date)).toBe('c. 1892');
  });

  it('reads slash dates as day/month/year and falls back when that is impossible', () => {
    expect(parseFuzzyDate('15/03/1920')?.start).toEqual({ year: 1920, month: 3, day: 15 });
    expect(parseFuzzyDate('03/15/1920')?.start).toEqual({ year: 1920, month: 3, day: 15 });
  });

  it('keeps impossible calendar text without inventing a day', () => {
    const date = parseFuzzyDate('31 April 1920');
    expect(date?.precision).toBe('unknown');
    expect(date?.original).toBe('31 April 1920');
    expect(date?.start).toBeUndefined();
  });

  it('does not call overlapping uncertain dates a contradiction', () => {
    const birth = parseFuzzyDate('c. 1892');
    const death = parseFuzzyDate('1968');
    expect(spansConflict(birth, death)).toBe(false);
    expect(spansConflict(parseFuzzyDate('1980'), parseFuzzyDate('1970'))).toBe(true);
  });
});
