import { displayName } from '@/domain/names';
import type { Person, Relationship } from '@/domain/types';

export interface SearchHit {
  personId: string;
  title: string;
  excerpt: string;
  score: number;
  kind: 'person' | 'relationship';
}

export function foldName(value: string): string {
  let folded = value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  folded = folded.replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/ß/g, 'ss');
  folded = folded.replace(/ph/g, 'f').replace(/ck/g, 'k');
  folded = folded.replace(/[^a-z0-9]+/g, '');
  folded = folded.replace(/(.)\1+/g, '$1');
  return folded;
}

function levenshtein(left: string, right: string): number {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = i - 1;
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const current = row[j];
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + cost);
      previous = current;
    }
  }
  return row[right.length];
}

function personSearchText(person: Person): string {
  return [
    person.givenNames,
    person.middleNames,
    person.familyNames,
    person.preferredName,
    person.birthName,
    ...person.names.map((name) => `${name.value} ${name.notes}`),
    person.birthPlace,
    person.deathPlace,
    person.biography,
    person.researchNotes,
    person.gender ?? '',
    ...person.nationalities,
    ...person.occupations.flatMap((item) => [item.title, item.place, item.notes]),
    ...person.education.flatMap((item) => [item.institution, item.place, item.notes]),
    ...person.residences.flatMap((item) => [item.place, item.notes]),
    person.birthDate?.original ?? '',
    person.deathDate?.original ?? '',
  ]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreText(query: string, text: string): number {
  const foldedQuery = foldName(query);
  const foldedText = foldName(text);
  if (!foldedQuery || !foldedText) return 0;
  if (foldedText === foldedQuery) return 100;
  if (foldedText.startsWith(foldedQuery)) return 80;
  const tokens = text.split(/[^A-Za-z0-9]+/).filter(Boolean);
  let best = 0;
  for (const token of tokens) {
    const folded = foldName(token);
    if (!folded) continue;
    if (folded === foldedQuery) best = Math.max(best, 70);
    else if (folded.startsWith(foldedQuery)) best = Math.max(best, 60);
    else if (foldedQuery.length >= 4) {
      const distance = levenshtein(foldedQuery, folded);
      const allowed = foldedQuery.length >= 8 ? 2 : 1;
      if (distance <= allowed && distance > 0) best = Math.max(best, 40 - distance * 5);
    }
  }
  if (foldedText.includes(foldedQuery)) best = Math.max(best, 50);
  return best;
}

export function searchArchive(people: Person[], relationships: Relationship[], rawQuery: string): SearchHit[] {
  const query = rawQuery.trim();
  if (query.length < 1) return [];
  const hits: SearchHit[] = [];
  const byId = new Map(people.map((person) => [person.id, person]));

  for (const person of people) {
    const text = personSearchText(person);
    const score = Math.max(scoreText(query, displayName(person)) , scoreText(query, text));
    if (score <= 0) continue;
    hits.push({
      personId: person.id,
      title: displayName(person),
      excerpt: excerptAround(text, query),
      score: score + (scoreText(query, displayName(person)) >= 70 ? 5 : 0),
      kind: 'person',
    });
  }

  for (const relationship of relationships) {
    const label = [
      relationship.kind,
      relationship.parentage ?? '',
      relationship.partnershipType ?? '',
      relationship.siblingDegree ?? '',
      relationship.customLabel,
      relationship.notes,
    ].join(' ');
    const score = scoreText(query, label);
    if (score <= 0) continue;
    const from = byId.get(relationship.fromPersonId);
    const to = byId.get(relationship.toPersonId);
    if (!from || !to) continue;
    hits.push({
      personId: from.id,
      title: `${displayName(from)} and ${displayName(to)}`,
      excerpt: excerptAround(label, query),
      score: Math.min(score, 45),
      kind: 'relationship',
    });
  }

  return hits.sort((left, right) => right.score - left.score || left.title.localeCompare(right.title));
}

function excerptAround(text: string, query: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const index = clean.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return clean.slice(0, 140);
  const start = Math.max(0, index - 40);
  const slice = clean.slice(start, start + 140);
  return `${start > 0 ? '…' : ''}${slice}${start + 140 < clean.length ? '…' : ''}`;
}

export function paginate<T>(items: readonly T[], page: number, pageSize: number): { page: number; pages: number; items: T[] } {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), pages);
  const start = (safePage - 1) * pageSize;
  return { page: safePage, pages, items: items.slice(start, start + pageSize) };
}
