import type { Archive, FuzzyDate, Person, Relationship, Snapshot } from '@/domain/types';
import { archiveIssues } from '@/genealogy/validate';
import { APP_VERSION, BACKUP_FORMAT, BACKUP_FORMAT_VERSION, SCHEMA_VERSION } from '@/version';

export interface RedactionOptions {
  excludeRestricted: boolean;
  excludeLiving: boolean;
}

export interface KinshipBackup {
  format: typeof BACKUP_FORMAT;
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  appVersion: string;
  exportedAt: string;
  completeness: 'full' | 'redacted';
  redaction: RedactionOptions;
  checksum: { algorithm: 'SHA-256'; value: string };
  archive: Archive;
  people: Person[];
  relationships: Relationship[];
}

export interface BackupPreview {
  archiveName: string;
  kind: Archive['kind'];
  people: number;
  relationships: number;
  completeness: 'full' | 'redacted';
  exportedAt: string;
  warnings: string[];
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'checksum')
      .sort((left, right) => left[0].localeCompare(right[0]));
    return Object.fromEntries(entries.map(([key, entry]) => [key, sortValue(entry)]));
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function redactSnapshot(snapshot: Snapshot, options: RedactionOptions): Snapshot {
  if (!options.excludeRestricted && !options.excludeLiving) return snapshot;
  const removed = new Set<string>();
  for (const person of snapshot.people) {
    if (options.excludeRestricted && person.privacy === 'restricted') removed.add(person.id);
    if (options.excludeLiving && person.livingStatus === 'living') removed.add(person.id);
  }
  return {
    archive: snapshot.archive,
    people: snapshot.people.filter((person) => !removed.has(person.id)),
    relationships: snapshot.relationships.filter((relationship) => {
      if (removed.has(relationship.fromPersonId) || removed.has(relationship.toPersonId)) return false;
      if (options.excludeRestricted && relationship.privacy === 'restricted') return false;
      return true;
    }),
  };
}

export async function createBackup(snapshot: Snapshot, options: RedactionOptions = { excludeRestricted: false, excludeLiving: false }): Promise<KinshipBackup> {
  const redacted = redactSnapshot(snapshot, options);
  const completeness: 'full' | 'redacted' = options.excludeLiving || options.excludeRestricted ? 'redacted' : 'full';
  const payload = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    completeness,
    redaction: options,
    archive: redacted.archive,
    people: redacted.people,
    relationships: redacted.relationships,
  };
  const checksum = await sha256Hex(stableStringify(payload));
  return { ...payload, checksum: { algorithm: 'SHA-256', value: checksum } };
}

