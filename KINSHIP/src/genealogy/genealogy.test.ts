import { describe, expect, it } from 'vitest';
import { createDemonstrationSnapshot } from '@/demo/calder';
import { parseFuzzyDate } from '@/domain/dates';
import { createPerson, createRelationship } from '@/domain/factory';
import {
  assignGenerations,
  calculatedSiblings,
  childrenOf,
  descendantIds,
  parentsOf,
  peopleInScope,
} from '@/genealogy/graph';
import { layoutFamilyTree, nodesOverlap } from '@/genealogy/layout';
import { archiveIssues, findPossibleDuplicates, relationshipSaveIssues } from '@/genealogy/validate';

const demo = createDemonstrationSnapshot();

describe('demonstration family', () => {
  it('keeps four generations and does not infer parents from marriage', () => {
    const generations = assignGenerations(demo.people, demo.relationships).generations;
    expect(generations.get('demo-person-naomi')).toBeGreaterThan(generations.get('demo-person-helen') ?? 0);
    expect(generations.get('demo-person-helen')).toBeGreaterThan(generations.get('demo-person-margaret') ?? 0);
    expect(generations.get('demo-person-margaret')).toBeGreaterThan(generations.get('demo-person-agnes') ?? 0);
    expect(parentsOf('demo-person-ruth', demo.relationships).map((relationship) => relationship.fromPersonId).sort()).toEqual([
      'demo-person-edith',
      'demo-person-lewis',
    ]);
    expect(parentsOf('demo-person-edith', demo.relationships).some((relationship) => relationship.fromPersonId === 'demo-person-thomas')).toBe(false);
  });

  it('treats Peter and Helen as half siblings and does not call the step link biological', () => {
    const siblings = calculatedSiblings('demo-person-peter', demo.people, demo.relationships);
    const helen = siblings.find((link) => link.otherId === 'demo-person-helen');
    expect(helen?.role).toContain('Half-sibling');
    const peterParents = parentsOf('demo-person-peter', demo.relationships);
    expect(peterParents.find((relationship) => relationship.fromPersonId === 'demo-person-margaret')?.parentage).toBe('step');
    expect(peterParents.find((relationship) => relationship.fromPersonId === 'demo-person-clara')?.parentage).toBe('biological');
  });

  it('does not change sibling conclusions when gender changes', () => {
    const changed = demo.people.map((person) => ({ ...person, gender: person.gender === 'woman' ? 'man' : 'woman' }));
    expect(calculatedSiblings(changed[0].id, changed, demo.relationships)).toEqual(
      calculatedSiblings(demo.people[0].id, demo.people, demo.relationships),
    );
  });
});

