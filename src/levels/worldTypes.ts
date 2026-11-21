import type { LevelDef, WorldTheme } from './LevelTypes';

/** Ten levels sharing one new idea and one colour scheme. */
export interface WorldDef {
  id: string;
  name: string;
  /** The idea this world introduces, shown on the world card. */
  idea: string;
  theme: WorldTheme;
  levels: LevelDef[];
}

/** Gives every level in a world that world's colours. */
export function world(id: string, name: string, idea: string, theme: WorldTheme, levels: LevelDef[]): WorldDef {
  return { id, name, idea, theme, levels: levels.map((l) => ({ ...l, theme })) };
}

export const THEMES: Record<string, WorldTheme> = {
  launch: { accent: '#2ee6ff', sky: '#05070d', floor: '#6b7484', wall: '#cfd7e4' },
  piston: { accent: '#ffc24a', sky: '#0c0805', floor: '#7a7468', wall: '#e4dccb' },
  wall: { accent: '#b46bff', sky: '#09051a', floor: '#6f6a88', wall: '#d6cfee' },
  crumble: { accent: '#ff7a3d', sky: '#120705', floor: '#7f6a5e', wall: '#e2cfc2' },
  flux: { accent: '#3a8bff', sky: '#03081a', floor: '#5f6f8f', wall: '#c7d6f2' },
  skyward: { accent: '#9fe8ff', sky: '#020b1c', floor: '#5d6b80', wall: '#d2e6f5' },
  circuit: { accent: '#ff4fa0', sky: '#100308', floor: '#6e5f6a', wall: '#e8cfdb' },
  orbit: { accent: '#5fffd8', sky: '#03100e', floor: '#6a8580', wall: '#d8f2ec' },
  spin: { accent: '#ff9a1a', sky: '#0d0702', floor: '#857563', wall: '#ece0cf' },
  horizon: { accent: '#d27bff', sky: '#000000', floor: '#5a5466', wall: '#cbc3dc' },
  depths: { accent: '#7a8cff', sky: '#04040f', floor: '#646a86', wall: '#d2d6f0' },
  warp: { accent: '#3dffa0', sky: '#020c08', floor: '#5f7a6e', wall: '#cfe8dc' },
  vault: { accent: '#ffd84a', sky: '#0d0a02', floor: '#80765a', wall: '#ede2c2' },
  storm: { accent: '#9fd8ff', sky: '#050a10', floor: '#66727e', wall: '#d6e2ec' },
  blackout: { accent: '#ffffff', sky: '#010102', floor: '#4d5260', wall: '#b8bdc8' },
  pulse: { accent: '#ff5a5a', sky: '#0e0303', floor: '#7a6262', wall: '#ecd2d2' },
  deepvault: { accent: '#f0b93a', sky: '#06050d', floor: '#6c6a80', wall: '#ded8e8' },
  warpstorm: { accent: '#4dffd2', sky: '#02090c', floor: '#5f7680', wall: '#cde4ea' },
  night: { accent: '#8f9dff', sky: '#010103', floor: '#4f5266', wall: '#bcc0d6' },
  singularity: { accent: '#ff7af0', sky: '#000000', floor: '#5c5466', wall: '#d6c8e2' },
};
