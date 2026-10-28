import type { Confidence, Parentage, PartnershipType, Person, Relationship, SiblingDegree } from '@/domain/types';

export function involves(relationship: Relationship, personId: string): boolean {
  return relationship.fromPersonId === personId || relationship.toPersonId === personId;
}

export function otherPersonId(relationship: Relationship, personId: string): string {
  return relationship.fromPersonId === personId ? relationship.toPersonId : relationship.fromPersonId;
}

export function parentsOf(personId: string, relationships: Relationship[]): Relationship[] {
  return relationships.filter((relationship) => relationship.kind === 'parent_child' && relationship.toPersonId === personId);
}

export function childrenOf(personId: string, relationships: Relationship[]): Relationship[] {
  return relationships.filter((relationship) => relationship.kind === 'parent_child' && relationship.fromPersonId === personId);
}

export function partnershipsOf(personId: string, relationships: Relationship[]): Relationship[] {
  return relationships.filter((relationship) => relationship.kind === 'partnership' && involves(relationship, personId));
}

export function parentageLabel(parentage: Parentage | undefined): string {
  switch (parentage) {
    case 'biological':
      return 'Biological parent';
    case 'adoptive':
      return 'Adoptive parent';
    case 'step':
      return 'Step-parent';
    case 'foster':
      return 'Foster parent';
    case 'guardian':
      return 'Guardian';
    case 'custom':
      return 'Parent (custom)';
    default:
      return 'Parent (unspecified)';
  }
}

export function childLabel(parentage: Parentage | undefined): string {
  switch (parentage) {
    case 'biological':
      return 'Child (biological)';
    case 'adoptive':
      return 'Child (adoptive)';
    case 'step':
      return 'Stepchild';
    case 'foster':
      return 'Foster child';
    case 'guardian':
      return 'Child in guardianship';
    case 'custom':
      return 'Child (custom)';
    default:
      return 'Child (unspecified)';
  }
}

export function partnershipLabel(type: PartnershipType | undefined, customLabel: string): string {
  switch (type) {
    case 'spouse':
      return 'Spouse';
    case 'former_spouse':
      return 'Former spouse';
    case 'partner':
      return 'Partner';
    case 'former_partner':
      return 'Former partner';
    case 'custom':
      return customLabel.trim() || 'Partner (custom)';
    default:
      return 'Partner (unspecified)';
  }
}

export function siblingDegreeLabel(degree: SiblingDegree | undefined, customLabel = ''): string {
  switch (degree) {
    case 'full':
      return 'Full sibling';
    case 'half':
      return 'Half-sibling';
    case 'step':
      return 'Step-sibling';
    case 'legal':
      return 'Sibling through care or adoption';
    case 'custom':
      return customLabel.trim() || 'Sibling (custom)';
    default:
      return 'Sibling (unspecified)';
  }
}

export interface FamilyLink {
  relationshipId: string | null;
  otherId: string;
  role: string;
  basis: 'recorded' | 'calculated';
  confidence: Confidence;
  notes: string;
}

export function recordedLinks(personId: string, relationships: Relationship[]): FamilyLink[] {
  const links: FamilyLink[] = [];
  for (const relationship of relationships) {
    if (!involves(relationship, personId)) continue;
    if (relationship.kind === 'parent_child' && relationship.toPersonId === personId) {
      links.push({
        relationshipId: relationship.id,
        otherId: relationship.fromPersonId,
        role: relationship.parentage === 'custom' && relationship.customLabel.trim()
          ? relationship.customLabel.trim()
          : parentageLabel(relationship.parentage),
        basis: 'recorded',
        confidence: relationship.confidence,
        notes: relationship.notes,
      });
    } else if (relationship.kind === 'parent_child' && relationship.fromPersonId === personId) {
      links.push({
        relationshipId: relationship.id,
        otherId: relationship.toPersonId,
        role: relationship.parentage === 'custom' && relationship.customLabel.trim()
          ? relationship.customLabel.trim()
          : childLabel(relationship.parentage),
        basis: 'recorded',
        confidence: relationship.confidence,
        notes: relationship.notes,
      });
    } else if (relationship.kind === 'partnership') {
      links.push({
        relationshipId: relationship.id,
        otherId: otherPersonId(relationship, personId),
        role: partnershipLabel(relationship.partnershipType, relationship.customLabel),
        basis: 'recorded',
        confidence: relationship.confidence,
        notes: relationship.notes,
      });
    } else if (relationship.kind === 'sibling') {
      links.push({
        relationshipId: relationship.id,
        otherId: otherPersonId(relationship, personId),
        role: siblingDegreeLabel(relationship.siblingDegree, relationship.customLabel),
        basis: 'recorded',
        confidence: relationship.confidence,
        notes: relationship.notes,
      });
    } else if (relationship.kind === 'custom') {
      links.push({
        relationshipId: relationship.id,
        otherId: otherPersonId(relationship, personId),
        role: relationship.customLabel.trim() || 'Related',
        basis: 'recorded',
        confidence: relationship.confidence,
        notes: relationship.notes,
      });
    }
  }
  return links;
}

