import type { SaveManager } from './SaveManager';
import type { PhysicsProfile } from '../game/PhysicsTuning';

export type ControlMode = 'tilt' | 'touch';
export type GraphicsQuality = 'low' | 'high';

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
};

type Listener = (s: Readonly<Settings>) => void;

export class SettingsManager {
  private settings: Settings;
  private listeners: Listener[] = [];

  constructor(private save: SaveManager) {
    this.settings = save.load('settings', { ...DEFAULT_SETTINGS });
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
