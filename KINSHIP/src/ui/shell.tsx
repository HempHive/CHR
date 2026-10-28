import { useEffect } from 'react';
import { useArchive } from '@/app/archive-context';
import { hrefFor, routeTitle, type Route } from '@/app/router';
import { HomePage, WelcomePage } from '@/ui/home-page';
import { PeoplePage } from '@/ui/people-page';
import { PersonForm } from '@/ui/person-form';
import { PersonPage } from '@/ui/person-page';
import { SearchPage } from '@/ui/search-page';
import { SettingsPage } from '@/ui/settings-page';
import { TreePage } from '@/ui/tree-page';
import { ConfirmDialog } from '@/ui/widgets';
import { createPerson } from '@/domain/factory';
import { APP_VERSION } from '@/version';

const NAV: Array<{ route: Route; label: string }> = [
  { route: { name: 'home' }, label: 'Home' },
  { route: { name: 'tree' }, label: 'Family tree' },
  { route: { name: 'people' }, label: 'People' },
  { route: { name: 'search' }, label: 'Search' },
  { route: { name: 'settings' }, label: 'Settings' },
];

export function Shell() {
  const app = useArchive();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select')) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        void app.undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [app]);

  if (!app.ready) {
    return <p className="boot">Opening KINSHIP…</p>;
  }

  return (
    <div className="app">
      <a className="skip" href="#content">Skip to content</a>
      <header className="topbar">
        <div className="brand">
          <button type="button" className="brand-button" onClick={() => app.navigate({ name: 'home' })}>
            <span className="wordmark">KINSHIP</span>
            <span className="tagline">The Living Family Archive</span>
          </button>
        </div>
        {app.archive ? (
          <nav className="primary-nav" aria-label="Primary">
            {NAV.map((item) => {
              const current = sameRoute(app.route, item.route);
              return (
                <a key={item.label} href={hrefFor(item.route)} aria-current={current ? 'page' : undefined} onClick={(event) => { event.preventDefault(); app.navigate(item.route); }}>
                  {item.label}
                </a>
              );
            })}
          </nav>
        ) : null}
        <div className="header-tools">
          {app.archive && app.archives.length > 1 ? (
            <label>
              <span className="sr-only">Archive</span>
              <select value={app.archive.id} onChange={(event) => void app.selectArchive(event.target.value)} aria-label="Archive">
                {app.archives.map((archive) => (
                  <option key={archive.id} value={archive.id}>{archive.name}</option>
                ))}
              </select>
            </label>
          ) : null}
          {app.undoCount > 0 ? (
            <button type="button" className="btn quiet tiny" onClick={() => void app.undo()}>
              Undo
            </button>
          ) : null}
        </div>
      </header>
      <main id="content">
        {app.error ? (
          <p className="banner" role="alert">
            {app.error} <button type="button" className="btn quiet tiny" onClick={app.clearError}>Dismiss</button>
          </p>
        ) : null}
        {app.notice ? (
          <p className="banner" role="status">
            {app.notice} <button type="button" className="btn quiet tiny" onClick={app.clearNotice}>Dismiss</button>
          </p>
        ) : null}
        {app.archive ? <Routed /> : <WelcomePage />}
      </main>
      <footer>
        <span>KINSHIP {APP_VERSION}</span>
        <span>Phase 1 · stored in this browser · {routeTitle(app.route)}</span>
      </footer>
      {app.discardDialog ? (
        <ConfirmDialog
          title="Discard unsaved changes?"
          body="The person form still has edits that have not been saved."
          confirmLabel="Discard changes"
          danger
          onCancel={app.stayOnPage}
          onConfirm={app.discardAndContinue}
        />
      ) : null}
    </div>
  );
}

function Routed() {
  const app = useArchive();
  if (!app.archive) return null;
  const route = app.route;
  switch (route.name) {
    case 'home':
      return <HomePage />;
    case 'tree':
      return <TreePage />;
    case 'people':
      return <PeoplePage />;
    case 'person-new':
      return <PersonForm key="new" initial={createPerson(app.archive.id)} isNew />;
    case 'person':
      return <PersonPage id={route.id} />;
    case 'person-edit': {
      const person = app.people.find((item) => item.id === route.id);
      if (!person) {
        return (
          <div className="page">
            <h1 id="page-title" tabIndex={-1}>Person not found</h1>
          </div>
        );
      }
      return <PersonForm key={person.id} initial={person} />;
    }
    case 'search':
      return <SearchPage />;
    case 'settings':
      return <SettingsPage />;
  }
}

function sameRoute(current: Route, item: Route): boolean {
  if (item.name === 'people') return current.name === 'people' || current.name === 'person' || current.name === 'person-edit' || current.name === 'person-new';
  if (item.name === 'home') return current.name === 'home';
  return current.name === item.name;
}
