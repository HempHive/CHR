import { spansConflict } from '@/domain/dates';
import { duplicateKey } from '@/domain/ids';
import { displayName, hasAnyName } from '@/domain/names';
import { foldName } from '@/domain/search';
import type { Issue, Person, Relationship } from '@/domain/types';
import { assignGenerations, parentsOf } from '@/genealogy/graph';

export interface DuplicateCandidate {
  personIds: [string, string];
  reason: string;
  key: string;
}

export function relationshipSaveIssues(
  relationship: Relationship,
  people: Person[],
  relationships: Relationship[],
): Issue[] {
  const issues: Issue[] = [];
  const ids = new Set(people.map((person) => person.id));
  if (relationship.fromPersonId === relationship.toPersonId) {
    issues.push({
      severity: 'error',
      code: 'self-relationship',
      message: 'A person cannot be recorded in a relationship with themselves.',
      relationshipId: relationship.id,
    });
    return issues;
  }
  if (!ids.has(relationship.fromPersonId) || !ids.has(relationship.toPersonId)) {
    issues.push({
      severity: 'error',
      code: 'missing-person',
      message: 'Both people in a relationship must already exist in this archive.',
      relationshipId: relationship.id,
    });
  }
  if (relationship.kind === 'custom' && !relationship.customLabel.trim()) {
    issues.push({
      severity: 'error',
      code: 'missing-label',
      message: 'A custom relationship needs a description.',
      relationshipId: relationship.id,
    });
  }

  const duplicate = relationships.find((existing) => existing.id !== relationship.id && sameClaim(existing, relationship));
  if (duplicate) {
    issues.push({
      severity: 'error',
      code: 'duplicate-relationship',
      message: 'This relationship is already recorded.',
      relationshipId: relationship.id,
    });
  }

  const conflictingParentage = relationships.find(
    (existing) =>
      existing.id !== relationship.id &&
      relationship.kind === 'parent_child' &&
      existing.kind === 'parent_child' &&
      existing.fromPersonId === relationship.fromPersonId &&
      existing.toPersonId === relationship.toPersonId &&
      existing.parentage !== relationship.parentage,
  );
  if (conflictingParentage) {
    issues.push({
      severity: 'warning',
      code: 'conflicting-parentage',
      message: 'Another parental claim between these people uses a different type. Both claims will be kept.',
      relationshipId: relationship.id,
    });
  }

  const next = relationships.filter((existing) => existing.id !== relationship.id).concat(relationship);
  if (hasParentCycle(next)) {
    issues.push({
      severity: 'warning',
      code: 'parent-cycle',
      message: 'This parent link creates a cycle. It will be kept so the dispute is not discarded, and the tree will mark the archive as contradictory.',
      relationshipId: relationship.id,
    });
  }

  const child = people.find((person) => person.id === relationship.toPersonId);
  const parent = people.find((person) => person.id === relationship.fromPersonId);
  if (relationship.kind === 'parent_child' && child && parent) {
    if (spansConflict(parent.birthDate, child.birthDate)) {
      issues.push({
        severity: 'warning',
        code: 'child-before-parent',
        message: 'The recorded dates have the child born before the parent. The relationship will still be saved.',
        relationshipId: relationship.id,
        personId: child.id,
      });
    }
  }
  return issues;
}

function sameClaim(left: Relationship, right: Relationship): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'parent_child') {
    return (
      left.fromPersonId === right.fromPersonId &&
      left.toPersonId === right.toPersonId &&
      left.parentage === right.parentage
    );
  }
  const samePair =
    (left.fromPersonId === right.fromPersonId && left.toPersonId === right.toPersonId) ||
    (left.fromPersonId === right.toPersonId && left.toPersonId === right.fromPersonId);
  if (!samePair) return false;
  if (left.kind === 'partnership') return left.partnershipType === right.partnershipType;
  if (left.kind === 'sibling') return left.siblingDegree === right.siblingDegree;
  return left.customLabel.trim().toLowerCase() === right.customLabel.trim().toLowerCase();
}

