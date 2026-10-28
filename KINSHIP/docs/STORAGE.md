# Storage

## Adapter

`ArchiveStore` is the boundary:

- list and read archives, people, and relationships
- `applyBatch` for creates, edits, and deletes
- `replaceArchiveContents` for restore
- `readSnapshot` for export
- `close`

`createMemoryStore` is the test double and the rollback reference. `openIndexedDbStore` is the browser. A Tauri adapter should implement the same interface against the desktop filesystem and should not leak path access into React components.

`applyBatch` is transactional. A failed batch leaves the previous records in place. IndexedDB rolls the Dexie transaction back. The memory store restores its maps.

Writes stamp `updatedAt` unless the caller passes `{ touch: false }`. Undo uses that so an undone edit returns the previous record rather than a new timestamp.

## Backup

A full backup is JSON with a SHA-256 checksum over a canonical form of the file, excluding the checksum field. The checksum is calculated in the browser with `crypto.subtle`. A mismatch is refused. The file is not repaired.

Completeness is `full` or `redacted`. Redaction can omit restricted records and living people, and it also omits relationships that would otherwise point at someone who was removed. A redacted file must not be described as a complete archive. The restore screen says so.

Restore has two paths:

- **Add as a separate archive** remaps every identifier. The open archive is untouched.
- **Replace this archive** keeps the open archive's identifier, replaces its people and relationships, and is refused when the backup's kind (family or demonstration) does not match, or when an identifier already belongs to a different archive.

Demonstration people are never written into a family archive by the demonstration loader. The loader only creates or opens the archive `demo-calder-archive`.

## What is not durable yet

Undo history lives in memory and clears when you switch or delete an archive. Preferences, the open archive, and the recently opened list live in `localStorage` on this device. They are not part of the family backup.

Browser storage can be wiped by the user or by the browser. The full backup file is the preservation copy. A backup of database rows without media would be incomplete once photographs exist. Version 1 has no media files, and the backup format already has a place to say so.

## Browser and desktop

The browser cannot be given a folder of original photographs and trusted to keep it. When media arrives, originals should go through the storage adapter: IndexedDB or the Origin Private File System in the browser, and real files under Tauri. Derivatives must be separate objects. Processing must not overwrite the original.