function biologicalParentIds(personId: string, relationships: Relationship[]): string[] {
  return parentsOf(personId, relationships)
    .filter((relationship) => relationship.parentage === 'biological')
    .map((relationship) => relationship.fromPersonId);
}

/**
 * Sibling links are calculated from recorded parents.
 * Partnership and household membership never create a sibling or parent link.
 * When only one biological parent is known, the result stays unspecified rather than being called half or full.
 */
export function calculatedSiblings(personId: string, people: Person[], relationships: Relationship[]): FamilyLink[] {
    const mine = new Set(biologicalParentIds(personId, relationships));
    const myParents = parentsOf(personId, relationships);
    const links: FamilyLink[] = [];

    for (const other of people) {
      if (other.id === personId) continue;
      const theirs = new Set(biologicalParentIds(other.id, relationships));
      const sharedBiological = [...mine].filter((id) => theirs.has(id));
      const theirParents = parentsOf(other.id, relationships);
      const sharedParentIds = myParents
        .map((relationship) => relationship.fromPersonId)
        .filter((id) => theirParents.some((relationship) => relationship.fromPersonId === id));

      let degree: SiblingDegree | null = null;
      if (sharedBiological.length >= 2) degree = 'full';
      else if (sharedBiological.length === 1) {
        const sharedId = sharedBiological[0];
        const leftOther = [...mine].filter((id) => id !== sharedId);
        const rightOther = [...theirs].filter((id) => id !== sharedId);
        degree = leftOther.length > 0 && rightOther.length > 0 ? 'half' : 'unspecified';
      } else if (sharedParentIds.length > 0) degree = 'legal';
      else if (isStepSibling(other.id, relationships, myParents)) degree = 'step';

    if (!degree) continue;
    links.push({
      relationshipId: null,
      otherId: other.id,
      role: `${siblingDegreeLabel(degree)} (calculated)`,
      basis: 'calculated',
      confidence: degree === 'unspecified' ? 'possible' : 'probable',
      notes: degree === 'unspecified'
        ? 'Only one shared biological parent is recorded, so this may be a full or half sibling.'
        : 'Calculated from recorded parents. This is not a separately entered relationship.',
    });
  }
  return links;
}

function isStepSibling(
  otherId: string,
  relationships: Relationship[],
  myParents: Relationship[],
): boolean {
  const theirParents = parentsOf(otherId, relationships);
  if (myParents.length === 0 || theirParents.length === 0) return false;
  const myParentIds = new Set(myParents.map((relationship) => relationship.fromPersonId));
  const theirParentIds = new Set(theirParents.map((relationship) => relationship.fromPersonId));
  for (const relationship of relationships) {
    if (relationship.kind !== 'partnership') continue;
    const aIsMine = myParentIds.has(relationship.fromPersonId) || myParentIds.has(relationship.toPersonId);
    const bIsTheirs = theirParentIds.has(relationship.fromPersonId) || theirParentIds.has(relationship.toPersonId);
    if (aIsMine && bIsTheirs) {
      const shared = [...myParentIds].some((id) => theirParentIds.has(id));
      if (!shared) return true;
    }
  }
  const stepToTheirParent = myParents.some(
    (relationship) => relationship.parentage === 'step' && theirParentIds.has(relationship.fromPersonId),
  );
  const theyStepToMine = theirParents.some(
    (relationship) => relationship.parentage === 'step' && myParentIds.has(relationship.fromPersonId),
  );
  return stepToTheirParent || theyStepToMine;
}

export interface GenerationResult {
  generations: Map<string, number>;
  cyclic: boolean;
}

/**
 * Parents pull children down one generation.
 * A person with no recorded parents is aligned to a partner who sits lower in the tree,
 * so spouses can share a row. People with parents keep the generation their parents imply.
 */
