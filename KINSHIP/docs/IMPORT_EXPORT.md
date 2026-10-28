# Import and export

## Implemented: KINSHIP backup format 1

```json
{
  "format": "kinship-backup",
  "formatVersion": 1,
  "appVersion": "1.0.0",
  "exportedAt": "ISO-8601",
  "completeness": "full",
  "redaction": { "excludeRestricted": false, "excludeLiving": false },
  "checksum": { "algorithm": "SHA-256", "value": "hex" },
  "archive": {},
  "people": [],
  "relationships": []
}
```

The checksum covers the canonical JSON of every field except `checksum`. Keys are sorted. A failed checksum, an unknown format version, a broken person, or a relationship that points nowhere is rejected. The open archive is not modified.

Warnings inside an otherwise valid file, such as a parent cycle, are shown before restore and do not block it. The researcher already chose to keep that contradiction.

Unknown fields on a person are kept, so a newer file can round-trip through 1.0 without being stripped, as long as the format version is still 1. A higher format version is refused rather than silently dropped.

## Designed: GEDCOM

Not implemented. When it is, it should be one documented GEDCOM version, previewed before any write, and never an automatic overwrite. Unsupported tags should be listed as possible data loss. Export should be something another program can parse, and the test should prove that, not only that our importer accepts our exporter.

GEDCOM will not be the preservation format. The KINSHIP backup is. GEDCOM loses uncertainty, privacy, and media that this model is required to keep.

## Designed: later exports

Tree SVG is implemented for the current drawing. PDF and video are later. They are not buttons in 1.0.
