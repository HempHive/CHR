import type { DateParts, FuzzyDate } from '@/domain/types';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MONTH_INDEX = new Map(MONTHS.map((name, index) => [name.toLowerCase(), index + 1]));

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isValidParts(parts: DateParts | undefined): boolean {
  if (!parts) return false;
  if (!Number.isInteger(parts.year) || parts.year < 1 || parts.year > 9999) return false;
  if (parts.month === undefined && parts.day !== undefined) return false;
  if (parts.month !== undefined) {
    if (!Number.isInteger(parts.month) || parts.month < 1 || parts.month > 12) return false;
  }
  if (parts.day !== undefined) {
    if (!Number.isInteger(parts.day) || parts.day < 1) return false;
    if (parts.month !== undefined && parts.day > daysInMonth(parts.year, parts.month)) return false;
  }
  return true;
}

function parts(year: number, month?: number, day?: number): DateParts {
  const value: DateParts = { year };
  if (month !== undefined) value.month = month;
  if (day !== undefined) value.day = day;
  return value;
}

function fuzzy(
  precision: FuzzyDate['precision'],
  original: string,
  start?: DateParts,
  end?: DateParts,
): FuzzyDate {
  const date: FuzzyDate = { precision, original };
  if (start) date.start = start;
  if (end) date.end = end;
  return date;
}

/**
 * Interpret a date expression without inventing missing parts.
 * Empty input means "not recorded" and returns null.
 * Text that cannot be interpreted is kept with precision `unknown`.
 * Slash dates are read as day/month/year. If that is impossible, month/day/year is tried.
 */
export function parseFuzzyDate(input: string): FuzzyDate | null {
  const original = input.trim();
  if (!original) return null;
  if (/^(unknown|unk|\?|n\/a|na)$/i.test(original)) {
    return fuzzy('unknown', original);
  }

  const decade = original.match(/^(\d{4})s$/i);
  if (decade) {
    const year = Number(decade[1]);
    if (year >= 1 && year <= 9990) {
      return fuzzy('range', original, parts(year), parts(year + 9));
    }
  }

  const qualified = original.match(
    /^(circa|c\.?|ca\.?|about|abt\.?|around|approximately|~)\s+(\d{4})$/i,
  );
  if (qualified) {
    const year = Number(qualified[2]);
    if (year >= 1 && year <= 9999) return fuzzy('approximate', original, parts(year));
  }

  const before = original.match(/^(before|bef\.?|prior to|pre)\s+(\d{4})$/i);
  if (before) {
    const year = Number(before[2]);
    if (year >= 1 && year <= 9999) return fuzzy('before', original, parts(year));
  }

  const after = original.match(/^(after|aft\.?|post)\s+(\d{4})$/i);
  if (after) {
    const year = Number(after[2]);
    if (year >= 1 && year <= 9999) return fuzzy('after', original, parts(year));
  }

  const between = original.match(
    /^(?:between\s+)?(\d{4})\s*(?:–|—|-|to|\/)\s*(\d{4})$/i,
  );
  if (between) {
    const startYear = Number(between[1]);
    const endYear = Number(between[2]);
    if (startYear >= 1 && endYear <= 9999 && endYear >= startYear) {
      return fuzzy('range', original, parts(startYear), parts(endYear));
    }
  }

  const iso = original.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const value = parts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (isValidParts(value)) return fuzzy('exact', original, value);
    return fuzzy('unknown', original);
  }

  const yearMonth = original.match(/^(\d{4})-(\d{2})$/);
  if (yearMonth) {
    const value = parts(Number(yearMonth[1]), Number(yearMonth[2]));
    if (isValidParts(value)) return fuzzy('month', original, value);
    return fuzzy('unknown', original);
  }

  if (/^\d{4}$/.test(original)) {
    const year = Number(original);
    if (year >= 1 && year <= 9999) return fuzzy('year', original, parts(year));
  }

  const monthName = original.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (monthName) {
    const month = MONTH_INDEX.get(monthName[1].toLowerCase());
    const year = Number(monthName[2]);
    if (month && year >= 1 && year <= 9999) return fuzzy('month', original, parts(year, month));
  }

  const dayMonthName = original.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (dayMonthName) {
    const month = MONTH_INDEX.get(dayMonthName[2].toLowerCase());
    const value = parts(Number(dayMonthName[3]), month, Number(dayMonthName[1]));
    if (month && isValidParts(value)) return fuzzy('exact', original, value);
    return fuzzy('unknown', original);
  }

  const monthDayName = original.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (monthDayName) {
    const month = MONTH_INDEX.get(monthDayName[1].toLowerCase());
    const value = parts(Number(monthDayName[3]), month, Number(monthDayName[2]));
    if (month && isValidParts(value)) return fuzzy('exact', original, value);
    return fuzzy('unknown', original);
  }

  const slash = original.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    const year = Number(slash[3]);
    const dmy = parts(year, second, first);
    if (isValidParts(dmy)) return fuzzy('exact', original, dmy);
    const mdy = parts(year, first, second);
    if (isValidParts(mdy)) return fuzzy('exact', original, mdy);
    return fuzzy('unknown', original);
  }

  return fuzzy('unknown', original);
}

