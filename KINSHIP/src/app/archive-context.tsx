import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createDemonstrationSnapshot, DEMO_ARCHIVE_ID } from '@/demo/calder';
import { createArchive } from '@/domain/factory';
import type { Archive, BatchOp, Issue, Person, Relationship, Snapshot } from '@/domain/types';
import { personDateIssues, relationshipSaveIssues } from '@/genealogy/validate';
import { backupToSnapshot, createBackup, type KinshipBackup, type RedactionOptions } from '@/persistence/backup';
import {
  createUndoHistory,
  remapSnapshot,
  snapshotForReplace,
  undoForPerson,
  undoForRelationship,
  type ArchiveStore,
} from '@/persistence/store';
import { applyPreferences, readPreferences, rememberedArchive, rememberArchive, writePreferences, type Preferences } from '@/app/preferences';
import { hrefFor, parseHash, type Route } from '@/app/router';

interface ArchiveContextValue {
  ready: boolean;
  error: string | null;
  clearError: () => void;
  notice: string | null;
  clearNotice: () => void;
  archives: Archive[];
  archive: Archive | null;
  people: Person[];
  relationships: Relationship[];
  preferences: Preferences;
  setPreferences: (preferences: Preferences) => void;
  undoCount: number;
  undoLabel: string | null;
  undo: () => Promise<void>;
  route: Route;
  navigate: (route: Route, options?: { force?: boolean }) => void;
  pageDirty: boolean;
  setPageDirty: (dirty: boolean) => void;
  discardDialog: boolean;
  stayOnPage: () => void;
  discardAndContinue: () => void;
  createFamily: (name: string, description: string) => Promise<void>;
  selectArchive: (id: string) => Promise<void>;
  saveArchiveDetails: (name: string, description: string) => Promise<void>;
  deleteCurrentArchive: () => Promise<void>;
  savePerson: (person: Person) => Promise<Issue[]>;
  deletePerson: (id: string) => Promise<void>;
  saveRelationship: (relationship: Relationship, newPerson?: Person) => Promise<Issue[]>;
  deleteRelationship: (id: string) => Promise<void>;
  dismissDuplicate: (key: string) => Promise<void>;
  loadDemonstration: () => Promise<void>;
  removeDemonstration: () => Promise<void>;
  exportBackup: (options: RedactionOptions) => Promise<KinshipBackup>;
  restoreBackup: (backup: KinshipBackup, mode: 'add' | 'replace') => Promise<void>;
  readOpenSnapshot: () => Promise<Snapshot | null>;
}

const ArchiveContext = createContext<ArchiveContextValue | null>(null);

