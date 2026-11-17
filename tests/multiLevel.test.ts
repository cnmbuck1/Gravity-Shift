import { describe, expect, it } from 'vitest';
import type { LevelDef, MazeDef } from '../src/levels/LevelTypes';
import { MULTI_LEVEL_PROTOTYPES } from '../src/levels/multiLevel';

const SAFE = '.SCGPL';

/** What lies at world (x, z) on a floor: the cell character, or ' ' outside it. */
function cellAt(m: MazeDef, x: number, z: number): string {
  const c = Math.round((x - m.origin[0]) / m.cell);
  const r = Math.round((z - m.origin[1]) / m.cell);
  return m.rows[r]?.[c] ?? ' ';
}

/** The first floor below `m` that has something (floor, wall or hazard) at (x, z). */
function landing(floors: MazeDef[], m: MazeDef, x: number, z: number): { floor: MazeDef; ch: string } | null {
  for (const f of floors.filter((o) => o.floorY < m.floorY).sort((a, b) => b.floorY - a.floorY)) {
    const ch = cellAt(f, x, z);
    if (ch !== ' ' && ch !== 'D') return { floor: f, ch };
  }
  return null;
}

function cells(m: MazeDef, chars: string): [number, number][] {
  const out: [number, number][] = [];
  m.rows.forEach((row, r) => [...row].forEach((ch, c) => chars.includes(ch) && out.push([m.origin[0] + c * m.cell, m.origin[1] + r * m.cell])));
  return out;
}

/** Floors reachable by rolling from (x, z) on `m`, then dropping through every 'D' reached. Returns the floors and cells reached. */
/** The glide chute (well with `steer`) a drop at (x, z) under floor `m` falls into, if any. */
function chuteAt(level: LevelDef, m: MazeDef, x: number, z: number) {
  return (level.wells ?? []).find((w) => w.steer && x >= w.min[0] && x <= w.max[0] && z >= w.min[2] && z <= w.max[2] && w.max[1] < m.floorY && w.max[1] > m.floorY - 1.5);
}

function reach(level: LevelDef, floors: MazeDef[], start: { m: MazeDef; x: number; z: number }): Set<string> {
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length) {
    const { m, x, z } = queue.pop()!;
    const key = `${m.floorY}:${x}:${z}`;
    if (seen.has(key)) continue;
    const ch = cellAt(m, x, z);
    if (ch === 'D') {
      seen.add(key);
      const below = landing(floors, m, x, z);
      if (below && SAFE.includes(below.ch)) queue.push({ m: below.floor, x, z });
      // A glide chute lets the ball steer onto any floor cell inside its footprint.
      const chute = chuteAt(level, m, x, z);
      if (chute) {
        const next = floors.filter((o) => o.floorY < m.floorY).sort((a, b) => b.floorY - a.floorY)[0];
        for (const [cx, cz] of cells(next, SAFE)) if (cx >= chute.min[0] && cx <= chute.max[0] && cz >= chute.min[2] && cz <= chute.max[2]) queue.push({ m: next, x: cx, z: cz });
      }
      continue;
    }
    if (!SAFE.includes(ch)) continue;
    seen.add(key);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) queue.push({ m, x: x + dx * m.cell, z: z + dz * m.cell });
  }
  return seen;
}

describe.each(MULTI_LEVEL_PROTOTYPES.map((l) => [l.name, l] as [string, LevelDef]))('multi-level board %s', (_name, level) => {
  const floors = [level.maze!, ...(level.tiers ?? [])];

  it('lands every drop hole on safe floor of the floor below', () => {
    for (const m of floors) {
      for (const [x, z] of cells(m, 'D')) {
        const below = landing(floors, m, x, z);
        if (chuteAt(level, m, x, z)) continue; // steered drop: the landing is off to one side
        expect(below && SAFE.includes(below.ch), `drop at ${x},${z} on floor y=${m.floorY} lands on ${below?.ch ?? 'nothing'}`).toBe(true);
      }
    }
  });

  it('has no plain hole that drops onto safe floor (no accidental shortcuts)', () => {
    for (const m of floors) {
      for (const [x, z] of cells(m, ' ')) {
        const below = landing(floors, m, x, z);
        if (below && m.rows.some((row) => row.includes('.'))) {
          // Cells outside a floor's walls are just empty space: only holes inside the course count.
          const inside = cellAt(m, x - m.cell, z) !== ' ' || cellAt(m, x + m.cell, z) !== ' ' || cellAt(m, x, z - m.cell) !== ' ' || cellAt(m, x, z + m.cell) !== ' ';
          if (inside) expect(SAFE.includes(below.ch), `hole at ${x},${z} on floor y=${m.floorY} lands on ${below.ch}`).toBe(false);
        }
      }
    }
  });

  it('can be finished: spawn reaches the goal through the drops', () => {
    const [sx, , sz] = level.spawn;
    const top = floors.reduce((a, b) => (Math.abs(b.floorY + 0.6 - level.spawn[1]) < Math.abs(a.floorY + 0.6 - level.spawn[1]) ? b : a));
    const snap = (v: number, o: number) => o + Math.round(v - o);
    const seen = reach(level, floors, { m: top, x: snap(sx, top.origin[0]), z: snap(sz, top.origin[1]) });
    const [gx, gy, gz] = level.goal!.position;
    const goalFloor = floors.find((f) => f.floorY === gy)!;
    const goalCells = cells(goalFloor, 'G').filter(([x, z]) => Math.abs(x - gx) < 1.5 && Math.abs(z - gz) < 1.5);
    expect(goalCells.length).toBeGreaterThan(0);
    expect(goalCells.some(([x, z]) => seen.has(`${gy}:${x}:${z}`))).toBe(true);
  });

  it('puts every checkpoint and the goal on floor cells', () => {
    for (const c of level.checkpoints ?? []) {
      const f = floors.find((m) => m.floorY === c.position[1])!;
      expect(SAFE.includes(cellAt(f, c.position[0] - 0.5, c.position[2] - 0.5))).toBe(true);
    }
  });
});
