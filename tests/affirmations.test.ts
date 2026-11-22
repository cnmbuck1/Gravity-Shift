import { describe, expect, it } from 'vitest';
import { Affirmations, LINES, celebrate, type Highlights, type Store } from '../src/ui/affirmations';

function memoryStore(): Store {
  const m = new Map<string, string>();
  return {
    load: <T,>(k: string, f: T) => (m.has(k) ? { ...f, ...JSON.parse(m.get(k)!) } : f),
    save: (k, v) => void m.set(k, JSON.stringify(v)),
  };
}

const base: Highlights = {
  falls: 0, firstTry: false, newBest: false, gain: 0, stars: 1, firstThreeStars: false, worldCleared: null, streak: 0, fallsInLevel: 0, weekly: false, achievements: [],
};

describe('affirmations', () => {
  it('uses every line before repeating, and never the same line twice in a row', () => {
    const cheers = new Affirmations(memoryStore());
    const n = LINES.personalBest.length;
    const seen: string[] = [];
    for (let i = 0; i < n * 6; i++) seen.push(cheers.line('personalBest'));
    for (let k = 0; k < 6; k++) expect(new Set(seen.slice(k * n, (k + 1) * n)).size).toBe(n);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });

  it('fills in names and numbers', () => {
    const cheers = new Affirmations(memoryStore());
    for (let i = 0; i < 10; i++) expect(cheers.line('passedFriend', { name: 'Sam' })).toMatch(/Sam/);
    for (let i = 0; i < 10; i++) expect(cheers.line('rankUp', { n: 12 })).toMatch(/#12/);
  });

  it('headlines the biggest moment and lists the rest', () => {
    const cheers = new Affirmations(memoryStore());
    const flawlessBest = celebrate({ ...base, newBest: true, gain: 1.234, stars: 3 }, cheers);
    expect(flawlessBest.kicker).toBe('FLAWLESS');
    expect(flawlessBest.chips).toEqual(['NEW BEST −1.23s']);
    const first = celebrate({ ...base, firstTry: true, newBest: true, stars: 3, firstThreeStars: true }, cheers);
    expect(first.kicker).toBe('FIRST TRY');
    const world = celebrate({ ...base, firstTry: true, worldCleared: 'Blackout', achievements: ['Lights Out'] }, cheers);
    expect(world.kicker).toBe('WORLD CLEARED');
    expect(world.chips).toEqual(['FIRST TRY', '🏆 Lights Out']);
    const grind = celebrate({ ...base, falls: 3, fallsInLevel: 7 }, cheers);
    expect(grind.kicker).toBe('COMEBACK');
    const plain = celebrate({ ...base, falls: 1, fallsInLevel: 1 }, cheers);
    expect(plain.kicker).toBe('COMPLETE');
    expect(LINES.cleared).toContain(plain.line);
    const pb = celebrate({ ...base, falls: 2, fallsInLevel: 2, newBest: true, gain: 0.5 }, cheers);
    expect(pb.kicker).toBe('NEW BEST · −0.50s');
  });
});
