import { useEffect, useState } from 'react';
import { useArchive } from '@/app/archive-context';
import type { ContrastChoice, MotionChoice, TextSize, ThemeChoice } from '@/app/preferences';
import { DEMO_ARCHIVE_ID } from '@/demo/calder';
import { archiveIssues, findPossibleDuplicates } from '@/genealogy/validate';
import { parseBackup, previewBackup, type KinshipBackup } from '@/persistence/backup';
import { APP_VERSION } from '@/version';
import { ConfirmDialog, downloadTextFile } from '@/ui/widgets';

export function SettingsPage() {
  const app = useArchive();
  const [name, setName] = useState(app.archive?.name ?? '');
  const [description, setDescription] = useState(app.archive?.description ?? '');
  const [backup, setBackup] = useState<KinshipBackup | null>(null);
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([]);
  const [fileError, setFileError] = useState('');
  const [replaceArmed, setReplaceArmed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [integrity, setIntegrity] = useState<string[] | null>(null);
  const demoLoaded = app.archives.some((archive) => archive.id === DEMO_ARCHIVE_ID);

  useEffect(() => {
    setName(app.archive?.name ?? '');
    setDescription(app.archive?.description ?? '');
  }, [app.archive?.description, app.archive?.id, app.archive?.name]);

  if (!app.archive) return null;
  const archive = app.archive;

  return (
    <div className="page">
      <p className="eyebrow">This device</p>
      <h1 id="page-title" tabIndex={-1}>Settings</h1>
      <p className="lede">KINSHIP {APP_VERSION} keeps this archive in the browser. There is no account and no upload.</p>

      <section className="panel form-grid">
        <h2>Archive</h2>
        <label className="field">
          <span>Open archive</span>
          <select value={archive.id} onChange={(event) => void app.selectArchive(event.target.value)}>
            {app.archives.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}{item.kind === 'demonstration' ? ' (demonstration)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea value={description} rows={3} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <button type="button" className="btn primary" onClick={() => void app.saveArchiveDetails(name, description)}>
          Save archive details
        </button>
      </section>

      <section className="panel">
        <h2>Reading comfort</h2>
        <div className="form-columns">
          <label className="field">
            <span>Theme</span>
            <select value={app.preferences.theme} onChange={(event) => app.setPreferences({ ...app.preferences, theme: event.target.value as ThemeChoice })}>
              <option value="system">Match the system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label className="field">
            <span>Text size</span>
            <select value={app.preferences.text} onChange={(event) => app.setPreferences({ ...app.preferences, text: event.target.value as TextSize })}>
              <option value="sm">Small</option>
              <option value="md">Medium</option>
              <option value="lg">Large</option>
              <option value="xl">Extra large</option>
            </select>
          </label>
          <label className="field">
            <span>Contrast</span>
            <select value={app.preferences.contrast} onChange={(event) => app.setPreferences({ ...app.preferences, contrast: event.target.value as ContrastChoice })}>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </label>
          <label className="field">
            <span>Motion</span>
            <select value={app.preferences.motion} onChange={(event) => app.setPreferences({ ...app.preferences, motion: event.target.value as MotionChoice })}>
              <option value="system">Match the system</option>
              <option value="reduce">Reduce</option>
              <option value="full">Allow</option>
            </select>
          </label>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={app.preferences.concealLiving}
            onChange={(event) => app.setPreferences({ ...app.preferences, concealLiving: event.target.checked })}
          />
          Conceal living people in the tree, lists, and search
        </label>
      </section>

      <section className="panel">
        <h2>Backup</h2>
        <p>A full backup is the copy you can restore. A redacted export leaves out restricted records and, if you choose, living people. It is not a complete archive.</p>
        <div className="button-row">
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              void app.exportBackup({ excludeRestricted: false, excludeLiving: false }).then((file) => {
                downloadTextFile(filename(archive.name, 'full'), JSON.stringify(file, null, 2));
              });
            }}
          >
            Download full backup
          </button>
          <button
            type="button"
            className="btn quiet"
            onClick={() => {
              void app.exportBackup({ excludeRestricted: true, excludeLiving: true }).then((file) => {
                downloadTextFile(filename(archive.name, 'redacted'), JSON.stringify(file, null, 2));
              });
            }}
          >
            Download redacted export
          </button>
        </div>
        <label className="field">
          <span>Restore a KINSHIP backup</span>
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              setBackup(null);
              setFileError('');
              setReplaceArmed(false);
              if (!file) return;
              void file.text().then(async (text) => {
                const parsed = await parseBackup(text);
                if (!parsed.ok) {
                  setFileError(parsed.errors.join(' '));
                  return;
                }
                setBackup(parsed.backup);
                setPreviewWarnings(previewBackup(parsed.backup).warnings);
              });
            }}
          />
        </label>
        {fileError ? <p role="alert">{fileError}</p> : null}
        {backup ? (
          <div>
            <p>
              {backup.archive.name} · {backup.people.length} people · {backup.relationships.length} relationships · {backup.completeness === 'redacted' ? 'redacted export' : 'full backup'}
            </p>
            {previewWarnings.map((warning) => <p key={warning}>{warning}</p>)}
            {backup.completeness === 'redacted' ? (
              <p>Restoring this file will not bring back records that were left out of the export.</p>
            ) : null}
            <label className="check">
              <input type="checkbox" checked={replaceArmed} onChange={(event) => setReplaceArmed(event.target.checked)} />
              I understand that replacing the open archive removes its current people and relationships.
            </label>
            <div className="button-row">
              <button type="button" className="btn quiet" onClick={() => void app.restoreBackup(backup, 'add').then(() => setBackup(null)).catch((reason: unknown) => setFileError(reason instanceof Error ? reason.message : 'Restore failed.'))}>
                Add as a separate archive
              </button>
              <button
                type="button"
                className="btn danger"
                disabled={!replaceArmed || archive.kind !== backup.archive.kind}
                onClick={() => void app.restoreBackup(backup, 'replace').then(() => setBackup(null)).catch((reason: unknown) => setFileError(reason instanceof Error ? reason.message : 'Restore failed.'))}
              >
                Replace this archive
              </button>
            </div>
            {archive.kind !== backup.archive.kind ? <p>This file cannot replace the open archive because one is a demonstration and the other is not.</p> : null}
          </div>
        ) : null}
      </section>

      <section className="panel">
        <h2>Integrity</h2>
        <button
          type="button"
          className="btn quiet"
          onClick={() => {
            const issues = archiveIssues(app.people, app.relationships);
            const duplicates = findPossibleDuplicates(app.people, archive.dismissedAlerts);
            const lines = [
              ...issues.map((issue) => `${issue.severity === 'error' ? 'Error' : 'Warning'}: ${issue.message}`),
              ...duplicates.map((item) => `Possible duplicate: ${item.reason}`),
            ];
            setIntegrity(lines.length > 0 ? lines : ['No integrity errors or duplicate-name warnings.']);
          }}
        >
          Check this archive
        </button>
        {integrity ? (
          <ul className="plain-list">
            {integrity.map((line) => <li key={line}>{line}</li>)}
          </ul>
        ) : null}
        <DuplicateReview />
      </section>

      <section className="panel">
        <h2>Demonstration</h2>
        <p>The Calder family is fictional. Loading it creates or opens a separate archive. It does not copy those people into the archive you have open.</p>
        <div className="button-row">
          <button type="button" className="btn quiet" onClick={() => void app.loadDemonstration()}>
            {demoLoaded ? 'Open the demonstration' : 'Add the demonstration'}
          </button>
          {demoLoaded ? (
            <button type="button" className="btn danger" onClick={() => void app.removeDemonstration()}>
              Remove the demonstration
            </button>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <h2>Delete this archive</h2>
        <p>This removes “{archive.name}” from this browser. Export a backup first if you may want it back. This cannot be undone from the header.</p>
        <button type="button" className="btn danger" onClick={() => setConfirmDelete(true)}>
          Delete archive
        </button>
      </section>

      <section className="panel">
        <h2>This version</h2>
        <p>Phase 1 is the working archive: people, relationships, one family tree, search, and backup. Photographs, maps, timelines, GEDCOM, audio, documents, and the museum are designed and not built yet. There is no button for them.</p>
      </section>

      {confirmDelete ? (
        <ConfirmDialog
          title="Delete this archive?"
          body={
            <label className="field">
              <span>Type the archive name to confirm</span>
              <input value={deleteText} onChange={(event) => setDeleteText(event.target.value)} />
            </label>
          }
          confirmLabel="Delete archive"
          danger
          onCancel={() => {
            setConfirmDelete(false);
            setDeleteText('');
          }}
          onConfirm={() => {
            if (deleteText.trim() !== archive.name) return;
            setConfirmDelete(false);
            void app.deleteCurrentArchive();
          }}
        />
      ) : null}
    </div>
  );
}

function DuplicateReview() {
  const app = useArchive();
  if (!app.archive) return null;
  const duplicates = findPossibleDuplicates(app.people, app.archive.dismissedAlerts);
  if (duplicates.length === 0) return <p>No possible duplicates are waiting for review.</p>;
  return (
    <ul className="plain-list">
      {duplicates.map((candidate) => {
        const [leftId, rightId] = candidate.personIds;
        const left = app.people.find((person) => person.id === leftId);
        const right = app.people.find((person) => person.id === rightId);
        if (!left || !right) return null;
        return (
          <li key={candidate.key}>
            <button type="button" className="text-link" onClick={() => app.navigate({ name: 'person', id: left.id })}>{left.preferredName || left.givenNames || left.familyNames}</button>
            <span> and </span>
            <button type="button" className="text-link" onClick={() => app.navigate({ name: 'person', id: right.id })}>{right.preferredName || right.givenNames || right.familyNames}</button>
            <span> · {candidate.reason}</span>
            <button type="button" className="btn quiet tiny" onClick={() => void app.dismissDuplicate(candidate.key)}>
              Keep both
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function filename(name: string, kind: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'archive';
  return `kinship-${slug}-${kind}-backup.json`;
}
