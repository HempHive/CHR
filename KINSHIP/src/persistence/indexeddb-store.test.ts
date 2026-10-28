import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createArchive, createPerson, createRelationship } from '@/domain/factory';
import { openIndexedDbStore } from '@/persistence/indexeddb-store';

describe('IndexedDB archive', () => {
  it('keeps people and relationships after the database is closed and opened again', async () => {
    const name = `kinship-test-${crypto.randomUUID()}`;
    const first = openIndexedDbStore(name);
    const archive = createArchive({ name: 'Ward' });
    const ada = createPerson(archive.id, { givenNames: 'Ada', familyNames: 'Ward' });
    const byron = createPerson(archive.id, { givenNames: 'Byron', familyNames: 'Ward' });
    const parent = createRelationship(archive.id, { kind: 'parent_child', fromPersonId: byron.id, toPersonId: ada.id, parentage: 'biological' });
    await first.applyBatch([
      { op: 'put-archive', archive },
      { op: 'put-person', person: ada },
      { op: 'put-person', person: byron },
      { op: 'put-relationship', relationship: parent },
    ]);
    await first.close();

    const second = openIndexedDbStore(name);
    const snapshot = await second.readSnapshot(archive.id);
    expect(snapshot?.people.map((person) => person.givenNames).sort()).toEqual(['Ada', 'Byron']);
    expect(snapshot?.relationships).toHaveLength(1);
    await second.applyBatch([{ op: 'delete-person', id: ada.id }]);
    expect(await second.listRelationships(archive.id)).toHaveLength(0);
    expect(await second.getPerson(byron.id)).not.toBeNull();
    await second.destroy();
  });
});
