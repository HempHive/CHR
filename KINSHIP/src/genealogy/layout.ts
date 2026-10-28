import { displayName } from '@/domain/names';
import type { Person, Relationship } from '@/domain/types';
import { assignGenerations, hiddenDescendants } from '@/genealogy/graph';

export const NODE_W = 196;
export const NODE_H = 84;
export const GAP_X = 36;
export const GAP_Y = 108;
const PADDING = 36;

export interface LayoutNode {
  personId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  generation: number;
}

export interface LayoutEdge {
  id: string;
  relationshipId: string;
  kind: 'parent-child' | 'partnership';
  fromPersonId: string;
  toPersonId: string;
  path: string;
  dashed: boolean;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
  cyclic: boolean;
}

export function layoutFamilyTree(
  people: Person[],
  relationships: Relationship[],
  options: { collapsedIds?: ReadonlySet<string>; includeIds?: ReadonlySet<string> } = {},
): LayoutResult {
  const included = options.includeIds;
  const scopedPeople = people.filter((person) => !included || included.has(person.id));
  const hidden = hiddenDescendants(options.collapsedIds ?? new Set<string>(), relationships, included);
  const visiblePeople = scopedPeople.filter((person) => !hidden.has(person.id));
  const visibleIds = new Set(visiblePeople.map((person) => person.id));
  const { generations, cyclic } = assignGenerations(visiblePeople, relationships);
  if (visiblePeople.length === 0) {
    return { nodes: [], edges: [], width: 480, height: 240, cyclic };
  }

  const maxGeneration = Math.max(...visiblePeople.map((person) => generations.get(person.id) ?? 0));
  const layers: string[][] = Array.from({ length: maxGeneration + 1 }, () => []);
  const byName = (leftId: string, rightId: string) => {
    const left = visiblePeople.find((person) => person.id === leftId);
    const right = visiblePeople.find((person) => person.id === rightId);
    return displayName(left ?? visiblePeople[0]).localeCompare(displayName(right ?? visiblePeople[0]));
  };

  const remaining = new Set(visiblePeople.map((person) => person.id));
  for (let generation = 0; generation <= maxGeneration; generation += 1) {
    const layerIds = visiblePeople
      .filter((person) => (generations.get(person.id) ?? 0) === generation)
      .map((person) => person.id);
    if (generation === 0) {
      layers[generation] = layerIds.sort(byName);
    } else {
      const ordered: string[] = [];
      const seen = new Set<string>();
      for (const parentId of layers[generation - 1]) {
        const children = relationships
          .filter((relationship) => relationship.kind === 'parent_child' && relationship.fromPersonId === parentId && layerIds.includes(relationship.toPersonId))
          .map((relationship) => relationship.toPersonId)
          .sort(byName);
        for (const childId of children) {
          if (seen.has(childId)) continue;
          seen.add(childId);
          ordered.push(childId);
        }
      }
      for (const personId of layerIds.sort(byName)) {
        if (!seen.has(personId)) ordered.push(personId);
      }
      layers[generation] = placePartnersBeside(ordered, relationships, layerIds);
    }
    for (const personId of layers[generation]) remaining.delete(personId);
  }
  if (remaining.size > 0) {
    layers[0].push(...[...remaining].sort(byName));
  }

  const desired = new Map<string, number>();
  layers.forEach((layer, generation) => {
    layer.forEach((personId, index) => {
      desired.set(personId, index * (NODE_W + GAP_X));
    });
    void generation;
  });

  for (let pass = 0; pass < 4; pass += 1) {
    for (let generation = 1; generation < layers.length; generation += 1) {
      const parentLayer = layers[generation - 1];
      layers[generation].sort((leftId, rightId) => averageParentX(leftId, parentLayer, relationships, desired) - averageParentX(rightId, parentLayer, relationships, desired) || byName(leftId, rightId));
      pack(layers[generation], desired);
    }
    for (let generation = layers.length - 2; generation >= 0; generation -= 1) {
      for (const personId of layers[generation]) {
        const childPositions = relationships
          .filter((relationship) => relationship.kind === 'parent_child' && relationship.fromPersonId === personId && visibleIds.has(relationship.toPersonId))
          .map((relationship) => desired.get(relationship.toPersonId))
          .filter((value): value is number => value !== undefined);
        if (childPositions.length > 0) {
          const average = childPositions.reduce((sum, value) => sum + value, 0) / childPositions.length;
          desired.set(personId, average);
        }
      }
      pack(layers[generation], desired);
    }
  }

  const nodes: LayoutNode[] = [];
  layers.forEach((layer, generation) => {
    for (const personId of layer) {
      nodes.push({
        personId,
        x: (desired.get(personId) ?? 0) + PADDING,
        y: generation * (NODE_H + GAP_Y) + PADDING,
        w: NODE_W,
        h: NODE_H,
        generation,
      });
    }
  });
  const nodeById = new Map(nodes.map((node) => [node.personId, node]));
  const edges: LayoutEdge[] = [];
  for (const relationship of relationships) {
    const from = nodeById.get(relationship.fromPersonId);
    const to = nodeById.get(relationship.toPersonId);
    if (!from || !to) continue;
    if (relationship.kind === 'parent_child') {
      edges.push({
        id: relationship.id,
        relationshipId: relationship.id,
        kind: 'parent-child',
        fromPersonId: relationship.fromPersonId,
        toPersonId: relationship.toPersonId,
        path: parentPath(from, to),
        dashed: relationship.confidence === 'possible' || relationship.confidence === 'disputed' || relationship.confidence === 'unknown',
      });
    } else if (relationship.kind === 'partnership') {
      edges.push({
        id: relationship.id,
        relationshipId: relationship.id,
        kind: 'partnership',
        fromPersonId: relationship.fromPersonId,
        toPersonId: relationship.toPersonId,
        path: partnerPath(from, to),
        dashed: relationship.partnershipType === 'former_spouse' || relationship.partnershipType === 'former_partner' || relationship.confidence === 'possible' || relationship.confidence === 'disputed' || relationship.confidence === 'unknown',
      });
    }
  }

  const maxX = nodes.reduce((max, node) => Math.max(max, node.x + node.w), 0);
  const maxY = nodes.reduce((max, node) => Math.max(max, node.y + node.h), 0);
  return {
    nodes,
    edges,
    width: maxX + PADDING,
    height: maxY + PADDING,
    cyclic,
  };
}

