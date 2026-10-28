export type ThemeChoice = 'light' | 'dark' | 'system';
export type MotionChoice = 'system' | 'reduce' | 'full';
export type TextSize = 'sm' | 'md' | 'lg' | 'xl';
export type ContrastChoice = 'normal' | 'high';

export interface Preferences {
  theme: ThemeChoice;
  motion: MotionChoice;
  text: TextSize;
  contrast: ContrastChoice;
  concealLiving: boolean;
}

const KEYS = {
  theme: 'kinship-theme',
  motion: 'kinship-motion',
  text: 'kinship-text',
  contrast: 'kinship-contrast',
  conceal: 'kinship-conceal-living',
  archive: 'kinship-open-archive',
  privacyNote: 'kinship-privacy-note',
} as const;

export function readPreferences(): Preferences {
  return {
    theme: readChoice(KEYS.theme, ['light', 'dark', 'system'], 'system'),
    motion: readChoice(KEYS.motion, ['system', 'reduce', 'full'], 'system'),
    text: readChoice(KEYS.text, ['sm', 'md', 'lg', 'xl'], 'md'),
    contrast: readChoice(KEYS.contrast, ['normal', 'high'], 'normal'),
    concealLiving: storage().getItem(KEYS.conceal) === '1',
  };
}

export function writePreferences(preferences: Preferences) {
  const local = storage();
  local.setItem(KEYS.theme, preferences.theme);
  local.setItem(KEYS.motion, preferences.motion);
  local.setItem(KEYS.text, preferences.text);
  local.setItem(KEYS.contrast, preferences.contrast);
  local.setItem(KEYS.conceal, preferences.concealLiving ? '1' : '0');
  applyPreferences(preferences);
}

export function applyPreferences(preferences: Preferences) {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(preferences.theme);
  root.dataset.text = preferences.text;
  root.dataset.contrast = preferences.contrast;
  root.dataset.motion = resolveMotion(preferences.motion);
}

export function resolveTheme(theme: ThemeChoice): 'light' | 'dark' {
  if (theme === 'light' || theme === 'dark') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveMotion(motion: MotionChoice): 'reduce' | 'full' {
  if (motion === 'reduce') return 'reduce';
  if (motion === 'full') return 'full';
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduce' : 'full';
}

export function rememberArchive(id: string | null) {
  if (id) storage().setItem(KEYS.archive, id);
  else storage().removeItem(KEYS.archive);
}

export function rememberedArchive(): string | null {
  return storage().getItem(KEYS.archive);
}

export function rememberPerson(existing: readonly string[], personId: string, limit = 8): string[] {
  return [personId, ...existing.filter((id) => id !== personId)].slice(0, limit);
}

export function readRecent(archiveId: string): string[] {
  try {
    const parsed = JSON.parse(storage().getItem(`kinship-recent:${archiveId}`) ?? '[]') as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function writeRecent(archiveId: string, personId: string) {
  const next = rememberPerson(readRecent(archiveId), personId);
  storage().setItem(`kinship-recent:${archiveId}`, JSON.stringify(next));
  return next;
}

export function privacyNoteDismissed(): boolean {
  return session().getItem(KEYS.privacyNote) === '1';
}

export function dismissPrivacyNote() {
  session().setItem(KEYS.privacyNote, '1');
}

function storage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  try {
    if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.getItem === 'function') return localStorage;
  } catch {
    /* Some browsers expose a storage object that throws when it is blocked. */
  }
  return memoryStorage;
}

function session(): Pick<Storage, 'getItem' | 'setItem'> {
  try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage && typeof sessionStorage.getItem === 'function') return sessionStorage;
  } catch {
    /* Same fallback as local storage. The privacy note is not archive data. */
  }
  return memorySession;
}

const memoryValues = new Map<string, string>();
const memoryStorage = {
  getItem: (key: string) => memoryValues.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memoryValues.set(key, value);
  },
  removeItem: (key: string) => {
    memoryValues.delete(key);
  },
};
const memorySessionValues = new Map<string, string>();
const memorySession = {
  getItem: (key: string) => memorySessionValues.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memorySessionValues.set(key, value);
  },
};

function readChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const value = storage().getItem(key);
  return allowed.includes(value as T) ? (value as T) : fallback;
}
