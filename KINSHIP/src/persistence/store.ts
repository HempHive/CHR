import { duplicateKey, nowIso } from '@/domain/ids';
import type { Archive, BatchOp, Person, Relationship, Snapshot } from '@/domain/types';

export interface WriteOptions {
  /** When false, createdAt and updatedAt are stored exactly as given. Undo uses this. */
  touch?: boolean;
}

export interface ArchiveStore {
  listArchives(): Promise<Archive[]>;
  getArchive(id: string): Promise<Archive | null>;
  listPeople(archiveId: string): Promise<Person[]>;
  getPerson(id: string): Promise<Person | null>;
  listRelationships(archiveId: string): Promise<Relationship[]>;
  getRelationship(id: string): Promise<Relationship | null>;
  applyBatch(ops: BatchOp[], options?: WriteOptions): Promise<void>;
  replaceArchiveContents(snapshot: Snapshot): Promise<void>;
  readSnapshot(archiveId: string): Promise<Snapshot | null>;
  close(): Promise<void>;
}

export function stamp<T extends { createdAt: string; updatedAt: string }>(incoming: T, existing: T | null, touch: boolean): T {
  const now = nowIso();
  return {
    ...incoming,
    createdAt: existing?.createdAt ?? incoming.createdAt ?? now,
    updatedAt: touch ? now : incoming.updatedAt || now,
  };
}

export function undoForPerson(before: Person | null, after: Person | null): BatchOp[] {
  if (before && after) return [{ op: 'put-person', person: before }];
  if (!before && after) return [{ op: 'delete-person', id: after.id }];
  if (before && !after) return [{ op: 'put-person', person: before }];
  return [];
}

export function undoForRelationship(before: Relationship | null, after: Relationship | null): BatchOp[] {
  if (before && after) return [{ op: 'put-relationship', relationship: before }];
  if (!before && after) return [{ op: 'delete-relationship', id: after.id }];
  if (before && !after) return [{ op: 'put-relationship', relationship: before }];
  return [];
}

export interface UndoEntry {
  label: string;
  batch: BatchOp[];
}

export function createUndoHistory(limit = 30) {
  const entries: UndoEntry[] = [];
  return {
    push(entry: UndoEntry) {
      entries.push(entry);
      while (entries.length > limit) entries.shift();
    },
    pop(): UndoEntry | undefined {
      return entries.pop();
    },
    clear() {
      entries.length = 0;
    },
    get size() {
      return entries.length;
    },
  };
}

export function remapSnapshot(snapshot: Snapshot): Snapshot {
  const archiveId = crypto.randomUUID();
  const peopleIds = new Map(snapshot.people.map((person) => [person.id, crypto.randomUUID()]));
  const mapAlert = (key: string) => {
    const [left, right] = key.split(':');
    if (!left || !right || !peopleIds.has(left) || !peopleIds.has(right)) return null;
    return duplicateKey(peopleIds.get(left) ?? left, peopleIds.get(right) ?? right);
  };
  return {
    archive: {
      ...snapshot.archive,
      id: archiveId,
      dismissedAlerts: snapshot.archive.dismissedAlerts
        .map(mapAlert)
        .filter((key): key is string => Boolean(key)),
    },
    people: snapshot.people.map((person) => ({
      ...person,
      id: peopleIds.get(person.id) ?? person.id,
      archiveId,
    })),
    relationships: snapshot.relationships.map((relationship) => ({
      ...relationship,
      id: crypto.randomUUID(),
      archiveId,
      fromPersonId: peopleIds.get(relationship.fromPersonId) ?? relationship.fromPersonId,
      toPersonId: peopleIds.get(relationship.toPersonId) ?? relationship.toPersonId,
    })),
  };
}

export function snapshotForReplace(target: Archive, snapshot: Snapshot): Snapshot {
  return {
    archive: {
      ...target,
      name: snapshot.archive.name,
      description: snapshot.archive.description,
      kind: snapshot.archive.kind,
      dismissedAlerts: snapshot.archive.dismissedAlerts,
      schemaVersion: target.schemaVersion,
      updatedAt: nowIso(),
    },
    people: snapshot.people.map((person) => ({ ...person, archiveId: target.id })),
    relationships: snapshot.relationships.map((relationship) => ({ ...relationship, archiveId: target.id })),
  };
}
