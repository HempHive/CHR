import type { SCHEMA_VERSION } from '@/version';

/** A date as the researcher entered it, plus only the parts that were actually known. */
export type DatePrecision =
  | 'exact'
  | 'year'
  | 'month'
  | 'approximate'
  | 'before'
  | 'after'
  | 'range'
  | 'unknown';

export interface DateParts {
  year: number;
  month?: number;
  day?: number;
}

export interface FuzzyDate {
  precision: DatePrecision;
  /** The text the user typed. This is never rewritten into a false exact date. */
  original: string;
  start?: DateParts;
  end?: DateParts;
}

export type Privacy = 'private' | 'shared' | 'restricted';

export type LivingStatus = 'living' | 'deceased' | 'unknown';

export type Confidence = 'certain' | 'probable' | 'possible' | 'disputed' | 'unknown';

export type PlaceCertainty = 'exact' | 'approximate' | 'unknown';

export type NameKind = 'alternate' | 'historical' | 'nickname' | 'religious' | 'spelling' | 'custom';

export interface NameForm {
  id: string;
  value: string;
  kind: NameKind;
  from?: FuzzyDate | null;
  to?: FuzzyDate | null;
  notes: string;
}

export interface Occupation {
  id: string;
  title: string;
  place: string;
  start?: FuzzyDate | null;
  end?: FuzzyDate | null;
  notes: string;
}

export interface EducationRecord {
  id: string;
  institution: string;
  place: string;
  start?: FuzzyDate | null;
  end?: FuzzyDate | null;
  notes: string;
}

export interface Residence {
  id: string;
  place: string;
  start?: FuzzyDate | null;
  end?: FuzzyDate | null;
  notes: string;
}

export interface Person {
  id: string;
  archiveId: string;
  givenNames: string;
  middleNames: string;
  familyNames: string;
  preferredName: string;
  birthName: string;
  names: NameForm[];
  /** Voluntary. Relationship logic must not read this field. */
  gender: string | null;
  livingStatus: LivingStatus;
  birthDate: FuzzyDate | null;
  deathDate: FuzzyDate | null;
  birthPlace: string;
  deathPlace: string;
  birthPlaceCertainty: PlaceCertainty;
  deathPlaceCertainty: PlaceCertainty;
  occupations: Occupation[];
  education: EducationRecord[];
  residences: Residence[];
  nationalities: string[];
  biography: string;
  researchNotes: string;
  privacy: Privacy;
  /** Reserved for later media phases. Phase 1 preserves the arrays and does not display files. */
  photoIds: string[];
  documentIds: string[];
  audioIds: string[];
  videoIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type Parentage =
  | 'biological'
  | 'adoptive'
  | 'step'
  | 'foster'
  | 'guardian'
  | 'unknown'
  | 'custom';

export type PartnershipType =
  | 'spouse'
  | 'former_spouse'
  | 'partner'
  | 'former_partner'
  | 'unknown'
  | 'custom';

export type SiblingDegree = 'full' | 'half' | 'step' | 'legal' | 'unspecified' | 'custom';

export type RelationshipKind = 'parent_child' | 'partnership' | 'sibling' | 'custom';

/**
 * Directed where it matters.
 * parent_child: fromPersonId is the parent, toPersonId is the child.
 * partnership and sibling are pairwise; order is not meaningful.
 */
export interface Relationship {
  id: string;
  archiveId: string;
  kind: RelationshipKind;
  fromPersonId: string;
  toPersonId: string;
  parentage?: Parentage;
  partnershipType?: PartnershipType;
  siblingDegree?: SiblingDegree;
  customLabel: string;
  startDate: FuzzyDate | null;
  endDate: FuzzyDate | null;
  notes: string;
  confidence: Confidence;
  privacy: Privacy;
  sourceIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Archive {
  id: string;
  name: string;
  description: string;
  kind: 'family' | 'demonstration';
  schemaVersion: typeof SCHEMA_VERSION;
  /** Keys such as `duplicate:idA:idB` for review items the researcher has set aside. */
  dismissedAlerts: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Snapshot {
  archive: Archive;
  people: Person[];
  relationships: Relationship[];
}

export interface Issue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  personId?: string;
  relationshipId?: string;
}

export type BatchOp =
  | { op: 'put-archive'; archive: Archive }
  | { op: 'delete-archive'; id: string }
  | { op: 'put-person'; person: Person }
  | { op: 'delete-person'; id: string }
  | { op: 'put-relationship'; relationship: Relationship }
  | { op: 'delete-relationship'; id: string };
