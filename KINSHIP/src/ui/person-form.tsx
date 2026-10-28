import { useState } from 'react';
import { useArchive } from '@/app/archive-context';
import { dateInputValue, formatFuzzyDate, parseFuzzyDate } from '@/domain/dates';
import { createId } from '@/domain/ids';
import { hasAnyName } from '@/domain/names';
import type { EducationRecord, FuzzyDate, NameForm, NameKind, Occupation, Person, PlaceCertainty, Residence } from '@/domain/types';

export function PersonForm({ initial, isNew = false }: { initial: Person; isNew?: boolean }) {
  const { savePerson, navigate, setPageDirty } = useArchive();
  const [draft, setDraft] = useState(initial);
  const [nationalityText, setNationalityText] = useState(initial.nationalities.join(', '));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const update = (patch: Partial<Person>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setPageDirty(true);
  };

  return (
    <form
      className="page form-grid"
      onSubmit={(event) => {
        event.preventDefault();
        if (!hasAnyName(draft)) {
          setError('Enter a given name, family name, preferred name, birth name, or another name.');
          return;
        }
        setSaving(true);
        setError('');
        const person: Person = {
          ...draft,
          nationalities: nationalityText.split(',').map((item) => item.trim()).filter(Boolean),
        };
        void savePerson(person)
          .then((issues) => {
            setPageDirty(false);
            if (issues.length > 0) {
              setError(issues.map((issue) => issue.message).join(' '));
            }
            navigate({ name: 'person', id: person.id }, { force: true });
          })
          .catch((reason: unknown) => {
            setError(reason instanceof Error ? reason.message : 'The person could not be saved.');
          })
          .finally(() => setSaving(false));
      }}
    >
      <p className="eyebrow">{initial.givenNames || initial.familyNames ? 'Edit' : 'New person'}</p>
      <h1 id="page-title" tabIndex={-1}>
        {initial.givenNames || initial.familyNames ? 'Edit person' : 'Add a person'}
      </h1>
      <p className="fine-print">Gender is optional and is never used to guess relationships. Dates keep the words you type.</p>

      <fieldset>
        <legend>Names</legend>
        <div className="form-columns">
          <Text label="Given names" value={draft.givenNames} onChange={(givenNames) => update({ givenNames })} />
          <Text label="Middle names" value={draft.middleNames} onChange={(middleNames) => update({ middleNames })} />
          <Text label="Family names" value={draft.familyNames} onChange={(familyNames) => update({ familyNames })} />
          <Text label="Preferred name" value={draft.preferredName} onChange={(preferredName) => update({ preferredName })} />
          <Text label="Birth name" value={draft.birthName} onChange={(birthName) => update({ birthName })} />
        </div>
        <NameList
          names={draft.names}
          onChange={(names) => update({ names })}
        />
      </fieldset>

      <fieldset>
        <legend>Life</legend>
        <div className="form-columns">
          <label className="field">
            <span>Living status</span>
            <select value={draft.livingStatus} onChange={(event) => update({ livingStatus: event.target.value as Person['livingStatus'] })}>
              <option value="unknown">Unknown</option>
              <option value="living">Living</option>
              <option value="deceased">Deceased</option>
            </select>
          </label>
          <GenderField value={draft.gender} onChange={(gender) => update({ gender })} />
          <DateField label="Birth date" value={draft.birthDate} onChange={(birthDate) => update({ birthDate })} />
          <DateField label="Death date" value={draft.deathDate} onChange={(deathDate) => update({ deathDate })} />
          <Text label="Birthplace" value={draft.birthPlace} onChange={(birthPlace) => update({ birthPlace })} />
          <Certainty label="Birthplace certainty" value={draft.birthPlaceCertainty} onChange={(birthPlaceCertainty) => update({ birthPlaceCertainty })} />
          <Text label="Place of death" value={draft.deathPlace} onChange={(deathPlace) => update({ deathPlace })} />
          <Certainty label="Death place certainty" value={draft.deathPlaceCertainty} onChange={(deathPlaceCertainty) => update({ deathPlaceCertainty })} />
          <label className="field">
            <span>Privacy</span>
            <select value={draft.privacy} onChange={(event) => update({ privacy: event.target.value as Person['privacy'] })}>
              <option value="private">Private</option>
              <option value="shared">Shared within this archive</option>
              <option value="restricted">Restricted</option>
            </select>
            <small>Private is the default. Restricted people can be left out of a redacted export.</small>
          </label>
          <label className="field">
            <span>Nationalities</span>
            <input value={nationalityText} onChange={(event) => { setNationalityText(event.target.value); setPageDirty(true); }} />
            <small>Separate with commas. Leave blank if unknown.</small>
          </label>
        </div>
      </fieldset>

      <OccupationList items={draft.occupations} onChange={(occupations) => update({ occupations })} />
      <EducationList items={draft.education} onChange={(education) => update({ education })} />
      <ResidenceList items={draft.residences} onChange={(residences) => update({ residences })} />

      <fieldset>
        <legend>Notes</legend>
        <label className="field">
          <span>Biography</span>
          <textarea value={draft.biography} rows={5} onChange={(event) => update({ biography: event.target.value })} />
        </label>
        <label className="field">
          <span>Research notes</span>
          <textarea value={draft.researchNotes} rows={4} onChange={(event) => update({ researchNotes: event.target.value })} />
        </label>
      </fieldset>

      {error ? <p role="alert">{error}</p> : null}
      <div className="button-row">
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save person'}
        </button>
        <button
          type="button"
          className="btn quiet"
          onClick={() => navigate(isNew ? { name: 'people' } : { name: 'person', id: initial.id })}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Text({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Certainty({ label, value, onChange }: { label: string; value: PlaceCertainty; onChange: (value: PlaceCertainty) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as PlaceCertainty)}>
        <option value="unknown">Unknown</option>
        <option value="approximate">Approximate</option>
        <option value="exact">Exact</option>
      </select>
    </label>
  );
}

function DateField({ label, value, onChange }: { label: string; value: FuzzyDate | null; onChange: (value: FuzzyDate | null) => void }) {
  const text = dateInputValue(value);
  const [raw, setRaw] = useState(text);
  const parsed = parseFuzzyDate(raw);
  return (
    <label className="field">
      <span>{label}</span>
      <input
        value={raw}
        onChange={(event) => {
          setRaw(event.target.value);
          onChange(parseFuzzyDate(event.target.value));
        }}
        placeholder="12 March 1920, c. 1892, before 1900"
      />
      <small>{parsed ? `Stored as ${formatFuzzyDate(parsed)}. Original text is kept.` : 'Leave blank if it is not recorded.'}</small>
    </label>
  );
}

function GenderField({ value, onChange }: { value: string | null; onChange: (value: string | null) => void }) {
  const known = value === 'woman' || value === 'man' || value === 'non-binary';
  const choice = value === null ? '' : known ? value : 'custom';
  return (
    <div className="form-columns">
      <label className="field">
        <span>Gender, if you want it recorded</span>
        <select
          value={choice}
          onChange={(event) => {
            const next = event.target.value;
            if (!next) onChange(null);
            else if (next === 'custom') onChange(value && !known ? value : '');
            else onChange(next);
          }}
        >
          <option value="">Not recorded</option>
          <option value="woman">Woman</option>
          <option value="man">Man</option>
          <option value="non-binary">Non-binary</option>
          <option value="custom">Self-described</option>
        </select>
      </label>
      {choice === 'custom' ? (
        <Text label="Self-described gender" value={value ?? ''} onChange={(next) => onChange(next)} />
      ) : null}
    </div>
  );
}

function NameList({ names, onChange }: { names: NameForm[]; onChange: (names: NameForm[]) => void }) {
  return (
    <div className="stack">
      <h3>Other names</h3>
      {names.map((name, index) => (
        <div className="repeat-row" key={name.id}>
          <Text label={`Name ${index + 1}`} value={name.value} onChange={(value) => onChange(names.map((item) => (item.id === name.id ? { ...item, value } : item)))} />
          <label className="field">
            <span>Kind</span>
            <select
              value={name.kind}
              onChange={(event) => onChange(names.map((item) => (item.id === name.id ? { ...item, kind: event.target.value as NameKind } : item)))}
            >
              <option value="alternate">Alternate</option>
              <option value="historical">Historical</option>
              <option value="nickname">Nickname</option>
              <option value="religious">Religious</option>
              <option value="spelling">Spelling</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <Text label="Notes" value={name.notes} onChange={(notes) => onChange(names.map((item) => (item.id === name.id ? { ...item, notes } : item)))} />
          <button type="button" className="btn quiet" onClick={() => onChange(names.filter((item) => item.id !== name.id))}>
            Remove name {index + 1}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn quiet"
        onClick={() => onChange(names.concat({ id: createId(), value: '', kind: 'alternate', notes: '' }))}
      >
        Add another name
      </button>
    </div>
  );
}

function OccupationList({ items, onChange }: { items: Occupation[]; onChange: (items: Occupation[]) => void }) {
  return (
    <fieldset>
      <legend>Occupations</legend>
      {items.map((item, index) => (
        <div className="repeat-row" key={item.id}>
          <Text label={`Occupation ${index + 1}`} value={item.title} onChange={(title) => onChange(items.map((row) => (row.id === item.id ? { ...row, title } : row)))} />
          <Text label="Place" value={item.place} onChange={(place) => onChange(items.map((row) => (row.id === item.id ? { ...row, place } : row)))} />
          <Text label="Notes" value={item.notes} onChange={(notes) => onChange(items.map((row) => (row.id === item.id ? { ...row, notes } : row)))} />
          <button type="button" className="btn quiet" onClick={() => onChange(items.filter((row) => row.id !== item.id))}>
            Remove occupation {index + 1}
          </button>
        </div>
      ))}
      <button type="button" className="btn quiet" onClick={() => onChange(items.concat({ id: createId(), title: '', place: '', notes: '' }))}>
        Add occupation
      </button>
    </fieldset>
  );
}

function EducationList({ items, onChange }: { items: EducationRecord[]; onChange: (items: EducationRecord[]) => void }) {
  return (
    <fieldset>
      <legend>Education</legend>
      {items.map((item, index) => (
        <div className="repeat-row" key={item.id}>
          <Text label={`Institution ${index + 1}`} value={item.institution} onChange={(institution) => onChange(items.map((row) => (row.id === item.id ? { ...row, institution } : row)))} />
          <Text label="Place" value={item.place} onChange={(place) => onChange(items.map((row) => (row.id === item.id ? { ...row, place } : row)))} />
          <button type="button" className="btn quiet" onClick={() => onChange(items.filter((row) => row.id !== item.id))}>
            Remove education {index + 1}
          </button>
        </div>
      ))}
      <button type="button" className="btn quiet" onClick={() => onChange(items.concat({ id: createId(), institution: '', place: '', notes: '' }))}>
        Add education
      </button>
    </fieldset>
  );
}

function ResidenceList({ items, onChange }: { items: Residence[]; onChange: (items: Residence[]) => void }) {
  return (
    <fieldset>
      <legend>Residences</legend>
      {items.map((item, index) => (
        <div className="repeat-row" key={item.id}>
          <Text label={`Residence ${index + 1}`} value={item.place} onChange={(place) => onChange(items.map((row) => (row.id === item.id ? { ...row, place } : row)))} />
          <Text label="Notes" value={item.notes} onChange={(notes) => onChange(items.map((row) => (row.id === item.id ? { ...row, notes } : row)))} />
          <button type="button" className="btn quiet" onClick={() => onChange(items.filter((row) => row.id !== item.id))}>
            Remove residence {index + 1}
          </button>
        </div>
      ))}
      <button type="button" className="btn quiet" onClick={() => onChange(items.concat({ id: createId(), place: '', notes: '' }))}>
        Add residence
      </button>
    </fieldset>
  );
}