export async function parseBackup(raw: string): Promise<{ ok: true; backup: KinshipBackup } | { ok: false; errors: string[] }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch {
    return { ok: false, errors: ['The file is not valid JSON.'] };
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, errors: ['The backup file is empty.'] };
  const record = parsed as Record<string, unknown>;
  const errors: string[] = [];
  if (record.format !== BACKUP_FORMAT) errors.push('This file is not a KINSHIP backup.');
  if (record.formatVersion !== BACKUP_FORMAT_VERSION) {
    errors.push(`This backup uses format version ${String(record.formatVersion)}. This version of KINSHIP reads format ${BACKUP_FORMAT_VERSION}.`);
  }
  const checksum = record.checksum as { algorithm?: string; value?: string } | undefined;
  if (!checksum || checksum.algorithm !== 'SHA-256' || typeof checksum.value !== 'string') {
    errors.push('The backup has no SHA-256 checksum.');
  }
  if (errors.length > 0) return { ok: false, errors };

  const { checksum: _ignored, ...rest } = record;
  void _ignored;
  const expected = await sha256Hex(stableStringify(rest));
  if (expected !== checksum?.value) {
    return { ok: false, errors: ['The checksum does not match. The file was changed after it was exported, so it was not imported.'] };
  }

  const archive = normaliseArchive(record.archive, errors);
  const people = Array.isArray(record.people) ? record.people.map((person, index) => normalisePerson(person, archive?.id ?? '', errors, index)) : null;
  const relationships = Array.isArray(record.relationships)
    ? record.relationships.map((relationship, index) => normaliseRelationship(relationship, archive?.id ?? '', errors, index))
    : null;
  if (!archive || !people || !relationships) {
    if (!Array.isArray(record.people)) errors.push('People must be a list.');
    if (!Array.isArray(record.relationships)) errors.push('Relationships must be a list.');
    return { ok: false, errors };
  }
  const keptPeople = people.filter((person): person is Person => Boolean(person));
  const keptRelationships = relationships.filter((relationship): relationship is Relationship => Boolean(relationship));
  if (errors.length > 0 || !archive) return { ok: false, errors };

  const issues = archiveIssues(keptPeople, keptRelationships).filter((issue) => issue.severity === 'error');
  if (issues.length > 0) return { ok: false, errors: issues.map((issue) => issue.message) };

  const backup: KinshipBackup = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: typeof record.appVersion === 'string' ? record.appVersion : APP_VERSION,
    exportedAt: typeof record.exportedAt === 'string' ? record.exportedAt : '',
    completeness: record.completeness === 'redacted' ? 'redacted' : 'full',
    redaction: {
      excludeRestricted: Boolean((record.redaction as RedactionOptions | undefined)?.excludeRestricted),
      excludeLiving: Boolean((record.redaction as RedactionOptions | undefined)?.excludeLiving),
    },
    checksum: { algorithm: 'SHA-256', value: checksum.value },
    archive,
    people: keptPeople,
    relationships: keptRelationships,
  };
  return { ok: true, backup };
}

export function previewBackup(backup: KinshipBackup): BackupPreview {
  const warnings: string[] = [];
  if (backup.completeness === 'redacted') {
    warnings.push('This backup is redacted. It is not a complete copy of the archive.');
  }
  if (backup.archive.kind === 'demonstration') {
    warnings.push('This backup is the fictional demonstration archive.');
  }
  const mediaRefs = backup.people.some((person) => person.photoIds.length || person.documentIds.length || person.audioIds.length || person.videoIds.length);
  if (mediaRefs) warnings.push('This backup refers to media files. This version stores the references and does not restore media binaries.');
  const warningsFromData = archiveIssues(backup.people, backup.relationships).filter((issue) => issue.severity === 'warning');
  warnings.push(...warningsFromData.map((issue) => issue.message));
  return {
    archiveName: backup.archive.name,
    kind: backup.archive.kind,
    people: backup.people.length,
    relationships: backup.relationships.length,
    completeness: backup.completeness,
    exportedAt: backup.exportedAt,
    warnings,
  };
}

