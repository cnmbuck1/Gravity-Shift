import type { LevelDef, MazeDef, V3 } from './LevelTypes';

/**
 * Multi-level boards from the level generator (World 11 onward): each floor is generated as a
 * level of its own, then moved into place with `placeTier` and joined with `stackTiers`.
 *
 * A floor below may run back toward the camera: `flip` mirrors it front to back, so a course
 * built bottom-to-top can start right under the drop hole that ends the floor above.
 */
export interface TierPlacement {
  /** Metres to move the floor down (negative) or up. */
  dy: number;
  /** z' = (flip ? -z : z) + dz. */
  dz: number;
  flip?: boolean;
}

export function placeTier(def: LevelDef, at: TierPlacement): LevelDef {
  const s = at.flip ? -1 : 1;
  const z = (v: number) => s * v + at.dz;
  const p = (v: V3): V3 => [v[0], v[1] + at.dy, z(v[2])];
  const d = (v: V3): V3 => [v[0], v[1], s * v[2]];
  /** A box given by min/max corners: mirroring swaps the z ends. */
  const box = <T extends { min: V3; max: V3 }>(b: T): T => {
    const [z0, z1] = [z(b.min[2]), z(b.max[2])].sort((a, b) => a - b);
    return { ...b, min: [b.min[0], b.min[1] + at.dy, z0], max: [b.max[0], b.max[1] + at.dy, z1] };
  };
  /** A floor rectangle given by (x, z) corners. */
  const rect = <T extends { min: [number, number]; max: [number, number]; y: number }>(r: T): T => {
    const [z0, z1] = [z(r.min[1]), z(r.max[1])].sort((a, b) => a - b);
    return { ...r, min: [r.min[0], z0], max: [r.max[0], z1], y: r.y + at.dy };
  };
  const maze = (m: MazeDef): MazeDef => {
    if (!at.flip) return { ...m, floorY: m.floorY + at.dy, origin: [m.origin[0], m.origin[1] + at.dz] };
    // Row r sits at origin + r; mirrored, the last row comes first.
    const n = m.rows.length;
    return { ...m, floorY: m.floorY + at.dy, rows: [...m.rows].reverse(), origin: [m.origin[0], z(m.origin[1] + (n - 1) * m.cell)] };
  };
  return {
    ...def,
    spawn: p(def.spawn),
    maze: def.maze ? maze(def.maze) : undefined,
    tiers: def.tiers?.map(maze),
    platforms: def.platforms.map((q) => ({ ...q, position: p(q.position), rotation: q.rotation && at.flip ? [-q.rotation[0], -q.rotation[1], q.rotation[2]] : q.rotation })),
    movers: def.movers?.map((m) => ({ ...m, from: p(m.from), to: p(m.to) })),
    shiftZones: def.shiftZones?.map((q) => ({ ...box(q), whenDown: q.whenDown && d(q.whenDown), lean: q.lean && d(q.lean) })),
    checkpoints: def.checkpoints?.map((c) => ({ ...c, position: p(c.position) })),
    goal: def.goal && { ...def.goal, position: p(def.goal.position), facing: def.goal.facing && d(def.goal.facing) },
    crumble: def.crumble?.map((c) => ({ ...c, position: p(c.position) })),
    pads: def.pads?.map((q) => ({ ...rect(q), dir: q.dir && [q.dir[0], s * q.dir[1]] })),
    lasers: def.lasers?.map((l) => ({ ...l, from: p(l.from), to: p(l.to) })),
    switches: def.switches?.map((w) => ({ ...w, position: p(w.position) })),
    doors: def.doors?.map((q) => ({ ...q, position: p(q.position) })),
    wells: def.wells?.map(box),
    rotators: def.rotators?.map((r) => ({ ...r, centre: p(r.centre), speed: s * r.speed })),
    portals: def.portals?.map((q) => ({ ...q, a: p(q.a), b: p(q.b), exit: q.exit && [q.exit[0], s * q.exit[1]] })),
    keys: def.keys?.map((k) => ({ ...k, position: p(k.position) })),
    fans: def.fans?.map((f) => ({ ...box(f), dir: [f.dir[0], s * f.dir[1]] })),
    pulses: def.pulses?.map(rect),
    killY: def.killY !== undefined ? def.killY + at.dy : undefined,
  };
}

/**
 * Joins placed floors into one multi-level board: the first floor's start, the last floor's goal,
 * everything else concatenated (switch → door links are renumbered to match).
 */
export function stackTiers(meta: Pick<LevelDef, 'id' | 'name' | 'subtitle' | 'par'> & Partial<LevelDef>, floors: LevelDef[]): LevelDef {
  const first = floors[0];
  const last = floors[floors.length - 1];
  const all = <K extends keyof LevelDef>(k: K) => floors.flatMap((f) => (f[k] as unknown[] | undefined) ?? []) as NonNullable<LevelDef[K]>;
  let doorBase = 0;
  const switches = floors.flatMap((f) => {
    const out = (f.switches ?? []).map((s) => ({ ...s, doors: s.doors.map((i) => i + doorBase) }));
    doorBase += f.doors?.length ?? 0;
    return out;
  });
  const mazes = floors.flatMap((f) => [...(f.maze ? [f.maze] : []), ...(f.tiers ?? [])]);
  const lowest = Math.min(...mazes.map((m) => m.floorY));
  const zones = all('shiftZones');
  const listed = <T>(a: T[]) => (a.length ? a : undefined);
  return {
    ...first,
    ...meta,
    spawn: first.spawn,
    frame: first.frame,
    allowShifts: floors.some((f) => f.allowShifts),
    shiftZones: listed(zones),
    maze: mazes[0],
    tiers: mazes.slice(1),
    platforms: all('platforms'),
    movers: all('movers'),
    checkpoints: all('checkpoints'),
    goal: last.goal,
    crumble: listed(all('crumble')),
    pads: listed(all('pads')),
    lasers: listed(all('lasers')),
    switches: listed(switches),
    doors: listed(all('doors')),
    wells: listed(all('wells')),
    rotators: listed(all('rotators')),
    portals: listed(all('portals')),
    keys: listed(all('keys')),
    fans: listed(all('fans')),
    pulses: listed(all('pulses')),
    killY: lowest - 6,
  };
}
