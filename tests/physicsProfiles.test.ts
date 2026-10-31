import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PhysicsManager, FIXED_DT } from '../src/physics/PhysicsManager';
import { BallController } from '../src/game/BallController';
import { GravityFrame } from '../src/game/GravityFrame';
import { CLASSIC, REFINED, type PhysicsTuning } from '../src/game/PhysicsTuning';

/**
 * Side-by-side measurements of the two feel profiles on a flat floor, so tuning changes are
 * compared with numbers rather than guessed. Run `npm test` to print the table.
 */
async function measure(t: PhysicsTuning) {
  const physics = await PhysicsManager.create();
  const R = physics.rapier;
  physics.world.gravity = { x: 0, y: -14, z: 0 };
  const floor = physics.world.createRigidBody(R.RigidBodyDesc.fixed());
  physics.world.createCollider(R.ColliderDesc.cuboid(500, 0.5, 500).setTranslation(0, -0.5, 0).setFriction(0.9), floor);
  const ball = new BallController(physics, new THREE.Scene());
  ball.applyTuning(t);
  const frame = new GravityFrame({ down: [0, -1, 0], forward: [0, 0, -1] });
  ball.teleport(new THREE.Vector3(0, 0.5, 0));
  const step = (input: [number, number]) => {
    ball.applyInput(input, frame, FIXED_DT);
    physics.world.step();
    ball.recordState();
  };
  const speed = () => {
    const v = ball.body.linvel();
    return Math.hypot(v.x, v.z);
  };
  for (let i = 0; i < 20; i++) step([0, 0]);

  // Time from rest to 5 m/s at half tilt (a moderate, controlled push).
  let n = 0;
  while (speed() < 5 && n < 600) { step([0, 0.5]); n++; }
  const timeTo5 = n * FIXED_DT;
  // Keep pushing to see the top speed at full tilt.
  for (let i = 0; i < 240; i++) step([0, 1]);
  const topSpeed = speed();

  // Braking: full reverse tilt from 6 m/s until stopped.
  ball.body.setLinvel({ x: 0, y: 0, z: -6 }, true);
  ball.body.setAngvel({ x: -12, y: 0, z: 0 }, true);
  let z0 = ball.body.translation().z;
  n = 0;
  while (ball.body.linvel().z < -0.05 && n < 600) { step([0, -1]); n++; }
  const brakeDist = Math.abs(ball.body.translation().z - z0);

  // Coasting: level phone from 4 m/s until nearly stopped.
  ball.body.setLinvel({ x: 0, y: 0, z: -4 }, true);
  ball.body.setAngvel({ x: -8, y: 0, z: 0 }, true);
  z0 = ball.body.translation().z;
  n = 0;
  while (speed() > 0.1 && n < 1200) { step([0, 0]); n++; }
  const coastDist = Math.abs(ball.body.translation().z - z0);
  return { timeTo5: +timeTo5.toFixed(2), topSpeed: +topSpeed.toFixed(1), brakeDist: +brakeDist.toFixed(2), coastDist: +coastDist.toFixed(1) };
}

describe('physics profiles', () => {
  it('refined brakes and settles sooner than classic, with a lower top speed', async () => {
    const classic = await measure(CLASSIC);
    const refined = await measure(REFINED);
    console.table({ classic, refined });
    expect(refined.brakeDist).toBeLessThan(classic.brakeDist);
    expect(refined.coastDist).toBeLessThan(classic.coastDist);
    expect(refined.topSpeed).toBeLessThan(classic.topSpeed);
  });
});