export function hasParentCycle(relationships: Relationship[]): boolean {
  const children = new Map<string, string[]>();
  for (const relationship of relationships) {
    if (relationship.kind !== 'parent_child') continue;
    const list = children.get(relationship.fromPersonId) ?? [];
    list.push(relationship.toPersonId);
    children.set(relationship.fromPersonId, list);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (personId: string): boolean => {
    if (visiting.has(personId)) return true;
    if (visited.has(personId)) return false;
    visiting.add(personId);
    for (const childId of children.get(personId) ?? []) {
      if (walk(childId)) return true;
    }
    visiting.delete(personId);
    visited.add(personId);
    return false;
  };
  for (const relationship of relationships) {
    if (relationship.kind === 'parent_child' && walk(relationship.fromPersonId)) return true;
  }
  return false;
}

export function personDateIssues(person: Person): Issue[] {
  const issues: Issue[] = [];
  if (spansConflict(person.birthDate, person.deathDate)) {
    issues.push({
      severity: 'warning',
      code: 'death-before-birth',
      message: `${displayName(person)} has a death date that falls before the birth date. Both dates are kept.`,
      personId: person.id,
    });
  }
  return issues;
}

export function archiveIssues(people: Person[], relationships: Relationship[]): Issue[] {
  const issues: Issue[] = [];
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const seenPeople = new Set<string>();
  for (const person of people) {
    if (seenPeople.has(person.id)) {
      issues.push({
        severity: 'error',
        code: 'duplicate-person-id',
        message: `More than one person uses the identifier ${person.id}.`,
        personId: person.id,
      });
    }
    seenPeople.add(person.id);
    issues.push(...personDateIssues(person));
  }
  const seenRelationships = new Set<string>();
  for (const relationship of relationships) {
    if (seenRelationships.has(relationship.id)) {
      issues.push({
        severity: 'error',
        code: 'duplicate-relationship-id',
        message: `More than one relationship uses the identifier ${relationship.id}.`,
        relationshipId: relationship.id,
      });
    }
    seenRelationships.add(relationship.id);
    if (relationship.fromPersonId === relationship.toPersonId) {
      issues.push({
        severity: 'error',
        code: 'self-relationship',
        message: 'A relationship connects a person to themselves.',
        relationshipId: relationship.id,
      });
    }
    for (const personId of [relationship.fromPersonId, relationship.toPersonId]) {
      if (!peopleById.has(personId)) {
        issues.push({
          severity: 'error',
          code: 'dangling-relationship',
          message: 'A relationship points to a person who is not in this archive.',
          relationshipId: relationship.id,
          personId,
        });
      }
    }
    if (peopleById.get(relationship.fromPersonId)?.archiveId && relationship.archiveId) {
      const from = peopleById.get(relationship.fromPersonId);
      const to = peopleById.get(relationship.toPersonId);
      if ((from && from.archiveId !== relationship.archiveId) || (to && to.archiveId !== relationship.archiveId)) {
        issues.push({
          severity: 'error',
          code: 'archive-mismatch',
          message: 'A relationship points outside its archive.',
          relationshipId: relationship.id,
        });
      }
    }
  }
  if (hasParentCycle(relationships)) {
    issues.push({
      severity: 'warning',
      code: 'parent-cycle',
      message: 'Parent links form a cycle. The records are kept because the contradiction may be historically meaningful.',
    });
  }
  const { cyclic } = assignGenerations(people, relationships);
  if (cyclic && !issues.some((issue) => issue.code === 'parent-cycle')) {
    issues.push({
      severity: 'warning',
      code: 'parent-cycle',
      message: 'Generation numbering did not settle, which indicates a parent cycle.',
    });
  }
  for (const person of people) {
    const parentIds = parentsOf(person.id, relationships).map((relationship) => relationship.fromPersonId);
    for (const relationship of relationships) {
      if (relationship.kind !== 'parent_child') continue;
      if (relationship.toPersonId === person.id && parentIds.includes(relationship.toPersonId)) {
        issues.push({
          severity: 'warning',
          code: 'parent-is-child',
          message: `${displayName(person)} is recorded both above and below the same parental line.`,
          personId: person.id,
        });
      }
    }
  }
  return issues;
}

export function findPossibleDuplicates(people: Person[], dismissed: readonly string[] = []): DuplicateCandidate[] {
  const dismissedSet = new Set(dismissed);
  const candidates: DuplicateCandidate[] = [];
  for (let index = 0; index < people.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < people.length; otherIndex += 1) {
      const left = people[index];
      const right = people[otherIndex];
      const leftName = foldName(displayName(left));
      const rightName = foldName(displayName(right));
      if (!hasAnyName(left) || !hasAnyName(right)) continue;
      if (!leftName || !rightName || leftName !== rightName) continue;
      if (!birthSpansCompatible(left, right)) continue;
      const key = duplicateKey(left.id, right.id);
      if (dismissedSet.has(key)) continue;
      candidates.push({
        personIds: [left.id, right.id],
        key,
        reason: 'The same name and compatible birth dates. Nothing has been merged.',
      });
    }
  }
  return candidates;
}

function birthSpansCompatible(left: Person, right: Person): boolean {
  const a = left.birthDate;
  const b = right.birthDate;
  if (!a || !b || a.precision === 'unknown' || b.precision === 'unknown' || !a.start || !b.start) return true;
  const aStart = a.precision === 'approximate' ? a.start.year - 5 : a.precision === 'after' ? a.start.year : a.precision === 'range' ? a.start.year : a.precision === 'before' ? null : a.start.year;
  const aEnd = a.precision === 'approximate' ? a.start.year + 5 : a.precision === 'before' ? a.start.year : a.precision === 'range' ? a.end?.year ?? a.start.year : a.precision === 'after' ? null : a.start.year;
  const bStart = b.precision === 'approximate' ? b.start.year - 5 : b.precision === 'after' ? b.start.year : b.precision === 'range' ? b.start.year : b.precision === 'before' ? null : b.start.year;
  const bEnd = b.precision === 'approximate' ? b.start.year + 5 : b.precision === 'before' ? b.start.year : b.precision === 'range' ? b.end?.year ?? b.start.year : b.precision === 'after' ? null : b.start.year;
  if (aEnd !== null && bStart !== null && aEnd < bStart) return false;
  if (bEnd !== null && aStart !== null && bEnd < aStart) return false;
  return true;
}

export function profileGaps(person: Person, relationships: Relationship[]): string[] {
  const gaps: string[] = [];
  if (!person.givenNames.trim() && !person.familyNames.trim() && !person.preferredName.trim()) gaps.push('Name incomplete');
  if (!person.birthDate || person.birthDate.precision === 'unknown') gaps.push('Birth date unknown');
  if (person.livingStatus === 'unknown' && (!person.deathDate || person.deathDate.precision === 'unknown')) {
    gaps.push('Living status unknown');
  }
  const linked = relationships.some(
    (relationship) => relationship.fromPersonId === person.id || relationship.toPersonId === person.id,
  );
  if (!linked) gaps.push('No relationships');
  return gaps;
}
