import { useEffect, useMemo, useState } from 'react';
import { useArchive } from '@/app/archive-context';
import { writeRecent } from '@/app/preferences';
import { formatFuzzyDate } from '@/domain/dates';
import { createId } from '@/domain/ids';
import { createPerson, createRelationship } from '@/domain/factory';
import { displayName, fullName, lifespanLabel, presentationName } from '@/domain/names';
import type { Confidence, Parentage, PartnershipType, Relationship, SiblingDegree } from '@/domain/types';
import { calculatedSiblings, recordedLinks } from '@/genealogy/graph';
import { profileGaps } from '@/genealogy/validate';
import { ConfirmDialog } from '@/ui/widgets';

export function PersonPage({ id }: { id: string }) {
  const app = useArchive();
  const person = app.people.find((item) => item.id === id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [relOpen, setRelOpen] = useState(false);

  useEffect(() => {
    if (person && app.archive) writeRecent(app.archive.id, person.id);
  }, [app.archive, person]);

  if (!person || !app.archive) {
    return (
      <div className="page">
        <h1 id="page-title" tabIndex={-1}>Person not found</h1>
        <p>That person is not in the open archive.</p>
      </div>
    );
  }

  const concealed = app.preferences.concealLiving && person.livingStatus === 'living';
  const links = recordedLinks(person.id, app.relationships);
  const siblings = calculatedSiblings(person.id, app.people, app.relationships);
  const gaps = profileGaps(person, app.relationships);
  const groups = [
    { title: 'Parents and carers', items: links.filter((link) => /parent|guardian|foster|step-parent|custom/i.test(link.role) && !link.role.startsWith('Child') && !link.role.startsWith('Stepchild') && !link.role.startsWith('Foster child')) },
    { title: 'Partners', items: links.filter((link) => /spouse|partner/i.test(link.role)) },
    { title: 'Children', items: links.filter((link) => /child|stepchild|guardianship/i.test(link.role)) },
    { title: 'Recorded siblings', items: links.filter((link) => /sibling/i.test(link.role)) },
    { title: 'Other relationships', items: links.filter((link) => link.role === 'Related' || (!/parent|guardian|spouse|partner|child|sibling|step/i.test(link.role) && link.basis === 'recorded')) },
  ];

  return (
    <div className="page">
      <p className="eyebrow">{person.privacy === 'restricted' ? 'Restricted record' : 'Person'}</p>
      <div className="page-head">
        <h1 id="page-title" tabIndex={-1}>{concealed ? 'Living person' : fullName(person)}</h1>
        <div className="button-row">
          <button type="button" className="btn primary" onClick={() => app.navigate({ name: 'person-edit', id: person.id })}>
            Edit details
          </button>
          <button type="button" className="btn quiet" onClick={() => setRelOpen(true)}>
            Add relationship
          </button>
          <button type="button" className="btn danger" onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        </div>
      </div>
      {concealed ? (
        <p className="banner">Details are concealed on this device. Turn off “Conceal living people” in Settings to read this profile.</p>
      ) : (
        <>
          <p className="lede">{lifespanLabel(person)}</p>
          {person.preferredName && person.preferredName !== fullName(person) ? <p>Preferred name: {person.preferredName}</p> : null}
          <dl className="facts">
            <Fact term="Birth" value={datePlace(person.birthDate, person.birthPlace, person.birthPlaceCertainty)} />
            <Fact term="Death" value={person.livingStatus === 'living' ? 'Living' : datePlace(person.deathDate, person.deathPlace, person.deathPlaceCertainty)} />
            <Fact term="Birth name" value={person.birthName || 'Not recorded'} />
            <Fact term="Gender" value={person.gender || 'Not recorded'} />
            <Fact term="Living status" value={person.livingStatus} />
          </dl>
          {person.names.length > 0 ? (
            <section>
              <h2>Other names</h2>
              <ul className="plain-list">
                {person.names.map((name) => (
                  <li key={name.id}>{name.value || 'Untitled'} · {name.kind}{name.notes ? ` · ${name.notes}` : ''}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {person.biography ? (
            <section>
              <h2>Biography</h2>
              <p className="prose">{person.biography}</p>
            </section>
          ) : null}
          {person.occupations.length > 0 ? <SimpleList title="Occupations" rows={person.occupations.map((item) => [item.title, item.place, item.notes].filter(Boolean).join(' · '))} /> : null}
          {person.education.length > 0 ? <SimpleList title="Education" rows={person.education.map((item) => [item.institution, item.place].filter(Boolean).join(' · '))} /> : null}
          {person.residences.length > 0 ? <SimpleList title="Residences" rows={person.residences.map((item) => item.place || item.notes)} /> : null}
          {person.researchNotes ? (
            <section>
              <h2>Research notes</h2>
              <p className="prose">{person.researchNotes}</p>
            </section>
          ) : null}
          {gaps.length > 0 ? <p className="fine-print">Gaps: {gaps.join(', ')}.</p> : null}
        </>
      )}

      {groups.map((group) =>
        group.items.length === 0 ? null : (
          <section key={group.title}>
            <h2>{group.title}</h2>
            <ul className="plain-list">
              {group.items.map((link) => {
                const other = app.people.find((item) => item.id === link.otherId);
                const name = other ? presentationName(other, app.preferences.concealLiving) : 'Missing person';
                return (
                  <li key={`${link.relationshipId}-${link.role}-${link.otherId}`}>
                    <button type="button" className="text-link" onClick={() => app.navigate({ name: 'person', id: link.otherId })}>
                      {name}
                    </button>
                    <span> · {link.role}</span>
                    {link.confidence !== 'certain' ? <span> · {link.confidence}</span> : null}
                    {link.notes ? <span className="muted"> · {link.notes}</span> : null}
                    {link.relationshipId ? (
                      <button type="button" className="btn quiet tiny" onClick={() => void app.deleteRelationship(link.relationshipId!)}>
                        Remove relationship
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ),
      )}

      {siblings.length > 0 ? (
        <section>
          <h2>Calculated siblings</h2>
          <p className="fine-print">Calculated from parents. A marriage by itself does not create these links.</p>
          <ul className="plain-list">
            {siblings.map((link) => {
              const other = app.people.find((item) => item.id === link.otherId);
              return (
                <li key={link.otherId + link.role}>
                  <button type="button" className="text-link" onClick={() => app.navigate({ name: 'person', id: link.otherId })}>
                    {other ? presentationName(other, app.preferences.concealLiving) : 'Missing person'}
                  </button>
                  <span> · {link.role}</span>
                  {link.notes ? <span className="muted"> · {link.notes}</span> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {relOpen ? <RelationshipDialog personId={person.id} onClose={() => setRelOpen(false)} /> : null}
      {confirmDelete ? (
        <ConfirmDialog
          title={`Delete ${displayName(person)}?`}
          body="This removes the person and every relationship that names them. You can undo it afterwards from the header, until you close the archive."
          confirmLabel="Delete person"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            void app.deletePerson(person.id).then(() => app.navigate({ name: 'people' }, { force: true }));
          }}
        />
      ) : null}
    </div>
  );
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt>{term}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function SimpleList({ title, rows }: { title: string; rows: string[] }) {
  return (
    <section>
      <h2>{title}</h2>
      <ul className="plain-list">
        {rows.map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
    </section>
  );
}

function datePlace(date: Parameters<typeof formatFuzzyDate>[0], place: string, certainty: string): string {
  const when = formatFuzzyDate(date);
  const where = place.trim() ? `${place} (${certainty})` : 'Place not recorded';
  return `${when} · ${where}`;
}

function RelationshipDialog({ personId, onClose }: { personId: string; onClose: () => void }) {
  const app = useArchive();
  const [kind, setKind] = useState<'parent' | 'child' | 'partner' | 'sibling' | 'custom'>('parent');
  const [otherId, setOtherId] = useState('');
  const [newName, setNewName] = useState('');
  const [parentage, setParentage] = useState<Parentage>('biological');
  const [partnershipType, setPartnershipType] = useState<PartnershipType>('spouse');
  const [siblingDegree, setSiblingDegree] = useState<SiblingDegree>('unspecified');
  const [customLabel, setCustomLabel] = useState('');
  const [confidence, setConfidence] = useState<Confidence>('certain');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const others = useMemo(() => app.people.filter((person) => person.id !== personId), [app.people, personId]);

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog wide" role="dialog" aria-modal="true" aria-labelledby="rel-title">
        <h2 id="rel-title">Add relationship</h2>
        <div className="form-grid">
          <label className="field">
            <span>This person is…</span>
            <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
              <option value="parent">the child of the other person</option>
              <option value="child">the parent of the other person</option>
              <option value="partner">a partner of the other person</option>
              <option value="sibling">a sibling of the other person</option>
              <option value="custom">otherwise related</option>
            </select>
          </label>
          <label className="field">
            <span>Other person already in the archive</span>
            <select value={otherId} onChange={(event) => setOtherId(event.target.value)}>
              <option value="">Choose a person</option>
              {others.map((person) => (
                <option key={person.id} value={person.id}>
                  {presentationName(person, app.preferences.concealLiving)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Or create the other person by name</span>
            <input value={newName} onChange={(event) => setNewName(event.target.value)} />
          </label>
          {kind === 'parent' || kind === 'child' ? (
            <label className="field">
              <span>Parentage</span>
              <select value={parentage} onChange={(event) => setParentage(event.target.value as Parentage)}>
                <option value="biological">Biological</option>
                <option value="adoptive">Adoptive</option>
                <option value="step">Step</option>
                <option value="foster">Foster</option>
                <option value="guardian">Guardian</option>
                <option value="unknown">Unknown</option>
                <option value="custom">Custom</option>
              </select>
            </label>
          ) : null}
          {kind === 'partner' ? (
            <label className="field">
              <span>Partnership</span>
              <select value={partnershipType} onChange={(event) => setPartnershipType(event.target.value as PartnershipType)}>
                <option value="spouse">Spouse</option>
                <option value="former_spouse">Former spouse</option>
                <option value="partner">Unmarried partner</option>
                <option value="former_partner">Former partner</option>
                <option value="unknown">Unknown</option>
                <option value="custom">Custom</option>
              </select>
            </label>
          ) : null}
          {kind === 'sibling' ? (
            <label className="field">
              <span>Sibling record</span>
              <select value={siblingDegree} onChange={(event) => setSiblingDegree(event.target.value as SiblingDegree)}>
                <option value="unspecified">Unspecified</option>
                <option value="full">Full</option>
                <option value="half">Half</option>
                <option value="step">Step</option>
                <option value="legal">Through care or adoption</option>
                <option value="custom">Custom</option>
              </select>
            </label>
          ) : null}
          {kind === 'custom' || parentage === 'custom' || partnershipType === 'custom' || siblingDegree === 'custom' ? (
            <label className="field">
              <span>Custom description</span>
              <input value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} />
            </label>
          ) : null}
          <label className="field">
            <span>Confidence</span>
            <select value={confidence} onChange={(event) => setConfidence(event.target.value as Confidence)}>
              <option value="certain">Certain</option>
              <option value="probable">Probable</option>
              <option value="possible">Possible</option>
              <option value="disputed">Disputed</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>
          <label className="field">
            <span>Notes</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
          </label>
          {error ? <p role="alert">{error}</p> : null}
          {warnings.map((warning) => (
            <p key={warning} role="status">{warning}</p>
          ))}
        </div>
        <div className="button-row">
          <button type="button" className="btn quiet" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              if (!app.archive) return;
              const trimmed = newName.trim();
              if (!trimmed && !otherId) {
                setError('Choose a person or enter a name to create one.');
                return;
              }
              const created = trimmed ? createPerson(app.archive.id, { givenNames: trimmed }) : null;
              const targetId = created?.id ?? otherId;
              const base = createRelationship(app.archive.id, {
                kind: kind === 'parent' || kind === 'child' ? 'parent_child' : kind === 'partner' ? 'partnership' : kind === 'sibling' ? 'sibling' : 'custom',
                fromPersonId: kind === 'parent' ? targetId : personId,
                toPersonId: kind === 'parent' ? personId : targetId,
                parentage,
                partnershipType,
                siblingDegree,
                customLabel,
                confidence,
                notes,
              });
              const relationship: Relationship = { ...base, id: createId(), customLabel, notes, confidence, parentage: base.parentage, partnershipType: base.partnershipType, siblingDegree: base.siblingDegree };
              if (kind === 'partner') {
                relationship.fromPersonId = personId;
                relationship.toPersonId = targetId;
              }
              if (kind === 'sibling' || kind === 'custom') {
                relationship.fromPersonId = personId;
                relationship.toPersonId = targetId;
              }
              void app.saveRelationship(relationship, created ?? undefined).then((issues) => {
                const blocking = issues.filter((issue) => issue.severity === 'error');
                if (blocking.length > 0) {
                  setError(blocking.map((issue) => issue.message).join(' '));
                  setWarnings([]);
                  return;
                }
                setWarnings(issues.map((issue) => issue.message));
                setError('');
                if (issues.length === 0) onClose();
              }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'The relationship could not be saved.'));
            }}
          >
            Save relationship
          </button>
        </div>
      </div>
    </div>
  );
}
