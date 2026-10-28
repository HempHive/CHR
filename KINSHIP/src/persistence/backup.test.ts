import { describe, expect, it } from 'vitest';
import { createDemonstrationSnapshot } from '@/demo/calder';
import { createArchive, createPerson, createRelationship } from '@/domain/factory';
import { backupToSnapshot, createBackup, parseBackup, redactSnapshot } from '@/persistence/backup';
import { createMemoryStore } from '@/persistence/memory-store';
import { remapSnapshot, undoForPerson } from '@/persistence/store';

describe('backup and privacy', () => {
  it('round-trips a checksummed backup and refuses a tampered file', async () => {
    const snapshot = createDemonstrationSnapshot();
    const backup = await createBackup(snapshot);
    const parsed = await parseBackup(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.people).toHaveLength(snapshot.people.length);
    const tampered = structuredClone(backup);
    tampered.people[0].givenNames = 'Changed';
    const rejected = await parseBackup(JSON.stringify(tampered));
    expect(rejected.ok).toBe(false);
  });

  it('keeps unknown future fields and drops restricted living people from a redacted export', async () => {
    const snapshot = createDemonstrationSnapshot();
    const extra = snapshot.people[0] as typeof snapshot.people[0] & { futureNote: string };
    extra.futureNote = 'keep me';
    const backup = await createBackup(snapshot);
    const parsed = await parseBackup(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect((parsed.backup.people[0] as { futureNote?: string }).futureNote).toBe('keep me');

    const redacted = redactSnapshot(snapshot, { excludeRestricted: true, excludeLiving: false });
    expect(redacted.people.some((person) => person.id === 'demo-person-naomi')).toBe(false);
    expect(redacted.relationships.some((relationship) => relationship.toPersonId === 'demo-person-naomi')).toBe(false);
    expect(redacted.people.some((person) => person.id === 'demo-person-helen')).toBe(true);
    const file = await createBackup(snapshot, { excludeRestricted: true, excludeLiving: true });
    expect(file.completeness).toBe('redacted');
  });

  it('restores into a copy without mixing demonstration people into a family archive', async () => {
    const family = createArchive({ name: 'Ward', kind: 'family' });
    const ada = createPerson(family.id, { givenNames: 'Ada', familyNames: 'Ward' });
    const store = createMemoryStore([{ archive: family, people: [ada], relationships: [] }]);
    const demo = createDemonstrationSnapshot();
    const backup = await createBackup(demo);
    const parsed = await parseBackup(JSON.stringify(backup));
    if (!parsed.ok) throw new Error(parsed.errors.join(' '));
    const copy = remapSnapshot(backupToSnapshot(parsed.backup));
    await store.replaceArchiveContents(copy);
    const familyPeople = await store.listPeople(family.id);
    expect(familyPeople.map((person) => person.givenNames)).toEqual(['Ada']);
    const archives = await store.listArchives();
    expect(archives.some((archive) => archive.kind === 'demonstration' && archive.id !== family.id)).toBe(true);
  });

  it('replaces an archive and can undo a person edit', async () => {
    const archive = createArchive({ name: 'Ward' });
    const ada = createPerson(archive.id, { id: 'ada', givenNames: 'Ada', familyNames: 'Ward' });
    const store = createMemoryStore();
    await store.applyBatch([
      { op: 'put-archive', archive },
      { op: 'put-person', person: ada },
    ]);
    const edited = { ...ada, givenNames: 'Adelaide' };
    await store.applyBatch([{ op: 'put-person', person: edited }]);
    await store.applyBatch(undoForPerson(ada, edited), { touch: false });
    expect((await store.getPerson('ada'))?.givenNames).toBe('Ada');

    const other = createArchive({ name: 'Other' });
    await store.applyBatch([{ op: 'put-archive', archive: other }]);
    await expect(
      store.replaceArchiveContents({
        archive: { ...other, name: 'Imported' },
        people: [{ ...ada, archiveId: other.id }],
        relationships: [],
      }),
    ).rejects.toThrow(/another archive/);
    expect((await store.getPerson('ada'))?.givenNames).toBe('Ada');
    expect((await store.getPerson('ada'))?.archiveId).toBe(archive.id);
  });

  it('does not keep a self relationship and does not drop a warned cycle', async () => {
    const archive = createArchive({ name: 'Ward' });
    const ada = createPerson(archive.id, { id: 'ada', givenNames: 'Ada' });
    const byron = createPerson(archive.id, { id: 'byron', givenNames: 'Byron' });
    const store = createMemoryStore([{ archive, people: [ada, byron], relationships: [] }]);
    const self = createRelationship(archive.id, { kind: 'parent_child', fromPersonId: ada.id, toPersonId: ada.id });
    await expect(store.applyBatch([{ op: 'put-relationship', relationship: self }])).rejects.toThrow(/themselves/);
    const down = createRelationship(archive.id, { kind: 'parent_child', fromPersonId: ada.id, toPersonId: byron.id });
    const up = createRelationship(archive.id, { kind: 'parent_child', fromPersonId: byron.id, toPersonId: ada.id });
    await store.applyBatch([
      { op: 'put-relationship', relationship: down },
      { op: 'put-relationship', relationship: up },
    ]);
    expect(await store.listRelationships(archive.id)).toHaveLength(2);
  });
});