function placePartnersBeside(ordered: string[], relationships: Relationship[], layerIds: string[]): string[] {
  const layer = new Set(layerIds);
  const result = [...ordered];
  for (const relationship of relationships) {
    if (relationship.kind !== 'partnership') continue;
    const pair = [relationship.fromPersonId, relationship.toPersonId];
    if (!pair.every((id) => layer.has(id))) continue;
    const left = result.indexOf(pair[0]);
    const right = result.indexOf(pair[1]);
    if (left < 0 || right < 0 || Math.abs(left - right) === 1) continue;
    const [moving, anchor] = left > right ? [left, right] : [right, left];
    const [id] = result.splice(moving, 1);
    result.splice(anchor + 1, 0, id);
  }
  return result;
}

function averageParentX(
  personId: string,
  parentLayer: string[],
  relationships: Relationship[],
  desired: Map<string, number>,
): number {
  const parents = relationships
    .filter((relationship) => relationship.kind === 'parent_child' && relationship.toPersonId === personId && parentLayer.includes(relationship.fromPersonId))
    .map((relationship) => desired.get(relationship.fromPersonId) ?? 0);
  if (parents.length === 0) return desired.get(personId) ?? 0;
  return parents.reduce((sum, value) => sum + value, 0) / parents.length;
}

function pack(ids: string[], desired: Map<string, number>): void {
  let cursor = 0;
  const placed: Array<{ id: string; x: number }> = [];
  for (const id of ids) {
    const want = desired.get(id) ?? cursor;
    const x = Math.max(want, cursor);
    placed.push({ id, x });
    cursor = x + NODE_W + GAP_X;
  }
  if (placed.length === 0) return;
  const desiredCenter = ids.reduce((sum, id) => sum + (desired.get(id) ?? 0), 0) / ids.length + NODE_W / 2;
  const actualCenter = (placed[0].x + placed[placed.length - 1].x + NODE_W) / 2;
  const shift = desiredCenter - actualCenter;
  for (const item of placed) desired.set(item.id, item.x + shift);
}

function parentPath(from: LayoutNode, to: LayoutNode): string {
  const x1 = from.x + from.w / 2;
  const y1 = from.y + from.h;
  const x2 = to.x + to.w / 2;
  const y2 = to.y;
  const mid = y1 + (y2 - y1) / 2;
  return `M ${x1} ${y1} V ${mid} H ${x2} V ${y2}`;
}

function partnerPath(from: LayoutNode, to: LayoutNode): string {
  if (from.generation === to.generation) {
    const left = from.x <= to.x ? from : to;
    const right = from.x <= to.x ? to : from;
    const y = left.y + left.h / 2;
    return `M ${left.x + left.w} ${y} H ${right.x}`;
  }
  const x1 = from.x + from.w / 2;
  const y1 = from.y + from.h / 2;
  const x2 = to.x + to.w / 2;
  const y2 = to.y + to.h / 2;
  const lift = Math.min(y1, y2) - 28;
  return `M ${x1} ${y1} C ${x1} ${lift}, ${x2} ${lift}, ${x2} ${y2}`;
}

export function nodesOverlap(left: LayoutNode, right: LayoutNode): boolean {
  return left.x < right.x + right.w && left.x + left.w > right.x && left.y < right.y + right.h && left.y + left.h > right.y;
}
