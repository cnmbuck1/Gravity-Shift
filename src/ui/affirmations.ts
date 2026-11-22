/**
 * Positive affirmations (Chris, 2026-11-22: "people love affirmations"). Short, upbeat lines in
 * the game's neon-space voice for the moments worth celebrating: a flawless run, a new personal
 * best, 3 stars, a new rank, a friend passed, a world cleared, a comeback.
 *
 * Every moment has a pool of lines. Lines are dealt like cards from a shuffled deck, so the
 * same line never comes up twice in a row and every line is used before any repeats. The deck
 * position is saved, so it carries on across app launches.
 */

export type Moment =
  | 'flawless'
  | 'firstTry'
  | 'clean'
  | 'personalBest'
  | 'threeStars'
  | 'rankUp'
  | 'passedFriend'
  | 'worldCleared'
  | 'comeback'
  | 'streak'
  | 'weekly'
  | 'cleared'
  | 'checkpointClean'
  | 'fall';

/** `{n}`, `{name}`, `{world}` and `{delta}` are filled in when the line is used. */
export const LINES: Record<Moment, readonly string[]> = {
  flawless: [
    'Not a single slip.',
    'Pure precision.',
    'Clean orbit, start to finish.',
    'Zero falls. Total control.',
    'Smooth as starlight.',
    'Gravity never stood a chance.',
    'Perfect line, perfect run.',
    'Flawless flight.',
    'Untouchable.',
    'Every turn, right on target.',
  ],
  firstTry: [
    'First try. Incredible.',
    'One shot, one portal.',
    'Straight in on the first go.',
    'Natural born navigator.',
    'You made that look easy.',
    'No practice needed.',
  ],
  clean: [
    'No falls on that run.',
    'You found the line.',
    'Practice made perfect.',
    'Locked in.',
    'Steady all the way.',
    'Clean and controlled.',
  ],
  personalBest: [
    'Faster than ever.',
    'You just outran yourself.',
    'Your fastest yet.',
    'New personal record.',
    'Quicker every time.',
    'The clock fears you.',
    'Sharper. Faster. Better.',
    'You beat your best.',
  ],
  threeStars: [
    'Three stars. Stellar.',
    'Full constellation.',
    'Top marks across the board.',
    'Shining bright.',
    'A star-studded run.',
    'All three stars, all yours.',
  ],
  rankUp: [
    'You climbed to #{n}.',
    'Now #{n} in the world.',
    'Up to #{n}. Keep climbing.',
    '#{n} and rising.',
    'New rank: #{n}.',
    'The galaxy has a new #{n}.',
  ],
  passedFriend: [
    'You passed {name}!',
    'Sorry, {name}. You\'re ahead now.',
    'Look out, {name}: you overtook them.',
    '{name} is in your rear view.',
  ],
  worldCleared: [
    '{world} conquered.',
    '{world} is yours.',
    'Another world down.',
    'On to the next frontier.',
    'You mastered {world}.',
    'Next stop: the stars.',
  ],
  comeback: [
    'Persistence pays off.',
    'Never gave up.',
    'Grit wins.',
    'Worth every try.',
    'You kept rolling. Respect.',
    'That one fought back. You won.',
  ],
  streak: [
    '{n} flawless in a row.',
    '{n} clean levels straight. On fire.',
    'Streak: {n}. Unstoppable.',
    '{n} in a row without a fall.',
  ],
  weekly: [
    'Weekly Challenge complete.',
    'This week\'s board has your name on it.',
    'Challenge accepted. Challenge crushed.',
    'See you on the board.',
  ],
  cleared: [
    'Nice roll.',
    'Goal reached.',
    'Smooth landing.',
    'Well played.',
    'Into the portal.',
    'Nailed it.',
    'Onward.',
    'Great flying.',
    'Mission complete.',
    'Right on course.',
  ],
  checkpointClean: [
    'CHECKPOINT · LOOKING SHARP',
    'CHECKPOINT · CLEAN SO FAR',
    'CHECKPOINT · KEEP THAT LINE',
    'CHECKPOINT · SMOOTH',
    'CHECKPOINT · NICE ROLLING',
  ],
  fall: [
    'FELL INTO THE VOID',
    'INTO THE VOID · SHAKE IT OFF',
    'FELL · YOU\'VE GOT THIS',
    'INTO THE VOID · AGAIN, SMARTER',
    'FELL · EVERY FALL TEACHES',
  ],
};

