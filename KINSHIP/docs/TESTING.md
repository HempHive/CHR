# Testing

Automated tests live next to the code and run with `npm test`.

| Area | What is asserted |
| --- | --- |
| Dates | Exact, year, month, approximate, before, after, range, unknown, and impossible days. Approximate dates stay approximate. |
| Family rules | The Calder demonstration, half-siblings, step-parents, gender independence, refused self-links, retained cycles. |
| Duplicates | Same name and compatible births are listed and can be dismissed. Nobody is merged. |
| Tree | One card per person, children below parents, no overlapping cards, collapse, generation window. |
| Search | Occupations, names, relationship words, and a folded spelling. |
| Backup | Checksum, tamper refusal, redaction, future fields, separate demonstration restore. |
| Store | Undo, identifier collisions, IndexedDB reopen, cascade delete. |
| Journey | Create an archive, add a person, search, reload the same store, and refuse to leave a dirty form. |

The journey runs in happy-dom. It is not a substitute for using the app in a browser. Phase 1 still needs a manual pass: create people, link them, pan the tree, export a backup, and restore it into an empty browser profile.

Large synthetic archives are not generated yet. The layout and search functions are pure and can take a generated set in a later performance test. Pagination is the 1.0 guard on long lists.