export function ArchiveProvider({ store, children }: { store: ArchiveStore; children: ReactNode }) {
  const history = useRef(createUndoHistory());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [archives, setArchives] = useState<Archive[]>([]);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [preferences, setPreferencesState] = useState<Preferences>(() => readPreferences());
  const [undoCount, setUndoCount] = useState(0);
  const [undoLabel, setUndoLabel] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const [pageDirty, setPageDirty] = useState(false);
  const [pendingRoute, setPendingRoute] = useState<Route | null>(null);
  const pendingArchive = useRef<string | null>(null);

  const archive = archives.find((item) => item.id === archiveId) ?? null;

  const refresh = useCallback(
    async (nextId?: string | null) => {
      const listed = await store.listArchives();
      const remembered = nextId === undefined ? rememberedArchive() : nextId;
      const id = remembered && listed.some((item) => item.id === remembered) ? remembered : listed[0]?.id ?? null;
      setArchives(listed);
      setArchiveId(id);
      rememberArchive(id);
      if (!id) {
        setPeople([]);
        setRelationships([]);
        return;
      }
      setPeople(await store.listPeople(id));
      setRelationships(await store.listRelationships(id));
    },
    [store],
  );

  useEffect(() => {
    applyPreferences(preferences);
    let cancelled = false;
    refresh()
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'The archive could not be opened.');
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [preferences, refresh]);

  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const onChange = () => applyPreferences(readPreferences());
    const theme = window.matchMedia('(prefers-color-scheme: dark)');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    theme.addEventListener('change', onChange);
    motion.addEventListener('change', onChange);
    return () => {
      theme.removeEventListener('change', onChange);
      motion.removeEventListener('change', onChange);
    };
  }, []);

  useEffect(() => {
    const title = document.getElementById('page-title');
    title?.focus();
  }, [route, archiveId]);

  const syncUndo = () => {
    setUndoCount(history.current.size);
    setUndoLabel(history.current.size > 0 ? 'Undo last change' : null);
  };

  const commit = async (label: string, ops: BatchOp[], undoOps: BatchOp[]) => {
    await store.applyBatch(ops);
    if (undoOps.length > 0) history.current.push({ label, batch: undoOps });
    syncUndo();
    await refresh(archiveId);
  };

  const navigate = (next: Route, options?: { force?: boolean }) => {
    if (pageDirty && !options?.force) {
      setPendingRoute(next);
      return;
    }
    const href = hrefFor(next);
    if (window.location.hash === href) setRoute(next);
    else window.location.hash = href;
  };

  const value = useMemo<ArchiveContextValue>(() => {
    return {
      ready,
      error,
      clearError: () => setError(null),
      notice,
      clearNotice: () => setNotice(null),
      archives,
      archive,
      people,
      relationships,
      preferences,
      setPreferences: (next) => {
        writePreferences(next);
        setPreferencesState(next);
      },
      undoCount,
      undoLabel,
      undo: async () => {
        const entry = history.current.pop();
        syncUndo();
        if (!entry) return;
        await store.applyBatch(entry.batch, { touch: false });
        setNotice(`Undid: ${entry.label}.`);
        await refresh(archiveId);
      },
      route,
      navigate,
      pageDirty,
      setPageDirty,
      discardDialog: pendingRoute !== null,
      stayOnPage: () => setPendingRoute(null),
      discardAndContinue: () => {
        const next = pendingRoute;
        const nextArchive = pendingArchive.current;
        pendingArchive.current = null;
        setPendingRoute(null);
        setPageDirty(false);
        if (nextArchive) {
          history.current.clear();
          syncUndo();
          void refresh(nextArchive);
        }
        if (!next) return;
        const href = hrefFor(next);
        if (window.location.hash === href) setRoute(next);
        else window.location.hash = href;
      },
      createFamily: async (name, description) => {
        const created = createArchive({ name, description, kind: 'family' });
        await store.applyBatch([{ op: 'put-archive', archive: created }]);
        history.current.clear();
        syncUndo();
        await refresh(created.id);
        setNotice(`Created “${created.name}”.`);
        window.location.hash = '#/';
      },
      selectArchive: async (id) => {
        if (pageDirty) {
          pendingArchive.current = id;
          setPendingRoute({ name: 'home' });
          return;
        }
        history.current.clear();
        syncUndo();
        await refresh(id);
        window.location.hash = '#/';
      },
      saveArchiveDetails: async (name, description) => {
        if (!archive) return;
        await store.applyBatch([{ op: 'put-archive', archive: { ...archive, name: name.trim(), description: description.trim() } }]);
        await refresh(archive.id);
        setNotice('Archive details saved.');
      },
      deleteCurrentArchive: async () => {
        if (!archive) return;
        await store.applyBatch([{ op: 'delete-archive', id: archive.id }]);
        history.current.clear();
        syncUndo();
        await refresh(null);
        setNotice(`Deleted “${archive.name}”.`);
        window.location.hash = '#/';
      },
      savePerson: async (person) => {
        const before = await store.getPerson(person.id);
        const issues = personDateIssues(person);
        await commit(before ? 'Edit person' : 'Add person', [{ op: 'put-person', person }], undoForPerson(before, person));
        setNotice(before ? 'Person saved.' : 'Person added.');
        return issues;
      },
      deletePerson: async (id) => {
        const existing = await store.getPerson(id);
        if (!existing) return;
        const related = (await store.listRelationships(existing.archiveId)).filter(
          (relationship) => relationship.fromPersonId === id || relationship.toPersonId === id,
        );
        await commit(
          'Delete person',
          [{ op: 'delete-person', id }],
          [{ op: 'put-person', person: existing }, ...related.map((relationship) => ({ op: 'put-relationship' as const, relationship }))],
        );
        setNotice('Person deleted. You can undo this.');
      },
      saveRelationship: async (relationship, newPerson) => {
        const currentPeople = archive ? await store.listPeople(archive.id) : [];
        const currentRelationships = archive ? await store.listRelationships(archive.id) : [];
        const withNew = newPerson ? currentPeople.concat(newPerson) : currentPeople;
        const issues = relationshipSaveIssues(relationship, withNew, currentRelationships);
        if (issues.some((issue) => issue.severity === 'error')) return issues;
        const before = await store.getRelationship(relationship.id);
        const ops: BatchOp[] = [];
        const undo: BatchOp[] = [];
        if (newPerson) {
          ops.push({ op: 'put-person', person: newPerson });
          undo.unshift({ op: 'delete-person', id: newPerson.id });
        }
        ops.push({ op: 'put-relationship', relationship });
        undo.unshift(...undoForRelationship(before, relationship));
        await commit(before ? 'Edit relationship' : 'Add relationship', ops, undo);
        setNotice('Relationship saved.');
        return issues;
      },
      deleteRelationship: async (id) => {
        const existing = await store.getRelationship(id);
        if (!existing) return;
        await commit('Delete relationship', [{ op: 'delete-relationship', id }], undoForRelationship(existing, null));
        setNotice('Relationship deleted. You can undo this.');
      },
      dismissDuplicate: async (key) => {
        if (!archive) return;
        if (archive.dismissedAlerts.includes(key)) return;
        await store.applyBatch([{ op: 'put-archive', archive: { ...archive, dismissedAlerts: [...archive.dismissedAlerts, key] } }]);
        await refresh(archive.id);
      },
      loadDemonstration: async () => {
        const existing = await store.getArchive(DEMO_ARCHIVE_ID);
        if (!existing) {
          const snapshot = createDemonstrationSnapshot();
          await store.applyBatch(
            [
              { op: 'put-archive', archive: snapshot.archive },
              ...snapshot.people.map((person) => ({ op: 'put-person' as const, person })),
              ...snapshot.relationships.map((relationship) => ({ op: 'put-relationship' as const, relationship })),
            ],
            { touch: false },
          );
        }
        history.current.clear();
        syncUndo();
        await refresh(DEMO_ARCHIVE_ID);
        setNotice('Opened the fictional Calder demonstration. It is a separate archive.');
        window.location.hash = '#/';
      },
      removeDemonstration: async () => {
        await store.applyBatch([{ op: 'delete-archive', id: DEMO_ARCHIVE_ID }]);
        history.current.clear();
        syncUndo();
        await refresh(archiveId === DEMO_ARCHIVE_ID ? null : archiveId);
        setNotice('Removed the demonstration archive.');
      },
      exportBackup: async (options) => {
        if (!archive) throw new Error('Open an archive before exporting.');
        const snapshot = await store.readSnapshot(archive.id);
        if (!snapshot) throw new Error('The open archive could not be read.');
        return createBackup(snapshot, options);
      },
      restoreBackup: async (backup, mode) => {
        if (mode === 'replace') {
          if (!archive) throw new Error('Open an archive before replacing it.');
          if (archive.kind !== backup.archive.kind) {
            throw new Error('A demonstration backup cannot replace a family archive, and a family backup cannot replace the demonstration. Add it as a separate archive.');
          }
          await store.replaceArchiveContents(snapshotForReplace(archive, backupToSnapshot(backup)));
          history.current.clear();
          syncUndo();
          await refresh(archive.id);
          setNotice('Backup restored into the open archive.');
          return;
        }
        const copy = remapSnapshot(backupToSnapshot(backup));
        await store.replaceArchiveContents(copy);
        history.current.clear();
        syncUndo();
        await refresh(copy.archive.id);
        setNotice('Backup added as a separate archive.');
      },
      readOpenSnapshot: async () => (archive ? store.readSnapshot(archive.id) : null),
    };
  }, [archive, archiveId, archives, error, notice, pageDirty, pendingRoute, people, preferences, ready, refresh, relationships, route, store, undoCount, undoLabel]);

  return <ArchiveContext.Provider value={value}>{children}</ArchiveContext.Provider>;
}

export function useArchive(): ArchiveContextValue {
  const value = useContext(ArchiveContext);
  if (!value) throw new Error('useArchive must be used inside ArchiveProvider');
  return value;
}
