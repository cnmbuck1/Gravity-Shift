import type { SaveManager } from './SaveManager';
import type { PhysicsProfile } from '../game/PhysicsTuning';

export type ControlMode = 'tilt' | 'touch';
export type GraphicsQuality = 'low' | 'high';
/** The player's ball: the original chrome sphere, or the Cnmbuck Orb (won by finishing the campaign). */
export type BallSkin = 'chrome' | 'orb';

export interface Settings {
  controlMode: ControlMode;
  /** 0.5 - 2.0, multiplies measured tilt. */
  tiltSensitivity: number;
  /** Degrees of tilt ignored around neutral. */
  deadZoneDeg: number;
  /** Seconds; time constant of the sensor low-pass filter. */
  smoothing: number;
  sfx: boolean;
  music: boolean;
  graphics: GraphicsQuality;
  showDebug: boolean;
  physics: PhysicsProfile;
  haptics: boolean;
  /** Show the course flyover before the first attempt at a level. */
  preview: boolean;
  ball: BallSkin;
  /** The campaign is finished and the Cnmbuck Orb has been awarded (the announcement shows once). */
  orbWon: boolean;
  /** Testing: every world and level is playable without unlocking. */
  unlockAll: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  controlMode: 'tilt',
  tiltSensitivity: 1,
  deadZoneDeg: 1.5,
  smoothing: 0.035,
  sfx: true,
  music: true,
  graphics: 'high',
  showDebug: false,
  physics: 'refined',
  haptics: true,
  preview: true,
  ball: 'chrome',
  orbWon: false,
  unlockAll: true,
};

type Listener = (s: Readonly<Settings>) => void;

export class SettingsManager {
  private settings: Settings;
  private listeners: Listener[] = [];

  constructor(private save: SaveManager) {
    // Fill in settings added since the save was written.
    this.settings = { ...DEFAULT_SETTINGS, ...save.load('settings', { ...DEFAULT_SETTINGS }) };
    // While the worlds are being playtested, open every level once on each device, even if an
    // older save had the switch off. Turning it off afterwards still sticks.
    if (!save.load('unlockAllTesting', false)) {
      this.settings.unlockAll = true;
      this.save.save('settings', this.settings);
      this.save.save('unlockAllTesting', true);
    }
  }

  get(): Readonly<Settings> {
    return this.settings;
  }

  update(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    this.save.save('settings', this.settings);
    for (const l of this.listeners) l(this.settings);
  }

  onChange(l: Listener): void {
    this.listeners.push(l);
  }
}
