import { describe, expect, it } from 'vitest';
import { createPerson } from '@/domain/factory';
import { foldName, paginate, searchArchive } from '@/domain/search';
import { createDemonstrationSnapshot } from '@/demo/calder';

describe('search', () => {
  const demo = createDemonstrationSnapshot();

  it('finds people, occupations, and folded spellings', () => {
    expect(searchArchive(demo.people, demo.relationships, 'boatbuilder').some((hit) => hit.personId === 'demo-person-harold')).toBe(true);
    expect(searchArchive(demo.people, demo.relationships, 'Okonkwo').some((hit) => hit.personId === 'demo-person-naomi')).toBe(true);
    expect(searchArchive(demo.people, demo.relationships, 'foster').some((hit) => hit.title.includes('Iris'))).toBe(true);

    const philip = createPerson('a', { id: 'philip', givenNames: 'Philip', familyNames: 'Calder' });
    expect(foldName('Philippe')).not.toBe(foldName('Philip'));
    expect(searchArchive([philip], [], 'Philippe').some((hit) => hit.personId === 'philip')).toBe(true);
    expect(searchArchive(demo.people, demo.relationships, 'Caldar').some((hit) => hit.title.includes('Calder'))).toBe(true);
  });

  it('paginates without dropping items', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    expect(paginate(items, 2, 2)).toEqual({ page: 2, pages: 3, items: ['c', 'd'] });
    expect(paginate(items, 9, 2).page).toBe(3);
  });
});