export function backupToSnapshot(backup: KinshipBackup): Snapshot {
  return { archive: backup.archive, people: backup.people, relationships: backup.relationships };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normaliseArchive(value: unknown, errors: string[]): Archive | null {
  if (!isRecord(value)) {
    errors.push('The archive record is missing.');
    return null;
  }
  if (typeof value.id !== 'string' || !value.id.trim()) errors.push('The archive identifier is missing.');
  if (typeof value.name !== 'string' || !value.name.trim()) errors.push('The archive name is missing.');
  if (value.kind !== 'family' && value.kind !== 'demonstration') errors.push('The archive kind is not recognised.');
  if (value.schemaVersion !== SCHEMA_VERSION) errors.push(`Unsupported archive schema version ${String(value.schemaVersion)}.`);
  if (errors.length > 0) return null;
  const archive = value as unknown as Archive;
  archive.dismissedAlerts = Array.isArray(archive.dismissedAlerts) ? archive.dismissedAlerts.filter((item) => typeof item === 'string') : [];
  archive.description = typeof archive.description === 'string' ? archive.description : '';
  return archive;
}

function normalisePerson(value: unknown, archiveId: string, errors: string[], index: number): Person | null {
  if (!isRecord(value)) {
    errors.push(`Person ${index + 1} is not a record.`);
    return null;
  }
  const person = value as unknown as Person;
  if (typeof person.id !== 'string' || !person.id) errors.push(`Person ${index + 1} has no identifier.`);
  if (person.archiveId !== archiveId) errors.push(`Person ${index + 1} belongs to a different archive.`);
  for (const field of ['givenNames', 'middleNames', 'familyNames', 'preferredName', 'birthName', 'biography', 'researchNotes', 'birthPlace', 'deathPlace'] as const) {
    if (typeof person[field] !== 'string') errors.push(`Person ${index + 1} has an invalid ${field}.`);
  }
  if (person.livingStatus !== 'living' && person.livingStatus !== 'deceased' && person.livingStatus !== 'unknown') {
    errors.push(`Person ${index + 1} has an invalid living status.`);
  }
  if (person.privacy !== 'private' && person.privacy !== 'shared' && person.privacy !== 'restricted') {
    errors.push(`Person ${index + 1} has an invalid privacy setting.`);
  }
  person.birthDate = cleanDate(person.birthDate, errors, `Person ${index + 1} birth date`);
  person.deathDate = cleanDate(person.deathDate, errors, `Person ${index + 1} death date`);
  if (!Array.isArray(person.names)) person.names = [];
  if (!Array.isArray(person.occupations)) person.occupations = [];
  if (!Array.isArray(person.education)) person.education = [];
  if (!Array.isArray(person.residences)) person.residences = [];
  if (!Array.isArray(person.nationalities)) person.nationalities = [];
  for (const key of ['photoIds', 'documentIds', 'audioIds', 'videoIds'] as const) {
    if (!Array.isArray(person[key])) person[key] = [];
  }
  return person;
}

function normaliseRelationship(value: unknown, archiveId: string, errors: string[], index: number): Relationship | null {
  if (!isRecord(value)) {
    errors.push(`Relationship ${index + 1} is not a record.`);
    return null;
  }
  const relationship = value as unknown as Relationship;
  if (typeof relationship.id !== 'string' || !relationship.id) errors.push(`Relationship ${index + 1} has no identifier.`);
  if (relationship.archiveId !== archiveId) errors.push(`Relationship ${index + 1} belongs to a different archive.`);
  if (!['parent_child', 'partnership', 'sibling', 'custom'].includes(relationship.kind)) {
    errors.push(`Relationship ${index + 1} has an unsupported kind.`);
  }
  if (typeof relationship.fromPersonId !== 'string' || typeof relationship.toPersonId !== 'string') {
    errors.push(`Relationship ${index + 1} is missing a person.`);
  }
  relationship.startDate = cleanDate(relationship.startDate, errors, `Relationship ${index + 1} start date`);
  relationship.endDate = cleanDate(relationship.endDate, errors, `Relationship ${index + 1} end date`);
  if (typeof relationship.notes !== 'string') relationship.notes = '';
  if (typeof relationship.customLabel !== 'string') relationship.customLabel = '';
  if (!Array.isArray(relationship.sourceIds)) relationship.sourceIds = [];
  return relationship;
}

function cleanDate(value: unknown, errors: string[], label: string): FuzzyDate | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || typeof value.precision !== 'string' || typeof value.original !== 'string') {
    errors.push(`${label} is not a KINSHIP date.`);
    return null;
  }
  const precision = value.precision;
  const allowed = ['exact', 'year', 'month', 'approximate', 'before', 'after', 'range', 'unknown'];
  if (!allowed.includes(precision)) {
    errors.push(`${label} has an unknown precision.`);
    return null;
  }
  if (precision === 'exact') {
    const start = value.start as { year?: number; month?: number; day?: number } | undefined;
    if (!start || !start.year || !start.month || !start.day) errors.push(`${label} claims to be exact but is missing a full date.`);
  }
  return value as unknown as FuzzyDate;
}