export function formatDateParts(value: DateParts, precision: FuzzyDate['precision']): string {
  const monthName = value.month ? MONTHS[value.month - 1] : '';
  if (precision === 'exact' && value.month && value.day) {
    return `${value.day} ${monthName} ${value.year}`;
  }
  if ((precision === 'month' || value.month) && value.month && value.day === undefined) {
    return `${monthName} ${value.year}`;
  }
  return String(value.year);
}

export function formatFuzzyDate(date: FuzzyDate | null | undefined): string {
  if (!date) return 'Not recorded';
  switch (date.precision) {
    case 'unknown':
      return date.original ? `Uninterpreted (${date.original})` : 'Unknown';
    case 'approximate':
      return date.start ? `c. ${date.start.year}` : date.original;
    case 'before':
      return date.start ? `before ${date.start.year}` : date.original;
    case 'after':
      return date.start ? `after ${date.start.year}` : date.original;
    case 'range':
      if (date.start && date.end) return `${date.start.year}–${date.end.year}`;
      return date.original;
    case 'year':
      return date.start ? String(date.start.year) : date.original;
    case 'month':
      return date.start ? formatDateParts(date.start, 'month') : date.original;
    case 'exact':
      return date.start ? formatDateParts(date.start, 'exact') : date.original;
    default:
      return date.original;
  }
}

/** Inclusive year window used only to compare uncertain dates. It is not stored. */
export function yearSpan(date: FuzzyDate | null | undefined): { start: number | null; end: number | null } | null {
  if (!date || date.precision === 'unknown' || !date.start) return null;
  const year = date.start.year;
  switch (date.precision) {
    case 'exact':
    case 'month':
    case 'year':
      return { start: year, end: year };
    case 'approximate':
      return { start: year - 5, end: year + 5 };
    case 'before':
      return { start: null, end: year };
    case 'after':
      return { start: year, end: null };
    case 'range':
      return { start: year, end: date.end?.year ?? year };
    default:
      return null;
  }
}

export function spansConflict(
  earlier: FuzzyDate | null | undefined,
  later: FuzzyDate | null | undefined,
): boolean {
  const a = yearSpan(earlier);
  const b = yearSpan(later);
  if (!a || !b || a.start === null || b.end === null) return false;
  return b.end < a.start;
}

/**
 * Ordering hint only. Missing month and day sort as 0 and must not be displayed as 1 January.
 * Unknown and uninterpreted dates return null.
 */
export function sortKey(date: FuzzyDate | null | undefined): number | null {
  if (!date || date.precision === 'unknown' || !date.start) return null;
  const month = date.start.month ?? 0;
  const day = date.start.day ?? 0;
  return date.start.year * 10000 + month * 100 + day;
}

export function dateInputValue(date: FuzzyDate | null | undefined): string {
  return date?.original ?? '';
}
