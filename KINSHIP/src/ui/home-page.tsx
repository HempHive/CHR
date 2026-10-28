import { useEffect, useMemo, useState } from 'react';
import { useArchive } from '@/app/archive-context';
import { dismissPrivacyNote, privacyNoteDismissed, readRecent } from '@/app/preferences';
import { displayName, lifespanLabel } from '@/domain/names';
import { findPossibleDuplicates, profileGaps } from '@/genealogy/validate';
import { archiveStats, featuredBiography, formatWhen, upcomingAnniversaries } from '@/genealogy/stats';

export function HomePage() {
  const { archive, people, relationships, preferences, setPreferences, navigate } = useArchive();
  const [noteHidden, setNoteHidden] = useState(() => privacyNoteDismissed());
  const [recentIds, setRecentIds] = useState<string[]>([]);

  useEffect(() => {
    if (archive) setRecentIds(readRecent(archive.id));
  }, [archive, people]);

  const stats = useMemo(() => (archive ? archiveStats(people, relationships) : null), [archive, people, relationships]);
  const featured = useMemo(() => featuredBiography(people), [people]);
  const gaps = useMemo(
    () => people.map((person) => ({ person, gaps: profileGaps(person, relationships) })).filter((item) => item.gaps.length > 0).slice(0, 6),
    [people, relationships],
  );
  const duplicates = useMemo(
    () => (archive ? findPossibleDuplicates(people, archive.dismissedAlerts) : []),
    [archive, people],
  );
  const anniversaries = useMemo(
    () => upcomingAnniversaries(people, new Date(), preferences.concealLiving),
    [people, preferences.concealLiving],
  );
  const recent = recentIds.map((id) => people.find((person) => person.id === id)).filter((person) => person !== undefined);
  const living = people.filter((person) => person.livingStatus === 'living').length;

  if (!archive || !stats) return null;

  return (
    <div className="page">
      <p className="eyebrow">{archive.kind === 'demonstration' ? 'Fictional demonstration' : 'Family archive'}</p>
      <h1 id="page-title" tabIndex={-1}>
        {archive.name}
      </h1>
      {archive.description ? <p className="lede">{archive.description}</p> : <p className="lede">Add people, connect them, and return to the same archive on this device.</p>}
      {archive.kind === 'demonstration' ? (
        <p className="banner" role="note">
          These people are invented. This archive is stored separately from any family archive you create.
        </p>
      ) : null}
      {living > 0 && !preferences.concealLiving && !noteHidden ? (
        <div className="banner" role="note">
          <p>
            This archive includes {living} living {living === 1 ? 'person' : 'people'}. Conceal them before showing the tree to anyone else.
          </p>
          <div className="button-row">
            <button type="button" className="btn quiet" onClick={() => setPreferences({ ...preferences, concealLiving: true })}>
              Conceal living people
            </button>
            <button
              type="button"
              className="btn quiet"
              onClick={() => {
                dismissPrivacyNote();
                setNoteHidden(true);
              }}
            >
              Dismiss for now
            </button>
          </div>
        </div>
      ) : null}

      <div className="stat-grid">
        <Stat value={stats.people} label="People" />
        <Stat value={stats.generations} label="Generations" />
        <Stat value={stats.relationships} label="Relationships" />
        <Stat value={stats.places} label="Places" />
        <Stat value={stats.living} label="Living" />
        <Stat value={stats.deceased} label="Deceased" />
      </div>
      <p className="fine-print">Photographs, documents, and recordings are not part of this version. Those counts are not shown, because there is no media archive yet.</p>

      <div className="split">
        <section className="panel">
          <h2>From the archive</h2>
          {featured ? (
            <blockquote>
              <p>{featured.text}</p>
              <button type="button" className="text-link" onClick={() => navigate({ name: 'person', id: featured.personId })}>
                {featured.name}
              </button>
            </blockquote>
          ) : (
            <p>Add a biography and it will be quoted here. Nothing is invented to fill this space.</p>
          )}
          <div className="button-row">
            <button type="button" className="btn primary" onClick={() => navigate({ name: 'tree' })}>
              Open the family tree
            </button>
            <button type="button" className="btn quiet" onClick={() => navigate({ name: 'person-new' })}>
              Add a person
            </button>
          </div>
        </section>
        <section className="panel">
          <h2>Dates with a known day</h2>
          {anniversaries.length === 0 ? <p>No exact birth or death days are recorded yet.</p> : null}
          <ul className="plain-list">
            {anniversaries.map((item) => (
              <li key={`${item.personId}-${item.kind}`}>
                <button type="button" className="text-link" onClick={() => navigate({ name: 'person', id: item.personId })}>
                  {formatWhen(item.next)}
                </button>
                <span> · {item.label}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="split">
        <section className="panel">
          <h2>Recently opened</h2>
          {recent.length === 0 ? <p>People you open will be listed here, on this device only.</p> : null}
          <ul className="plain-list">
            {recent.map((person) => (
              <li key={person.id}>
                <button type="button" className="text-link" onClick={() => navigate({ name: 'person', id: person.id })}>
                  {preferences.concealLiving && person.livingStatus === 'living' ? 'Living person' : displayName(person)}
                </button>
                <span className="muted"> · {preferences.concealLiving && person.livingStatus === 'living' ? 'Details concealed' : lifespanLabel(person)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel">
          <h2>Incomplete records</h2>
          {gaps.length === 0 ? <p>No obvious gaps in the records opened here.</p> : null}
          <ul className="plain-list">
            {gaps.map(({ person, gaps: personGaps }) => (
              <li key={person.id}>
                <button type="button" className="text-link" onClick={() => navigate({ name: 'person', id: person.id })}>
                  {displayName(person)}
                </button>
                <span className="muted"> · {personGaps.join(', ')}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {duplicates.length > 0 ? (
        <section className="panel">
          <h2>Possible duplicates</h2>
          <p>Same name and compatible birth information. Nothing is merged automatically.</p>
          <ul className="plain-list">
            {duplicates.slice(0, 5).map((candidate) => {
              const [leftId, rightId] = candidate.personIds;
              const left = people.find((person) => person.id === leftId);
              const right = people.find((person) => person.id === rightId);
              if (!left || !right) return null;
              return (
                <li key={candidate.key}>
                  <button type="button" className="text-link" onClick={() => navigate({ name: 'person', id: left.id })}>
                    {displayName(left)}
                  </button>
                  <span> and </span>
                  <button type="button" className="text-link" onClick={() => navigate({ name: 'person', id: right.id })}>
                    {displayName(right)}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export function WelcomePage() {
  const { createFamily, loadDemonstration } = useArchive();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [localError, setLocalError] = useState('');

  return (
    <div className="welcome">
      <p className="eyebrow">The living family archive</p>
      <h1 id="page-title" tabIndex={-1}>
        KINSHIP
      </h1>
      <p className="lede">
        Keep people, relationships, and the uncertainty of the record on this device. KINSHIP does not upload the archive and does not require an account.
      </p>
      <form
        className="panel form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) {
            setLocalError('Give the archive a name.');
            return;
          }
          setLocalError('');
          void createFamily(name, description);
        }}
      >
        <h2>Create a family archive</h2>
        <label className="field">
          <span>Archive name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} name="archive-name" autoComplete="off" required />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
        </label>
        {localError ? <p role="alert">{localError}</p> : null}
        <button type="submit" className="btn primary">
          Create archive
        </button>
      </form>
      <div className="welcome-aside">
        <h2>Try it with fiction</h2>
        <p>The Calder demonstration is an invented family in an invented town. It can be removed without touching a real archive.</p>
        <button type="button" className="btn quiet" onClick={() => void loadDemonstration()}>
          Explore the fictional demonstration
        </button>
      </div>
    </div>
  );
}
