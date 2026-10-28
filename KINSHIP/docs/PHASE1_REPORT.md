# Phase 1 report

Version 1.0.0. Status below is what this tree actually does.

## Implemented

- Local app shell with light, dark, text size, contrast, and reduced motion.
- IndexedDB archive store and an equivalent in-memory store.
- Person records: names, uncertain dates, places, occupations, education, residences, biography, research notes, privacy.
- Relationships: biological and non-biological parents, partnerships, siblings, custom links. Gender is not used.
- Warnings for cycles and impossible dates. Those records are kept. Self-links and exact duplicates are refused.
- Calculated siblings, labelled as calculated.
- Possible-duplicate review that does not merge.
- Traditional tree: pan, zoom, fit, collapse, focus depth, outline, SVG export.
- Search across names, places, notes, occupations, and relationship wording, with a light historical spelling fold.
- Full backup and redacted export, checksum, restore as a new archive or as a replacement.
- Undo for recent person and relationship edits.
- Fictional Calder demonstration, stored as its own archive and removable.
- 23 automated tests, all passing.

## Files created

The KINSHIP application, its tests, and `docs/` were added under `KINSHIP/`. The existing files in the parent folder were left alone.

## Files modified

None outside `KINSHIP/`.

## Database changes

IndexedDB database `kinship`, schema version 1: `archives`, `people`, `relationships`.

## Tests performed

`npm test` — Vitest.

- Date precision and contradictions.
- Calder generations, half-siblings, step-siblings, gender independence.
- Cycle retained, self-link refused, duplicates not merged.
- Tree overlap, collapse, and generation window.
- Search and pagination.
- Backup checksum, tamper refusal, redaction, demonstration isolation, undo, identifier collision.
- IndexedDB close and reopen.
- Create archive, add a person, search, reload, and dirty-form warning.

## Tests passed

23 passed, 0 failed.

## Known limitations

- Photographs, documents, audio, video, maps, timelines, GEDCOM, citations, and the museum are not built.
- Undo is memory-only and clears when the open archive changes.
- The tree is one traditional layout. Ancestor, radial, and constellation views are later.
- Slash dates are read as day/month/year unless that is impossible.
- Browser storage can be cleared by the browser. The backup file is the copy that leaves the machine.
- A large archive is paged in lists. The tree has not been timed against thousands of people.
- Automated UI tests use happy-dom, not a full browser. A manual pass is still required.

## Manual acceptance

1. `npm start`, create an archive, refresh, and confirm the people are still there.
2. Add two people and a parent link. Open the tree and the outline.
3. Enter `c. 1890` and confirm the profile does not show 1 January 1890.
4. Export a full backup, delete the archive, and add the backup as a new archive.
5. Open the Calder demonstration and confirm a family archive does not gain those people.
6. Turn on “Conceal living people” and confirm a living name disappears from the tree.

## Remaining work

Phases 2 through 7 in `ROADMAP.md`.

## Recommended next phase

Phase 2: sources, the relationship finder, and the other tree shapes on this same database. Do not start photographs until a backup of a small real archive has been restored by hand.
