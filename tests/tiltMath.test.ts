import { describe, expect, it } from 'vitest';
import { buildNeutralBasis, gravityFromOrientation, relativeTiltDegrees, shapeTilt } from '../src/input/tiltMath';

const shape = { deadZoneDeg: 1.5, maxTiltDeg: 22, sensitivity: 1, curve: 1 };

describe('tilt math', () => {
  it('flat phone has gravity straight through the back', () => {
    const g = gravityFromOrientation(0, 0);
    expect(g[2]).toBeCloseTo(-1);
  });

  it('right edge down rolls right, top edge down rolls forward (flat neutral)', () => {
    const basis = buildNeutralBasis(gravityFromOrientation(0, 0));
    const right = relativeTiltDegrees(gravityFromOrientation(0, 10), basis);
    expect(right[0]).toBeCloseTo(10, 3);
    expect(Math.abs(right[1])).toBeLessThan(0.01);
    // beta decreasing = top edge dips away from the player.
    const fwd = relativeTiltDegrees(gravityFromOrientation(-10, 0), basis);
    expect(fwd[1]).toBeCloseTo(10, 3);
  });

  it('calibrating at a 40 degree hold makes that pose neutral', () => {
    const basis = buildNeutralBasis(gravityFromOrientation(40, 0));
    const t = relativeTiltDegrees(gravityFromOrientation(40, 0), basis);
    expect(Math.abs(t[0])).toBeLessThan(1e-6);
    expect(Math.abs(t[1])).toBeLessThan(1e-6);
    // Tilting further toward the face (beta up) rolls the ball backward.
    expect(relativeTiltDegrees(gravityFromOrientation(50, 0), basis)[1]).toBeCloseTo(-10, 3);
    // Rolling the right edge down still means right.
    expect(relativeTiltDegrees(gravityFromOrientation(40, 8), basis)[0]).toBeGreaterThan(5);
  });

  it('roll and pitch are independent and symmetric at a 40 degree hold', () => {
    const basis = buildNeutralBasis(gravityFromOrientation(40, 0));
    for (const tip of [-15, 0, 15]) {
      // Tipping back or forward never changes how much left/right you get...
      const r = relativeTiltDegrees(gravityFromOrientation(40 + tip, 15), basis);
      const l = relativeTiltDegrees(gravityFromOrientation(40 + tip, -15), basis);
      expect(r[0]).toBeCloseTo(15, 3);
      expect(l[0]).toBeCloseTo(-15, 3);
      // ...and rolling left/right never reads as forward/back.
      expect(r[1]).toBeCloseTo(-tip, 3);
      expect(l[1]).toBeCloseTo(-tip, 3);
    }
  });

  it('side-to-side response does not depend on how steeply the phone is held', () => {
    for (const hold of [0, 25, 40, 55]) {
      const basis = buildNeutralBasis(gravityFromOrientation(hold, 0));
      expect(relativeTiltDegrees(gravityFromOrientation(hold, 20), basis)[0]).toBeCloseTo(20, 3);
    }
  });

  it('dead zone suppresses tiny tilts and output is continuous at its edge', () => {
    expect(shapeTilt([1, 0.5], shape)).toEqual([0, 0]);
    const justOut = shapeTilt([1.6, 0], shape);
    expect(justOut[0]).toBeGreaterThan(0);
    expect(justOut[0]).toBeLessThan(0.01);
  });

  it('output saturates at magnitude 1 and sensitivity scales response', () => {
    const v = shapeTilt([40, 40], shape);
    expect(Math.hypot(v[0], v[1])).toBeCloseTo(1);
    const lo = shapeTilt([8, 0], shape)[0];
    const hi = shapeTilt([8, 0], { ...shape, sensitivity: 1.5 })[0];
    expect(hi).toBeGreaterThan(lo);
  });
});