export function assignGenerations(people: Person[], relationships: Relationship[]): GenerationResult {
  const generations = new Map<string, number>();
  for (const person of people) generations.set(person.id, 0);
  const parentLinks = relationships.filter(
    (relationship) =>
      relationship.kind === 'parent_child' &&
      generations.has(relationship.fromPersonId) &&
      generations.has(relationship.toPersonId),
  );
  const hasParent = new Set(parentLinks.map((relationship) => relationship.toPersonId));
  const partnerships = relationships.filter((relationship) => relationship.kind === 'partnership');
  const limit = Math.max(people.length + 2, 2);
  let cyclic = false;

  for (let iteration = 0; iteration < limit; iteration += 1) {
    let changed = false;
    for (const relationship of parentLinks) {
      const next = (generations.get(relationship.fromPersonId) ?? 0) + 1;
      if ((generations.get(relationship.toPersonId) ?? 0) < next) {
        generations.set(relationship.toPersonId, next);
        changed = true;
      }
    }
    for (const relationship of partnerships) {
      const pairs: Array<[string, string]> = [
        [relationship.fromPersonId, relationship.toPersonId],
        [relationship.toPersonId, relationship.fromPersonId],
      ];
      for (const [personId, partnerId] of pairs) {
        if (!generations.has(personId) || !generations.has(partnerId)) continue;
        if (hasParent.has(personId)) continue;
        const target = generations.get(partnerId) ?? 0;
        if ((generations.get(personId) ?? 0) < target) {
          generations.set(personId, target);
          changed = true;
        }
      }
    }
    if (!changed) return { generations, cyclic: false };
    if (iteration === limit - 1) cyclic = true;
  }
  return { generations, cyclic };
}

export function descendantIds(
  personId: string,
  relationships: Relationship[],
  within?: ReadonlySet<string>,
): Set<string> {
  const children = new Map<string, string[]>();
  for (const relationship of relationships) {
    if (relationship.kind !== 'parent_child') continue;
    const list = children.get(relationship.fromPersonId) ?? [];
    list.push(relationship.toPersonId);
    children.set(relationship.fromPersonId, list);
  }
  const found = new Set<string>();
  const stack = [personId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const childId of children.get(current) ?? []) {
      if (within && !within.has(childId)) continue;
      if (found.has(childId)) continue;
      found.add(childId);
      stack.push(childId);
    }
  }
  return found;
}

export function hiddenDescendants(collapsedIds: ReadonlySet<string>, relationships: Relationship[], within?: ReadonlySet<string>): Set<string> {
  const hidden = new Set<string>();
  for (const personId of collapsedIds) {
    if (within && !within.has(personId)) continue;
    for (const descendantId of descendantIds(personId, relationships, within)) hidden.add(descendantId);
  }
  return hidden;
}

export function peopleInScope(
  people: Person[],
  relationships: Relationship[],
  options: { mode: 'all' } | { mode: 'focus'; focusId: string; up: number; down: number },
): Set<string> {
  const ids = new Set(people.map((person) => person.id));
  if (options.mode === 'all') return ids;
  if (!ids.has(options.focusId)) return ids;
  const included = new Set<string>([options.focusId]);
  let frontier = [options.focusId];
  for (let depth = 0; depth < options.up; depth += 1) {
    const next: string[] = [];
    for (const personId of frontier) {
      for (const relationship of parentsOf(personId, relationships)) {
        if (!included.has(relationship.fromPersonId)) {
          included.add(relationship.fromPersonId);
          next.push(relationship.fromPersonId);
        }
      }
    }
    frontier = next;
  }
  frontier = [options.focusId];
  for (let depth = 0; depth < options.down; depth += 1) {
    const next: string[] = [];
    for (const personId of frontier) {
      for (const relationship of childrenOf(personId, relationships)) {
        if (!included.has(relationship.toPersonId)) {
          included.add(relationship.toPersonId);
          next.push(relationship.toPersonId);
        }
      }
    }
    frontier = next;
  }
  for (const relationship of relationships) {
    if (relationship.kind !== 'partnership') continue;
    if (included.has(relationship.fromPersonId) || included.has(relationship.toPersonId)) {
      included.add(relationship.fromPersonId);
      included.add(relationship.toPersonId);
    }
  }
  return included;
}

export function suggestFocusId(people: Person[], relationships: Relationship[]): string | null {
  if (people.length === 0) return null;
  let best = people[0];
  let bestCount = -1;
  for (const person of people) {
    const count = descendantIds(person.id, relationships).size;
    if (count > bestCount || (count === bestCount && displayNameSafe(person) < displayNameSafe(best))) {
      best = person;
      bestCount = count;
    }
  }
  return best.id;
}

function displayNameSafe(person: Person): string {
  return [person.givenNames, person.familyNames, person.preferredName].join(' ').trim();
}
