import { useMemo, useState } from 'react';
import { useArchive } from '@/app/archive-context';
import { displayName, lifespanLabel } from '@/domain/names';
import { paginate } from '@/domain/search';
import { profileGaps } from '@/genealogy/validate';

const PAGE_SIZE = 24;

export function PeoplePage() {
  const { people, relationships, navigate, preferences } = useArchive();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const sorted = [...people].sort((left, right) => displayName(left).localeCompare(displayName(right)));
    if (!needle) return sorted;
    return sorted.filter((person) =>
      [displayName(person), person.birthName, person.birthPlace, person.deathPlace, ...person.names.map((name) => name.value)]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [people, query]);
  const windowed = paginate(filtered, page, PAGE_SIZE);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Directory</p>
          <h1 id="page-title" tabIndex={-1}>
            People
          </h1>
        </div>
        <button type="button" className="btn primary" onClick={() => navigate({ name: 'person-new' })}>
          Add a person
        </button>
      </div>
      <label className="field">
        <span>Filter by name or place</span>
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
        />
      </label>
      {people.length === 0 ? <p>No people yet. Add the first person to start the archive.</p> : null}
      <ul className="card-list">
        {windowed.items.map((person) => {
          const concealed = preferences.concealLiving && person.livingStatus === 'living';
          const gaps = profileGaps(person, relationships);
          return (
            <li key={person.id}>
              <button type="button" className="person-card" onClick={() => navigate({ name: 'person', id: person.id })}>
                <span className="avatar" aria-hidden="true">
                  {concealed ? '•' : displayName(person).slice(0, 1)}
                </span>
                <span>
                  <strong>{concealed ? 'Living person' : displayName(person)}</strong>
                  <small>{concealed ? 'Details concealed on this device' : lifespanLabel(person)}</small>
                  {gaps.length > 0 && !concealed ? <small className="muted">{gaps.join(' · ')}</small> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {windowed.pages > 1 ? (
        <div className="button-row">
          <button type="button" className="btn quiet" disabled={windowed.page === 1} onClick={() => setPage(windowed.page - 1)}>
            Previous
          </button>
          <span>
            Page {windowed.page} of {windowed.pages}
          </span>
          <button type="button" className="btn quiet" disabled={windowed.page === windowed.pages} onClick={() => setPage(windowed.page + 1)}>
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
