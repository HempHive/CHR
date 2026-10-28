import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useArchive } from '@/app/archive-context';
import { initials, lifespanLabel, presentationName } from '@/domain/names';
import type { Person } from '@/domain/types';
import { descendantIds, peopleInScope, suggestFocusId } from '@/genealogy/graph';
import { layoutFamilyTree, type LayoutResult } from '@/genealogy/layout';

export function TreePage() {
  const app = useArchive();
  const [mode, setMode] = useState<'all' | 'focus'>('all');
  const [focusId, setFocusId] = useState('');
  const [up, setUp] = useState(3);
  const [down, setDown] = useState(3);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showOutline, setShowOutline] = useState(false);
  const [camera, setCamera] = useState({ x: 32, y: 32, scale: 1 });
  const viewport = useRef<HTMLDivElement>(null);
  const fitted = useRef<string>('');

  useEffect(() => {
    setCollapsed(new Set());
    setMode(app.people.length > 50 ? 'focus' : 'all');
    setFocusId(suggestFocusId(app.people, app.relationships) ?? '');
    fitted.current = '';
  }, [app.archive?.id]);

  const includeIds = useMemo(() => {
    if (mode === 'all' || !focusId) return undefined;
    return peopleInScope(app.people, app.relationships, { mode: 'focus', focusId, up, down });
  }, [app.people, app.relationships, down, focusId, mode, up]);

  const layout = useMemo(
    () => layoutFamilyTree(app.people, app.relationships, { collapsedIds: collapsed, includeIds }),
    [app.people, app.relationships, collapsed, includeIds],
  );

  useEffect(() => {
    const key = `${app.archive?.id}:${mode}:${focusId}:${layout.width}:${layout.height}`;
    if (fitted.current === key) return;
    fitted.current = key;
    fit(viewport.current, layout, setCamera);
  }, [app.archive?.id, focusId, layout, mode]);

  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      setCamera((current) => {
        const nextScale = clamp(current.scale * (event.deltaY < 0 ? 1.08 : 0.92), 0.15, 2.5);
        const worldX = (px - current.x) / current.scale;
        const worldY = (py - current.y) / current.scale;
        return { scale: nextScale, x: px - worldX * nextScale, y: py - worldY * nextScale };
      });
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  const selected = app.people.find((person) => person.id === selectedId) ?? null;
  const visibleCount = layout.nodes.length;

  const onKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === '+' || event.key === '=') {
      setCamera((current) => ({ ...current, scale: clamp(current.scale * 1.1, 0.15, 2.5) }));
    } else if (event.key === '-' || event.key === '_') {
      setCamera((current) => ({ ...current, scale: clamp(current.scale / 1.1, 0.15, 2.5) }));
    } else if (event.key === '0') {
      fit(viewport.current, layout, setCamera);
    } else if (event.key === 'ArrowLeft') setCamera((current) => ({ ...current, x: current.x + 40 }));
    else if (event.key === 'ArrowRight') setCamera((current) => ({ ...current, x: current.x - 40 }));
    else if (event.key === 'ArrowUp') setCamera((current) => ({ ...current, y: current.y + 40 }));
    else if (event.key === 'ArrowDown') setCamera((current) => ({ ...current, y: current.y - 40 }));
    else return;
    event.preventDefault();
  };

  return (
    <div className="page tree-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Traditional tree</p>
          <h1 id="page-title" tabIndex={-1}>Family tree</h1>
        </div>
      </div>
      <div className="toolbar">
        <label>
          Show
          <select value={mode} onChange={(event) => setMode(event.target.value as 'all' | 'focus')}>
            <option value="all">Entire archive</option>
            <option value="focus">Around one person</option>
          </select>
        </label>
        <label>
          Focus
          <select value={focusId} onChange={(event) => setFocusId(event.target.value)}>
            {app.people.map((person) => (
              <option key={person.id} value={person.id}>{presentationName(person, app.preferences.concealLiving)}</option>
            ))}
          </select>
        </label>
        {mode === 'focus' ? (
          <>
            <label>
              Generations above
              <input type="number" min={0} max={12} value={up} onChange={(event) => setUp(Number(event.target.value))} />
            </label>
            <label>
              Generations below
              <input type="number" min={0} max={12} value={down} onChange={(event) => setDown(Number(event.target.value))} />
            </label>
          </>
        ) : null}
        <button type="button" className="btn quiet" onClick={() => fit(viewport.current, layout, setCamera)}>Fit</button>
        <button type="button" className="btn quiet" onClick={() => setCamera((current) => ({ ...current, scale: clamp(current.scale * 1.1, 0.15, 2.5) }))}>Zoom in</button>
        <button type="button" className="btn quiet" onClick={() => setCamera((current) => ({ ...current, scale: clamp(current.scale / 1.1, 0.15, 2.5) }))}>Zoom out</button>
        <button type="button" className="btn quiet" onClick={() => setShowOutline((value) => !value)} aria-pressed={showOutline}>
          {showOutline ? 'Hide outline' : 'Outline'}
        </button>
        <button type="button" className="btn quiet" onClick={() => downloadTree(layout, app.people, app.preferences.concealLiving, app.archive?.name ?? 'kinship')}>
          Export SVG
        </button>
      </div>
      <p className="fine-print">
        Showing {visibleCount} of {app.people.length} people.
        {layout.cyclic ? ' Parent links contain a cycle, so generation lines are contradictory and have been kept.' : ''}
        {' '}Use the outline if you are not using a pointer. Plus, minus, and arrow keys work when the canvas is focused.
      </p>
      {app.people.length === 0 ? <p>Add people and relationships before the tree has anything to draw.</p> : null}
      <div className={showOutline ? 'tree-layout with-outline' : 'tree-layout'}>
        <div
          className="tree-viewport"
          ref={viewport}
          tabIndex={0}
          role="application"
          aria-label="Family tree canvas"
          onKeyDown={onKey}
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest('button')) return;
            const startX = event.clientX;
            const startY = event.clientY;
            const origin = { ...camera };
            const move = (ev: PointerEvent) => {
              setCamera({ ...origin, x: origin.x + ev.clientX - startX, y: origin.y + ev.clientY - startY });
            };
            const upEvent = () => {
              window.removeEventListener('pointermove', move);
              window.removeEventListener('pointerup', upEvent);
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', upEvent);
          }}
        >
          <div className="tree-world" style={{ width: layout.width, height: layout.height, transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` }}>
            <svg className="tree-svg" width={layout.width} height={layout.height} aria-hidden="true">
              {layout.edges.map((edge) => (
                <path key={edge.id} d={edge.path} className={edge.kind === 'partnership' ? 'edge partner' : edge.dashed ? 'edge dashed' : 'edge'} />
              ))}
            </svg>
            {layout.nodes.map((node) => {
              const person = app.people.find((item) => item.id === node.personId);
              if (!person) return null;
              const concealed = app.preferences.concealLiving && person.livingStatus === 'living';
              const name = presentationName(person, app.preferences.concealLiving);
              const hiddenCount = descendantIds(person.id, app.relationships, includeIds).size;
              const isCollapsed = collapsed.has(person.id);
              return (
                <div key={person.id} className={selectedId === person.id ? 'tree-node selected' : 'tree-node'} style={{ left: node.x, top: node.y, width: node.w, height: node.h }}>
                  <button type="button" className="tree-open" onClick={() => setSelectedId(person.id)} aria-pressed={selectedId === person.id}>
                    <span className="avatar" aria-hidden="true">{concealed ? '•' : initials(name)}</span>
                    <span>
                      <strong>{name}</strong>
                      <small>{concealed ? 'Living' : lifespanLabel(person)}</small>
                    </span>
                  </button>
                  {hiddenCount > 0 ? (
                    <button
                      type="button"
                      className="collapse"
                      aria-expanded={!isCollapsed}
                      aria-label={isCollapsed ? `Show descendants of ${name}` : `Hide descendants of ${name}`}
                      onClick={() => {
                        setCollapsed((current) => {
                          const next = new Set(current);
                          if (next.has(person.id)) next.delete(person.id);
                          else next.add(person.id);
                          return next;
                        });
                      }}
                    >
                      {isCollapsed ? `${hiddenCount}` : '–'}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
        {showOutline ? (
          <Outline
            people={app.people.filter((person) => layout.nodes.some((node) => node.personId === person.id))}
            relationships={app.relationships}
            conceal={app.preferences.concealLiving}
            onOpen={(id) => app.navigate({ name: 'person', id })}
          />
        ) : null}
      </div>
      {selected ? (
        <aside className="panel tree-detail">
          <h2>{presentationName(selected, app.preferences.concealLiving)}</h2>
          <p>{app.preferences.concealLiving && selected.livingStatus === 'living' ? 'Details concealed.' : lifespanLabel(selected)}</p>
          <button type="button" className="btn primary" onClick={() => app.navigate({ name: 'person', id: selected.id })}>
            Open profile
          </button>
        </aside>
      ) : null}
    </div>
  );
}

function Outline({
  people,
  relationships,
  conceal,
  onOpen,
}: {
  people: Person[];
  relationships: ReturnType<typeof useArchive>['relationships'];
  conceal: boolean;
  onOpen: (id: string) => void;
}) {
  const ids = new Set(people.map((person) => person.id));
  const roots = people.filter(
    (person) => !relationships.some((relationship) => relationship.kind === 'parent_child' && relationship.toPersonId === person.id && ids.has(relationship.fromPersonId)),
  );
  return (
    <nav className="outline" aria-label="Family tree outline">
      <ul>
        {roots.map((person) => (
          <OutlineNode key={person.id} person={person} people={people} relationships={relationships} conceal={conceal} onOpen={onOpen} trail={new Set()} />
        ))}
      </ul>
    </nav>
  );
}

function OutlineNode({
  person,
  people,
  relationships,
  conceal,
  onOpen,
  trail,
}: {
  person: Person;
  people: Person[];
  relationships: ReturnType<typeof useArchive>['relationships'];
  conceal: boolean;
  onOpen: (id: string) => void;
  trail: Set<string>;
}) {
  if (trail.has(person.id)) {
    return <li>{presentationName(person, conceal)} · cycle kept</li>;
  }
  const nextTrail = new Set(trail);
  nextTrail.add(person.id);
  const children = relationships
    .filter((relationship) => relationship.kind === 'parent_child' && relationship.fromPersonId === person.id)
    .map((relationship) => people.find((item) => item.id === relationship.toPersonId))
    .filter((item): item is Person => Boolean(item));
  const name = presentationName(person, conceal);
  if (children.length === 0) {
    return (
      <li>
        <button type="button" className="text-link" onClick={() => onOpen(person.id)}>{name}</button>
      </li>
    );
  }
  return (
    <li>
      <details open>
        <summary>{name}</summary>
        <button type="button" className="text-link" onClick={() => onOpen(person.id)}>Open profile</button>
        <ul>
          {children.map((child) => (
            <OutlineNode key={child.id} person={child} people={people} relationships={relationships} conceal={conceal} onOpen={onOpen} trail={nextTrail} />
          ))}
        </ul>
      </details>
    </li>
  );
}

function fit(viewport: HTMLDivElement | null, layout: LayoutResult, setCamera: (camera: { x: number; y: number; scale: number }) => void) {
  if (!viewport) return;
  const rect = viewport.getBoundingClientRect();
  const scale = Math.min(1, (rect.width - 32) / layout.width, (rect.height - 32) / layout.height);
  const safe = Number.isFinite(scale) && scale > 0 ? scale : 1;
  setCamera({
    scale: safe,
    x: Math.max(16, (rect.width - layout.width * safe) / 2),
    y: 20,
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function downloadTree(layout: LayoutResult, people: Person[], conceal: boolean, archiveName: string) {
  const byId = new Map(people.map((person) => [person.id, person]));
  const nodes = layout.nodes.map((node) => {
    const person = byId.get(node.personId);
    const name = person ? presentationName(person, conceal) : 'Unknown';
    const dates = person && !(conceal && person.livingStatus === 'living') ? lifespanLabel(person) : '';
    return `<g><rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="12" fill="#fbf7f1" stroke="#8a5430"/><text x="${node.x + 16}" y="${node.y + 36}" font-family="Georgia, serif" font-size="16">${escapeXml(name)}</text><text x="${node.x + 16}" y="${node.y + 58}" font-family="Georgia, serif" font-size="12" fill="#6d5e4e">${escapeXml(dates)}</text></g>`;
  });
  const edges = layout.edges.map((edge) => `<path d="${edge.path}" fill="none" stroke="${edge.kind === 'partnership' ? '#a67c4e' : '#8a5430'}" stroke-width="1.5" ${edge.dashed ? 'stroke-dasharray="5 4"' : ''}/>`);
  const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">${edges.join('')}${nodes.join('')}</svg>`;
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${archiveName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-tree.svg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
