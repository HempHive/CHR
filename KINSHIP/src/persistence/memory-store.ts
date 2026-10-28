import { stamp } from '@/persistence/store';
import type { ArchiveStore, WriteOptions } from '@/persistence/store';
import type { Archive, BatchOp, Person, Relationship, Snapshot } from '@/domain/types';

interface Tables {
  archives: Map<string, Archive>;
  people: Map<string, Person>;
  relationships: Map<string, Relationship>;
}

function cloneTables(source: Tables): Tables {
  return {
    archives: new Map([...source.archives].map(([id, archive]) => [id, structuredClone(archive)])),
    people: new Map([...source.people].map(([id, person]) => [id, structuredClone(person)])),
    relationships: new Map([...source.relationships].map(([id, relationship]) => [id, structuredClone(relationship)])),
  };
}

export function createMemoryStore(initial: Snapshot[] = []): ArchiveStore {
  const tables: Tables = {
    archives: new Map(),
    people: new Map(),
    relationships: new Map(),
  };
  for (const snapshot of initial) {
    tables.archives.set(snapshot.archive.id, structuredClone(snapshot.archive));
    for (const person of snapshot.people) tables.people.set(person.id, structuredClone(person));
    for (const relationship of snapshot.relationships) tables.relationships.set(relationship.id, structuredClone(relationship));
  }

  function requireArchive(id: string): Archive {
    const archive = tables.archives.get(id);
    if (!archive) throw new Error('That archive does not exist.');
    return archive;
  }

  function bump(archiveId: string, touch: boolean) {
    if (!touch) return;
    const archive = tables.archives.get(archiveId);
    if (!archive) return;
    archive.updatedAt = new Date().toISOString();
  }

  function applyOne(op: BatchOp, touch: boolean) {
    if (op.op === 'put-archive') {
      const existing = tables.archives.get(op.archive.id) ?? null;
      tables.archives.set(op.archive.id, stamp(op.archive, existing, touch));
      return;
    }
    if (op.op === 'delete-archive') {
      tables.archives.delete(op.id);
      for (const [id, person] of tables.people) if (person.archiveId === op.id) tables.people.delete(id);
      for (const [id, relationship] of tables.relationships) {
        if (relationship.archiveId === op.id) tables.relationships.delete(id);
      }
      return;
    }
    if (op.op === 'put-person') {
      requireArchive(op.person.archiveId);
      const existing = tables.people.get(op.person.id) ?? null;
      if (existing && existing.archiveId !== op.person.archiveId) {
        throw new Error('A record with this identifier already belongs to another archive.');
      }
      tables.people.set(op.person.id, stamp(op.person, existing, touch));
      bump(op.person.archiveId, touch);
      return;
    }
    if (op.op === 'delete-person') {
      const existing = tables.people.get(op.id);
      tables.people.delete(op.id);
      for (const [id, relationship] of tables.relationships) {
        if (relationship.fromPersonId === op.id || relationship.toPersonId === op.id) tables.relationships.delete(id);
      }
      if (existing) bump(existing.archiveId, touch);
      return;
    }
    if (op.op === 'put-relationship') {
      const relationship = op.relationship;
      if (relationship.fromPersonId === relationship.toPersonId) {
        throw new Error('A person cannot be related to themselves.');
      }
      const from = tables.people.get(relationship.fromPersonId);
      const to = tables.people.get(relationship.toPersonId);
      if (!from || !to) throw new Error('Both people must exist before a relationship can be saved.');
      if (from.archiveId !== relationship.archiveId || to.archiveId !== relationship.archiveId) {
        throw new Error('Relationships must stay inside one archive.');
      }
      const existing = tables.relationships.get(relationship.id) ?? null;
      if (existing && existing.archiveId !== relationship.archiveId) {
        throw new Error('A relationship with this identifier already belongs to another archive.');
      }
      tables.relationships.set(relationship.id, stamp(relationship, existing, touch));
      bump(relationship.archiveId, touch);
      return;
    }
    const existing = tables.relationships.get(op.id);
    tables.relationships.delete(op.id);
    if (existing) bump(existing.archiveId, touch);
  }

  return {
    async listArchives() {
      return [...tables.archives.values()].map((archive) => structuredClone(archive)).sort((a, b) => a.name.localeCompare(b.name));
    },
    async getArchive(id) {
      const archive = tables.archives.get(id);
      return archive ? structuredClone(archive) : null;
    },
    async listPeople(archiveId) {
      return [...tables.people.values()]
        .filter((person) => person.archiveId === archiveId)
        .map((person) => structuredClone(person));
    },
    async getPerson(id) {
      const person = tables.people.get(id);
      return person ? structuredClone(person) : null;
    },
    async listRelationships(archiveId) {
      return [...tables.relationships.values()]
        .filter((relationship) => relationship.archiveId === archiveId)
        .map((relationship) => structuredClone(relationship));
    },
    async getRelationship(id) {
      const relationship = tables.relationships.get(id);
      return relationship ? structuredClone(relationship) : null;
    },
    async applyBatch(ops, options?: WriteOptions) {
      const backup = cloneTables(tables);
      const touch = options?.touch !== false;
      try {
        for (const op of ops) applyOne(op, touch);
      } catch (error) {
        tables.archives = backup.archives;
        tables.people = backup.people;
        tables.relationships = backup.relationships;
        throw error;
      }
    },
    async replaceArchiveContents(snapshot) {
      const collisions: string[] = [];
      for (const person of snapshot.people) {
        const existing = tables.people.get(person.id);
        if (existing && existing.archiveId !== snapshot.archive.id) collisions.push(person.id);
      }
      for (const relationship of snapshot.relationships) {
        const existing = tables.relationships.get(relationship.id);
        if (existing && existing.archiveId !== snapshot.archive.id) collisions.push(relationship.id);
      }
      if (collisions.length > 0) {
        throw new Error('This backup uses identifiers that already belong to another archive. Add it as a separate archive instead.');
      }
      const backup = cloneTables(tables);
      try {
        tables.archives.set(snapshot.archive.id, structuredClone(snapshot.archive));
        for (const [id, person] of tables.people) if (person.archiveId === snapshot.archive.id) tables.people.delete(id);
        for (const [id, relationship] of tables.relationships) {
          if (relationship.archiveId === snapshot.archive.id) tables.relationships.delete(id);
        }
        for (const person of snapshot.people) tables.people.set(person.id, structuredClone(person));
        for (const relationship of snapshot.relationships) tables.relationships.set(relationship.id, structuredClone(relationship));
      } catch (error) {
        tables.archives = backup.archives;
        tables.people = backup.people;
        tables.relationships = backup.relationships;
        throw error;
      }
    },
    async readSnapshot(archiveId) {
      const archive = tables.archives.get(archiveId);
      if (!archive) return null;
      const people = [...tables.people.values()].filter((person) => person.archiveId === archiveId);
      const relationships = [...tables.relationships.values()].filter((relationship) => relationship.archiveId === archiveId);
      return structuredClone({ archive, people, relationships });
    },
    async close() {
      return undefined;
    },
  };
}