/** Big word above each moment's line on the result screen. */
export const KICKERS: Record<Moment, string> = {
  flawless: 'FLAWLESS',
  firstTry: 'FIRST TRY',
  clean: 'CLEAN RUN',
  personalBest: 'NEW BEST',
  threeStars: '★★★',
  rankUp: 'RANK UP',
  passedFriend: 'OVERTAKE',
  worldCleared: 'WORLD CLEARED',
  comeback: 'COMEBACK',
  streak: 'STREAK',
  weekly: 'ON THE BOARD',
  cleared: 'COMPLETE',
  checkpointClean: '',
  fall: '',
};

export interface Store {
  load<T>(key: string, fallback: T): T;
  save<T>(key: string, value: T): void;
}

interface Deck {
  order: number[];
  next: number;
  last: number;
}

/** Deals lines without repeats (see the file comment). */
export class Affirmations {
  constructor(private store: Store, private random: () => number = Math.random) {}

  line(moment: Moment, vars: Record<string, string | number> = {}): string {
    const lines = LINES[moment];
    const key = `cheer:${moment}`;
    let deck = this.store.load<Deck>(key, { order: [], next: 0, last: -1 });
    if (deck.order.length !== lines.length || deck.next >= deck.order.length) {
      const order = shuffle(lines.map((_, i) => i), this.random);
      // A fresh deck never starts with the line that ended the last one.
      if (order.length > 1 && order[0] === deck.last) [order[0], order[1]] = [order[1], order[0]];
      deck = { order, next: 0, last: deck.last };
    }
    const i = deck.order[deck.next];
    this.store.save(key, { ...deck, next: deck.next + 1, last: i });
    return fill(lines[i], vars);
  }
}

function shuffle<T>(a: T[], random: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** What happened on a finished run, for choosing what to celebrate. */
export interface Highlights {
  falls: number;
  firstTry: boolean;
  newBest: boolean;
  /** Seconds faster than the old best (0 on a first clear). */
  gain: number;
  stars: number;
  /** First time this level got 3 stars. */
  firstThreeStars: boolean;
  worldCleared: string | null;
  streak: number;
  fallsInLevel: number;
  weekly: boolean;
  /** Achievements earned on this run (names). */
  achievements: string[];
}

export interface Cheer {
  kicker: string;
  line: string;
  /** Smaller badges for the other things that went well. */
  chips: string[];
}

/** Moments worth a chip, best first. */
const CHIP_ORDER: Moment[] = ['worldCleared', 'firstTry', 'flawless', 'personalBest', 'threeStars', 'streak', 'comeback', 'clean'];

/**
 * Picks the headline for a finished run (the biggest moment) and chips for the rest. A world
 * cleared beats everything; then a flawless first try, a new best, 3 stars and so on.
 */
export function celebrate(h: Highlights, cheers: Affirmations, worldName = ''): Cheer {
  const hit = new Set<Moment>();
  if (h.worldCleared) hit.add('worldCleared');
  if (h.falls === 0 && h.firstTry) hit.add('firstTry');
  else if (h.falls === 0 && h.fallsInLevel === 0) hit.add('flawless');
  else if (h.falls === 0) hit.add('clean');
  if (h.newBest && h.gain > 0) hit.add('personalBest');
  if (h.firstThreeStars || (h.stars === 3 && h.newBest)) hit.add('threeStars');
  if (h.streak >= 3) hit.add('streak');
  if (h.fallsInLevel >= 5) hit.add('comeback');
  if (h.weekly) hit.add('weekly');

  const vars = { n: h.streak, world: h.worldCleared ?? worldName, delta: h.gain.toFixed(2) };
  const head: Moment = h.weekly && !h.worldCleared ? (hit.has('personalBest') ? 'personalBest' : 'weekly') : CHIP_ORDER.find((m) => hit.has(m)) ?? 'cleared';
  const chips: string[] = [];
  for (const m of CHIP_ORDER) {
    // The big stars on the result screen already show 3 stars.
    if (m === head || m === 'threeStars' || !hit.has(m)) continue;
    chips.push(chipText(m, h));
  }
  for (const name of h.achievements) chips.push(`🏆 ${name}`);
  let kicker = KICKERS[head];
  if (head === 'personalBest') kicker = `NEW BEST · −${h.gain.toFixed(2)}s`;
  if (head === 'streak') kicker = `STREAK · ${h.streak}`;
  return { kicker, line: cheers.line(head, vars), chips };
}

function chipText(m: Moment, h: Highlights): string {
  switch (m) {
    case 'personalBest': return `NEW BEST −${h.gain.toFixed(2)}s`;
    case 'streak': return `${h.streak} IN A ROW`;
    case 'worldCleared': return 'WORLD CLEARED';
    default: return KICKERS[m];
  }
}
