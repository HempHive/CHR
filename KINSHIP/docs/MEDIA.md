# Media

Not implemented in 1.0. The archive works with no photographs.

## Intended pipeline

1. The researcher imports an original. JPEG, PNG, WebP, and, where the platform can decode them, AVIF, TIFF, and HEIC.
2. The original is stored once, addressed by its SHA-256. Processing never writes over that file.
3. A browsing derivative and a thumbnail are separate objects. WebP or AVIF is a candidate, not a rule. If a derivative is larger than the original, keep a smaller honest copy instead of assuming AVIF wins.
4. The person link and any face region are records, not pixels baked into a derivative. Regions are stored in the original image's coordinate space.
5. Duplicate imports match the original hash. Orphans are files with no record. Deletion of a derivative must not delete the original unless the researcher is deleting the photograph itself, with a warning.

Video previews and audio waveforms follow the same split: original kept, derivative disposable.

## What 1.0 already reserves

Person documents have `photoIds`, `documentIds`, `audioIds`, and `videoIds`. Backup and restore keep the arrays. They do not contain bytes. A file that references media warns that this version cannot restore the binaries.

## Not the photograph format

Gaussian splatting may one day reconstruct a room or an object. It is a scene format, not a photograph archive. The family archive must open if splats are absent. 3D is not a dependency of the core record.

## Privacy

No photograph is sent to a third party by default. Manual tagging is the identification method. Automated face matching is not part of the design of 1.0 and needs its own consent and security review before any code is written.
