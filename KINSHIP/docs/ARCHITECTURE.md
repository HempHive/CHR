# Architecture

KINSHIP 1.0 is a local-first web application. The browser is the product. A later desktop build can replace the storage adapter. It must not replace the family model.

## Choices for 1.0

| Concern | Choice | Why |
| --- | --- | --- |
| UI | React 19, TypeScript, Vite | Current, typed, and small enough to keep the domain separate from the screen. |
| Entry | `index.html` | The page Vite serves. It is not a double-clicked file. |
| Records | IndexedDB through Dexie | Persistent structured storage that survives restarts. Apache-2.0, still maintained. |
| Tests | Vitest, Testing Library, happy-dom, fake-indexeddb | Domain tests and one browser-like journey without a cloud runner. |
| Tree | Our own layout | A genealogical tree is not a general node graph. A graph library can wait for the constellation view. |
| Maps, timelines, Tauri, SQLite, Leaflet | Not installed | They are not used in 1.0. Adding them now would be weight without a feature. |

SQLite is the likely store for a future Tauri build. The logical tables in `DATABASE.md` are written so that adapter can be added without renaming people or relationships. The browser cannot use a SQLite file as its primary store without either a remote server or a WASM database, so IndexedDB is the physical store now.

## Layout

```text
src/domain          people, dates, names, search text
src/genealogy       relationships, validation, tree layout, statistics
src/persistence     store interface, memory, IndexedDB, backup files
src/demo            removable fictional Calder archive
src/ui              screens
src/app             shell, routing, preferences
docs                design that later phases still have to honour
```

Screens call the archive context. The context calls an `ArchiveStore`. Tests use the memory store. The browser uses IndexedDB. Both speak the same operations.

## What is authoritative

One archive holds people and relationships. Tree, search, home statistics, and backup all read those records. There is no second copy of the family hiding in a visualisation.

Dates keep the typed text and a precision. Approximate years are not stored as midnight on 1 January.

Gender is optional. No relationship rule reads it.

Privacy defaults to private. Concealing living people is a presentation setting on this device. Redacted export is the control for data leaving the machine. Hiding a button is not treated as security, and there are no secret URLs: the app does not serve records to anyone else.

## Explicitly absent

Media files, geocoding, GEDCOM, OCR, transcription, and any model call. Optional later assistance must label its output and must not write genealogy by itself. Face recognition is out of scope until a separate privacy review exists. Gaussian splatting is not a way to store photographs.
