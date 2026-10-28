import { formatFuzzyDate } from '@/domain/dates';
import type { FuzzyDate, Person } from '@/domain/types';

export function displayName(
  person: Pick<Person, 'preferredName' | 'givenNames' | 'familyNames' | 'birthName' | 'names'>,
): string {
  if (person.preferredName.trim()) return person.preferredName.trim();
  const combined = [person.givenNames, person.familyNames]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
  if (combined) return combined;
  if (person.birthName.trim()) return person.birthName.trim();
  const alternate = person.names.find((name) => name.value.trim());
  if (alternate) return alternate.value.trim();
  return 'Unnamed person';
}

export function fullName(
  person: Pick<Person, 'givenNames' | 'middleNames' | 'familyNames' | 'preferredName' | 'birthName' | 'names'>,
): string {
  const parts = [person.givenNames, person.middleNames, person.familyNames]
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.join(' ') || displayName(person);
}

export function initials(name: string): string {
  const words = name
    .replace(/[()]/g, ' ')
    .split(/\s+/)
    .filter((word) => /[A-Za-z]/.test(word));
  if (words.length === 0) return '•';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

function knownLabel(date: FuzzyDate | null): string {
  if (!date || date.precision === 'unknown') return '';
  return formatFuzzyDate(date);
}

export function lifespanLabel(person: Pick<Person, 'birthDate' | 'deathDate' | 'livingStatus'>): string {
  const birthLabel = knownLabel(person.birthDate);
  const deathLabel = knownLabel(person.deathDate);
  if (person.livingStatus === 'living') {
    return birthLabel ? `${birthLabel} – present` : 'Living';
  }
  if (birthLabel && deathLabel) return `${birthLabel} – ${deathLabel}`;
  if (birthLabel) return `${birthLabel} – ?`;
  if (deathLabel) return `? – ${deathLabel}`;
  return 'Dates unknown';
}

export function hasAnyName(
  person: Pick<Person, 'preferredName' | 'givenNames' | 'familyNames' | 'birthName' | 'names'>,
): boolean {
  if (person.preferredName.trim() || person.givenNames.trim() || person.familyNames.trim() || person.birthName.trim()) {
    return true;
  }
  return person.names.some((name) => name.value.trim());
}

export function presentationName(person: Person, concealLiving: boolean): string {
  if (concealLiving && person.livingStatus === 'living') return 'Living person';
  return displayName(person);
}
