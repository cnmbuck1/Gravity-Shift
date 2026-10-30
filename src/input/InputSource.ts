import type { Vec2 } from './tiltMath';

/**
 * Every control scheme produces the same thing: a normalized movement intent.
 * x > 0 = right, y > 0 = forward (away from the camera). |v| <= 1.
 * The physics layer turns this into acceleration, so tilt, touch and keyboard
 * all drive the ball through exactly the same code path.
 */
export interface InputSource {
  read(): Vec2;
}
