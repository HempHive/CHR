import { useMemo, useState } from 'react';
import { useArchive } from '@/app/archive-context';
import { searchArchive, paginate } from '@/domain/search';

export function SearchPage() {
  const app = useArchive();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const hits = useMemo(() => {
    const found = searchArchive(app.people, app.relationships, query);
    if (!app.preferences.concealLiving) return found;
    const living = new Set(app.people.filter((person) => person.livingStatus === 'living').map((person) => person.id));
    return found.filter((hit) => !living.has(hit.personId));
  }, [app.people, app.preferences.concealLiving, app.relationships, query]);
  const hiddenLiving = app.preferences.concealLiving ? app.people.filter((person) => person.livingStatus === 'living').length : 0;
  const windowed = paginate(hits, page, 20);

  return (
    <div className="page">
      <p className="eyebrow">Discovery</p>
      <h1 id="page-title" tabIndex={-1}>Search</h1>
      <div className="field">
        <label htmlFor="archive-search">Search the archive</label>
        <input
          id="archive-search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          placeholder="Names, places, occupations, notes"
          aria-describedby="search-hint"
        />
        <small id="search-hint">Spelling variants are folded. A match is a lead, not proof that two records are the same person.</small>
      </div>
      {app.preferences.concealLiving && hiddenLiving > 0 ? (
        <p className="fine-print">Living people are concealed, so they are left out of these results.</p>
      ) : null}
      {query.trim() && hits.length === 0 ? <p>No records matched.</p> : null}
      <ul className="card-list">
        {windowed.items.map((hit) => (
          <li key={`${hit.kind}-${hit.personId}-${hit.title}-${hit.excerpt}`}>
            <button type="button" className="person-card" onClick={() => app.navigate({ name: 'person', id: hit.personId })}>
              <span>
                <strong>{hit.title}</strong>
                <small>{hit.kind === 'relationship' ? 'Relationship' : 'Person'}</small>
                {hit.excerpt ? <small className="muted">{hit.excerpt}</small> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {windowed.pages > 1 ? (
        <div className="button-row">
          <button type="button" className="btn quiet" disabled={windowed.page === 1} onClick={() => setPage(windowed.page - 1)}>Previous</button>
          <span>Page {windowed.page} of {windowed.pages}</span>
          <button type="button" className="btn quiet" disabled={windowed.page === windowed.pages} onClick={() => setPage(windowed.page + 1)}>Next</button>
        </div>
      ) : null}
    </div>
  );
}