describe('relationship rules', () => {
  it('rejects a person as their own parent and keeps a contradictory cycle', () => {
    const ada = createPerson('archive', { id: 'ada', givenNames: 'Ada' });
    const byron = createPerson('archive', { id: 'byron', givenNames: 'Byron' });
    const self = createRelationship('archive', { kind: 'parent_child', fromPersonId: 'ada', toPersonId: 'ada' });
    expect(relationshipSaveIssues(self, [ada], []).some((issue) => issue.severity === 'error')).toBe(true);

    const first = createRelationship('archive', { kind: 'parent_child', fromPersonId: 'ada', toPersonId: 'byron' });
    const second = createRelationship('archive', { kind: 'parent_child', fromPersonId: 'byron', toPersonId: 'ada' });
    const issues = relationshipSaveIssues(second, [ada, byron], [first]);
    expect(issues.some((issue) => issue.code === 'parent-cycle' && issue.severity === 'warning')).toBe(true);
    expect(issues.some((issue) => issue.severity === 'error')).toBe(false);
  });

  it('calculates step siblings from a partnership without treating the partner as a parent', () => {
    const parent = createPerson('a', { id: 'parent', givenNames: 'Parent' });
    const partner = createPerson('a', { id: 'partner', givenNames: 'Partner' });
    const child = createPerson('a', { id: 'child', givenNames: 'Child' });
    const stepchild = createPerson('a', { id: 'stepchild', givenNames: 'Stepchild' });
    const relationships = [
      createRelationship('a', { kind: 'partnership', fromPersonId: 'parent', toPersonId: 'partner', partnershipType: 'spouse' }),
      createRelationship('a', { kind: 'parent_child', fromPersonId: 'parent', toPersonId: 'child', parentage: 'biological' }),
      createRelationship('a', { kind: 'parent_child', fromPersonId: 'partner', toPersonId: 'stepchild', parentage: 'biological' }),
    ];
    expect(parentsOf('child', relationships)).toHaveLength(1);
    expect(calculatedSiblings(child.id, [parent, partner, child, stepchild], relationships).some((link) => link.role.includes('Step-sibling'))).toBe(true);
  });

  it('flags same-name records without merging them', () => {
    const left = createPerson('a', { id: 'left', givenNames: 'John', familyNames: 'Smith', birthDate: parseFuzzyDate('c. 1900') });
    const right = createPerson('a', { id: 'right', givenNames: 'John', familyNames: 'Smith', birthDate: parseFuzzyDate('1902') });
    const distant = createPerson('a', { id: 'distant', givenNames: 'John', familyNames: 'Smith', birthDate: parseFuzzyDate('1980') });
    const found = findPossibleDuplicates([left, right, distant]);
    expect(found).toHaveLength(1);
    expect(found[0]?.personIds).toEqual(['left', 'right']);
    expect(findPossibleDuplicates([left, right], ['left:right'])).toHaveLength(0);
    expect(archiveIssues([left, right], []).some((issue) => issue.code === 'duplicate-person-id')).toBe(false);
  });
});

describe('tree layout', () => {
  it('places each visible person once, below their parents, without overlapping cards', () => {
    const layout = layoutFamilyTree(demo.people, demo.relationships);
    expect(new Set(layout.nodes.map((node) => node.personId)).size).toBe(demo.people.length);
    for (const relationship of demo.relationships.filter((item) => item.kind === 'parent_child')) {
      const parent = layout.nodes.find((node) => node.personId === relationship.fromPersonId);
      const child = layout.nodes.find((node) => node.personId === relationship.toPersonId);
      expect(child && parent && child.y).toBeGreaterThan(parent?.y ?? 0);
    }
    for (let index = 0; index < layout.nodes.length; index += 1) {
      for (let other = index + 1; other < layout.nodes.length; other += 1) {
        expect(nodesOverlap(layout.nodes[index], layout.nodes[other])).toBe(false);
      }
    }
    expect(layout.cyclic).toBe(false);
  });

  it('hides a collapsed branch and can limit depth around one person', () => {
    const hidden = layoutFamilyTree(demo.people, demo.relationships, { collapsedIds: new Set(['demo-person-agnes']) });
    expect(hidden.nodes.some((node) => node.personId === 'demo-person-agnes')).toBe(true);
    expect(hidden.nodes.some((node) => node.personId === 'demo-person-margaret')).toBe(false);
    expect(hidden.nodes.some((node) => node.personId === 'demo-person-harold')).toBe(true);
    const scope = peopleInScope(demo.people, demo.relationships, { mode: 'focus', focusId: 'demo-person-helen', up: 1, down: 1 });
    expect(scope.has('demo-person-helen')).toBe(true);
    expect(scope.has('demo-person-margaret')).toBe(true);
    expect(scope.has('demo-person-naomi')).toBe(true);
    expect(scope.has('demo-person-agnes')).toBe(false);
    expect(descendantIds('demo-person-agnes', demo.relationships).has('demo-person-naomi')).toBe(true);
    expect(childrenOf('demo-person-edith', demo.relationships).length).toBeGreaterThan(0);
  });
});
