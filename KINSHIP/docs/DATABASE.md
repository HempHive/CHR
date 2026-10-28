# Database

Schema version: **1**.

The logical model is three records. Occupations, education, residences, and alternate names live inside the person document. They are not queried on their own in 1.0. A desktop SQLite adapter can lift them into child tables later without changing their meaning.

## IndexedDB (implemented)

Database name: `kinship`.

| Store | Key | Indexes |
| --- | --- | --- |
| `archives` | `id` | `kind`, `updatedAt` |
| `people` | `id` | `archiveId`, `updatedAt` |
| `relationships` | `id` | `archiveId`, `fromPersonId`, `toPersonId`, `kind` |

`archives.schemaVersion` is `1`. A backup whose schema version is anything else is refused.

Person identifiers are unique across the whole database, not only inside one archive. Restoring a file into a second archive remaps identifiers when copying, and refuses the restore when replacing would steal an identifier from another archive.

Deleting a person deletes the relationships that name them, inside the same transaction. Deleting an archive deletes its people and relationships.

## Logical tables for a later SQLite adapter

```sql
CREATE TABLE archives (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('family', 'demonstration')),
  schema_version INTEGER NOT NULL,
  dismissed_alerts TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE people (
  id TEXT PRIMARY KEY,
  archive_id TEXT NOT NULL REFERENCES archives(id),
  document TEXT NOT NULL
);

CREATE TABLE relationships (
  id TEXT PRIMARY KEY,
  archive_id TEXT NOT NULL REFERENCES archives(id),
  kind TEXT NOT NULL,
  from_person_id TEXT NOT NULL,
  to_person_id TEXT NOT NULL,
  document TEXT NOT NULL
);
```

`document` is the same JSON the browser stores. That keeps one person shape across adapters.

## Migrations

Version 1 has no predecessor. `parseBackup` rejects any other `schemaVersion` or backup `formatVersion`. Future versions should migrate forward in a named function and keep a test that version 1 still opens. Do not rewrite a researcher's dates while migrating.

## Reserved, not stored as files

`photoIds`, `documentIds`, `audioIds`, and `videoIds` are arrays on the person. Phase 1 preserves them through backup and restore. It does not store bytes, and it does not display a gallery. A backup that mentions media warns that the binaries are not in the file.
