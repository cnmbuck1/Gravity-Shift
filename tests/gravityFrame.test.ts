import { describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import { GravityFrame } from '../src/game/GravityFrame';

const r = (v: THREE.Vector3) => v.toArray().map((x) => Math.round(x) || 0);

describe('gravity frame', () => {
  it('starts with right = +x for down -y and forward -z', () => {
    const f = new GravityFrame({ down: [0, -1, 0], forward: [0, 0, -1] });
    expect(r(f.right)).toEqual([1, 0, 0]);
  });

  it('shift right turns the right wall into the floor and keeps forward', () => {
    const f = new GravityFrame({ down: [0, -1, 0], forward: [0, 0, -1] });
    f.set(f.shifted('right'));
    expect(r(f.down)).toEqual([1, 0, 0]);
    expect(r(f.forward)).toEqual([0, 0, -1]);
    // On the wall, screen-right is the old sky.
    expect(r(f.right)).toEqual([0, 1, 0]);
    // A second right shift lands on the ceiling.
    f.set(f.shifted('right'));
    expect(r(f.down)).toEqual([0, 1, 0]);
  });

  it('shift forward climbs the wall ahead', () => {
    const f = new GravityFrame({ down: [0, -1, 0], forward: [0, 0, -1] });
    f.set(f.shifted('forward'));
    expect(r(f.down)).toEqual([0, 0, -1]);
    expect(r(f.forward)).toEqual([0, 1, 0]);
  });

  it('four right shifts return to the start (no drift)', () => {
    const f = new GravityFrame({ down: [0, -1, 0], forward: [0, 0, -1] });
    for (let i = 0; i < 4; i++) f.set(f.shifted('right'));
    expect(r(f.down)).toEqual([0, -1, 0]);
  });
});
