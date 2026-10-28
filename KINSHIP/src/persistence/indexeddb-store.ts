import Dexie, { type Table } from 'dexie';
import type { Archive, BatchOp, Person, Relationship } from '@/domain/types';
import { stamp, type ArchiveStore, type WriteOptions } from '@/persistence/store';
import { DATABASE_NAME, SCHEMA_VERSION } from '@/version';

class KinshipDatabase extends Dexie {
  archives!: Table<Archive, string>;
  people!: Table<Person, string>;
  relationships!: Table<Relationship, string>;

  constructor(name: string) {
    super(name);
    this.version(SCHEMA_VERSION).stores({
      archives: 'id, kind, updatedAt',
      people: 'id, archiveId, updatedAt',
      relationships: 'id, archiveId, fromPersonId, toPersonId, kind',
    });
  }
}

export interface IndexedDbArchiveStore extends ArchiveStore {
  destroy(): Promise<void>;
}

export function openIndexedDbStore(databaseName = DATABASE_NAME): IndexedDbArchiveStore {
  const db = new KinshipDatabase(databaseName);

  async function bump(archiveId: string, touch: boolean) {
    if (!touch) return;
    const archive = await db.archives.get(archiveId);
    if (!archive) return;
    await db.archives.put({ ...archive, updatedAt: new Date().toISOString() });
  }

  async function applyOne(op: BatchOp, touch: boolean) {
    if (op.op === 'put-archive') {
      const existing = (await db.archives.get(op.archive.id)) ?? null;
      await db.archives.put(stamp(op.archive, existing, touch));
      return;
    }
    if (op.op === 'delete-archive') {
      await db.people.where('archiveId').equals(op.id).delete();
      await db.relationships.where('archiveId').equals(op.id).delete();
      await db.archives.delete(op.id);
      return;
    }
    if (op.op === 'put-person') {
      const archive = await db.archives.get(op.person.archiveId);
      if (!archive) throw new Error('That archive does not exist.');
      const existing = (await db.people.get(op.person.id)) ?? null;
      if (existing && existing.archiveId !== op.person.archiveId) {
        throw new Error('A record with this identifier already belongs to another archive.');
      }
      await db.people.put(stamp(op.person, existing, touch));
      await bump(op.person.archiveId, touch);
      return;
    }
    if (op.op === 'delete-person') {
      const existing = await db.people.get(op.id);
      const related = await db.relationships.filter((relationship) => relationship.fromPersonId === op.id || relationship.toPersonId === op.id).toArray();
      await db.relationships.bulkDelete(related.map((relationship) => relationship.id));
      await db.people.delete(op.id);
      if (existing) await bump(existing.archiveId, touch);
      return;
    }
    if (op.op === 'put-relationship') {
      const relationship = op.relationship;
      if (relationship.fromPersonId === relationship.toPersonId) throw new Error('A person cannot be related to themselves.');
      const from = await db.people.get(relationship.fromPersonId);
      const to = await db.people.get(relationship.toPersonId);
      if (!from || !to) throw new Error('Both people must exist before a relationship can be saved.');
      if (from.archiveId !== relationship.archiveId || to.archiveId !== relationship.archiveId) {
        throw new Error('Relationships must stay inside one archive.');
      }
      const existing = (await db.relationships.get(relationship.id)) ?? null;
      if (existing && existing.archiveId !== relationship.archiveId) {
        throw new Error('A relationship with this identifier already belongs to another archive.');
      }
      await db.relationships.put(stamp(relationship, existing, touch));
      await bump(relationship.archiveId, touch);
      return;
    }
    const existing = await db.relationships.get(op.id);
    await db.relationships.delete(op.id);
    if (existing) await bump(existing.archiveId, touch);
  }

  return {
    async listArchives() {
      const archives = await db.archives.toArray();
      return archives.sort((left, right) => left.name.localeCompare(right.name));
    },
    async getArchive(id) {
      return (await db.archives.get(id)) ?? null;
    },
    async listPeople(archiveId) {
      return db.people.where('archiveId').equals(archiveId).toArray();
    },
    async getPerson(id) {
      return (await db.people.get(id)) ?? null;
    },
    async listRelationships(archiveId) {
      return db.relationships.where('archiveId').equals(archiveId).toArray();
    },
    async getRelationship(id) {
      return (await db.relationships.get(id)) ?? null;
    },
    async applyBatch(ops, options?: WriteOptions) {
      const touch = options?.touch !== false;
      await db.transaction('rw', db.archives, db.people, db.relationships, async () => {
        for (const op of ops) await applyOne(op, touch);
      });
    },
    async replaceArchiveContents(snapshot) {
      await db.transaction('rw', db.archives, db.people, db.relationships, async () => {
        const personHits = await db.people.bulkGet(snapshot.people.map((person) => person.id));
        const relationshipHits = await db.relationships.bulkGet(snapshot.relationships.map((relationship) => relationship.id));
        const collision = [...personHits, ...relationshipHits].some(
          (record) => record && record.archiveId !== snapshot.archive.id,
        );
        if (collision) {
          throw new Error('This backup uses identifiers that already belong to another archive. Add it as a separate archive instead.');
        }
        await db.people.where('archiveId').equals(snapshot.archive.id).delete();
        await db.relationships.where('archiveId').equals(snapshot.archive.id).delete();
        await db.archives.put(snapshot.archive);
        await db.people.bulkPut(snapshot.people);
        if (snapshot.relationships.length > 0) await db.relationships.bulkPut(snapshot.relationships);
      });
    },
    async readSnapshot(archiveId) {
      const archive = await db.archives.get(archiveId);
      if (!archive) return null;
      const people = await db.people.where('archiveId').equals(archiveId).toArray();
      const relationships = await db.relationships.where('archiveId').equals(archiveId).toArray();
      return { archive, people, relationships };
    },
    async close() {
      db.close();
    },
    async destroy() {
      db.close();
      await db.delete();
    },
  };
}
