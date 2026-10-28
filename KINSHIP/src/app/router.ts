export type Route =
  | { name: 'home' }
  | { name: 'tree' }
  | { name: 'people' }
  | { name: 'person-new' }
  | { name: 'person'; id: string }
  | { name: 'person-edit'; id: string }
  | { name: 'search' }
  | { name: 'settings' };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/^\/+/, '').replace(/\/+$/, '');
  const parts = path.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
  if (parts.length === 0) return { name: 'home' };
  if (parts[0] === 'tree') return { name: 'tree' };
  if (parts[0] === 'search') return { name: 'search' };
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'people' && parts[1] === 'new') return { name: 'person-new' };
  if (parts[0] === 'people' && parts[1] && parts[2] === 'edit') return { name: 'person-edit', id: parts[1] };
  if (parts[0] === 'people' && parts[1]) return { name: 'person', id: parts[1] };
  if (parts[0] === 'people') return { name: 'people' };
  return { name: 'home' };
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'tree':
      return '#/tree';
    case 'people':
      return '#/people';
    case 'person-new':
      return '#/people/new';
    case 'person':
      return `#/people/${encodeURIComponent(route.id)}`;
    case 'person-edit':
      return `#/people/${encodeURIComponent(route.id)}/edit`;
    case 'search':
      return '#/search';
    case 'settings':
      return '#/settings';
  }
}

export function routeTitle(route: Route): string {
  switch (route.name) {
    case 'home':
      return 'Home';
    case 'tree':
      return 'Family tree';
    case 'people':
      return 'People';
    case 'person-new':
      return 'Add a person';
    case 'person':
      return 'Person';
    case 'person-edit':
      return 'Edit person';
    case 'search':
      return 'Search';
    case 'settings':
      return 'Settings';
  }
}
