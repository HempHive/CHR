# KINSHIP

The Living Family Archive. Version 1.0 is a local-first family history application. Records stay in this browser. Nothing is uploaded.

## Open it

```bash
cd KINSHIP
npm install
npm start
```

Vite serves `index.html` at `http://localhost:5173`. Opening the file directly from the desktop will not work, because the app is a module and IndexedDB is unreliable from a `file://` address.

```bash
npm test
npm run build
npm run preview
```

## What 1.0 does

- Create a family archive, or open the fictional Calder demonstration as a separate archive.
- Add and edit people, including uncertain dates, names, places, occupations, education, residences, biography, and research notes.
- Record parents, children, partners, siblings, and custom relationships without assuming two parents or inferring biology from marriage.
- Keep contradictory records, with warnings, instead of deleting them.
- Draw a traditional family tree with pan, zoom, collapse, an outline, and SVG export.
- Search names, places, notes, and relationship wording, including some historical spelling differences.
- Export a full backup or a redacted export, and restore either one.
- Undo recent person and relationship edits until you leave the archive.

Photographs, maps, timelines, GEDCOM, documents, audio, and the museum are specified in `docs/` and are not in this version. The interface does not pretend they work.

## Where the design lives

- [Architecture](docs/ARCHITECTURE.md)
- [Database](docs/DATABASE.md)
- [Storage](docs/STORAGE.md)
- [Relationships](docs/RELATIONSHIPS.md)
- [Media](docs/MEDIA.md)
- [Import and export](docs/IMPORT_EXPORT.md)
- [Testing](docs/TESTING.md)
- [Roadmap](docs/ROADMAP.md)
- [Phase 1 report](docs/PHASE1_REPORT.md)
