import { createId, nowIso } from '@/domain/ids';
import type {
  Archive,
  Confidence,
  Parentage,
  PartnershipType,
  Person,
  Privacy,
  Relationship,
  RelationshipKind,
  SiblingDegree,
} from '@/domain/types';
import { SCHEMA_VERSION } from '@/version';

export function createArchive(input: { name: string; description?: string; kind?: Archive['kind'] }): Archive {
  const now = nowIso();
  return {
    id: createId(),
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    kind: input.kind ?? 'family',
    schemaVersion: SCHEMA_VERSION,
    dismissedAlerts: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createPerson(archiveId: string, input: Partial<Person> = {}): Person {
  const now = nowIso();
  return {
    id: input.id ?? createId(),
    archiveId,
    givenNames: input.givenNames ?? '',
    middleNames: input.middleNames ?? '',
    familyNames: input.familyNames ?? '',
    preferredName: input.preferredName ?? '',
    birthName: input.birthName ?? '',
    names: input.names ?? [],
    gender: input.gender ?? null,
    livingStatus: input.livingStatus ?? 'unknown',
    birthDate: input.birthDate ?? null,
    deathDate: input.deathDate ?? null,
    birthPlace: input.birthPlace ?? '',
    deathPlace: input.deathPlace ?? '',
    birthPlaceCertainty: input.birthPlaceCertainty ?? 'unknown',
    deathPlaceCertainty: input.deathPlaceCertainty ?? 'unknown',
    occupations: input.occupations ?? [],
    education: input.education ?? [],
    residences: input.residences ?? [],
    nationalities: input.nationalities ?? [],
    biography: input.biography ?? '',
    researchNotes: input.researchNotes ?? '',
    privacy: input.privacy ?? 'private',
    photoIds: input.photoIds ?? [],
    documentIds: input.documentIds ?? [],
    audioIds: input.audioIds ?? [],
    videoIds: input.videoIds ?? [],
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

export function createRelationship(
  archiveId: string,
  input: {
    kind: RelationshipKind;
    fromPersonId: string;
    toPersonId: string;
    parentage?: Parentage;
    partnershipType?: PartnershipType;
    siblingDegree?: SiblingDegree;
    customLabel?: string;
    confidence?: Confidence;
    privacy?: Privacy;
    notes?: string;
  },
): Relationship {
  const now = nowIso();
  return {
    id: createId(),
    archiveId,
    kind: input.kind,
    fromPersonId: input.fromPersonId,
    toPersonId: input.toPersonId,
    parentage: input.kind === 'parent_child' ? input.parentage ?? 'biological' : undefined,
    partnershipType: input.kind === 'partnership' ? input.partnershipType ?? 'spouse' : undefined,
    siblingDegree: input.kind === 'sibling' ? input.siblingDegree ?? 'unspecified' : undefined,
    customLabel: input.customLabel ?? '',
    startDate: null,
    endDate: null,
    notes: input.notes ?? '',
    confidence: input.confidence ?? 'certain',
    privacy: input.privacy ?? 'private',
    sourceIds: [],
    createdAt: now,
    updatedAt: now,
  };
}
