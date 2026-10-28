import { formatFuzzyDate } from '@/domain/dates';
import { displayName, lifespanLabel } from '@/domain/names';
import type { FuzzyDate, Person, Relationship } from '@/domain/types';
import { assignGenerations } from '@/genealogy/graph';

export interface ArchiveStats {
  people: number;
  generations: number;
  relationships: number;
  places: number;
  photographs: number;
  documents: number;
  recordings: number;
  living: number;
  deceased: number;
  unknownLivingStatus: number;
}

export function archiveStats(people: Person[], relationships: Relationship[]): ArchiveStats {
  const generations = people.length === 0 ? 0 : generationCount(people, relationships);
  return {
    people: people.length,
    generations,
    relationships: relationships.length,
    places: collectPlaces(people).length,
    photographs: people.reduce((sum, person) => sum + person.photoIds.length, 0),
    documents: people.reduce((sum, person) => sum + person.documentIds.length, 0),
    recordings: people.reduce((sum, person) => sum + person.audioIds.length + person.videoIds.length, 0),
    living: people.filter((person) => person.livingStatus === 'living').length,
    deceased: people.filter((person) => person.livingStatus === 'deceased').length,
    unknownLivingStatus: people.filter((person) => person.livingStatus === 'unknown').length,
  };
}

export function generationCount(people: Person[], relationships: Relationship[]): number {
  if (people.length === 0) return 0;
  const { generations } = assignGenerations(people, relationships);
  const values = [...generations.values()];
  return Math.max(...values) - Math.min(...values) + 1;
}

export function collectPlaces(people: Person[]): string[] {
  const places = new Set<string>();
  for (const person of people) {
    for (const place of [
      person.birthPlace,
      person.deathPlace,
      ...person.residences.map((item) => item.place),
      ...person.occupations.map((item) => item.place),
      ...person.education.map((item) => item.place),
    ]) {
      const trimmed = place.trim();
      if (trimmed) places.add(trimmed);
    }
  }
  return [...places].sort((left, right) => left.localeCompare(right));
}

export interface Anniversary {
  personId: string;
  kind: 'birth' | 'death';
  label: string;
  next: Date;
  observedLeapDay: boolean;
}

export function upcomingAnniversaries(people: Person[], now: Date, concealLiving: boolean, limit = 6): Anniversary[] {
  const items: Anniversary[] = [];
  for (const person of people) {
    if (concealLiving && person.livingStatus === 'living') continue;
    const birth = anniversaryFrom(person, 'birth', now);
    if (birth) items.push(birth);
    if (person.livingStatus !== 'living') {
      const death = anniversaryFrom(person, 'death', now);
      if (death) items.push(death);
    }
  }
  return items.sort((left, right) => left.next.getTime() - right.next.getTime()).slice(0, limit);
}

function anniversaryFrom(person: Person, kind: 'birth' | 'death', now: Date): Anniversary | null {
  const date = kind === 'birth' ? person.birthDate : person.deathDate;
  const parts = calendarDay(date);
  if (!parts) return null;
  const next = nextOccurrence(parts.month, parts.day, now);
  const name = displayName(person);
  let label = kind === 'birth' ? `Birth anniversary of ${name}` : `Death anniversary of ${name}`;
  if (kind === 'birth' && date?.start?.year && date.precision === 'exact') {
    const age = next.date.getFullYear() - date.start.year;
    if (age >= 0) label = `${name} · born ${date.start.year} · year ${age}`;
  }
  if (next.observed) label = `${label} (observed 28 February)`;
  return {
    personId: person.id,
    kind,
    label,
    next: next.date,
    observedLeapDay: next.observed,
  };
}

function calendarDay(date: FuzzyDate | null): { month: number; day: number } | null {
  if (!date || date.precision !== 'exact' || !date.start?.month || !date.start.day) return null;
  return { month: date.start.month, day: date.start.day };
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function nextOccurrence(month: number, day: number, now: Date): { date: Date; observed: boolean } {
  const build = (year: number): { date: Date; observed: boolean } => {
    if (month === 2 && day === 29 && !isLeap(year)) {
      return { date: new Date(year, 1, 28), observed: true };
    }
    return { date: new Date(year, month - 1, day), observed: false };
  };
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisYear = build(today.getFullYear());
  if (thisYear.date >= today) return thisYear;
  return build(today.getFullYear() + 1);
}

export function featuredBiography(people: Person[]): { personId: string; name: string; text: string } | null {
  const withBiography = people.filter((person) => person.biography.trim() && person.livingStatus !== 'living');
  if (withBiography.length === 0) return null;
  const chosen = [...withBiography].sort((left, right) => right.biography.length - left.biography.length || displayName(left).localeCompare(displayName(right)))[0];
  const text = chosen.biography.trim();
  return {
    personId: chosen.id,
    name: displayName(chosen),
    text: text.length > 320 ? `${text.slice(0, 317).trimEnd()}…` : text,
  };
}

export function formatWhen(date: Date): string {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${date.getDate()} ${months[date.getMonth()]}`;
}

export function personSummary(person: Person): string {
  return `${displayName(person)} · ${lifespanLabel(person)} · ${formatFuzzyDate(person.birthDate)}`;
}
