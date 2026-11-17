import './ui/styles.css';
import { GameManager } from './core/GameManager';
import { SaveManager } from './settings/SaveManager';
import { SettingsManager } from './settings/SettingsManager';
import { UIManager } from './ui/UIManager';
import { Monetization } from './monetization/Monetization';
import { SHIFT_PROOF } from './levels/shiftProof';
import { TEST_DECK } from './levels/testDeck';
import { ORBITAL_LABYRINTH } from './levels/orbitalLabyrinth';
import { WORLDS } from './levels/worlds';
import { MULTI_LEVEL_PROTOTYPES } from './levels/multiLevel';

async function boot(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui')!;
  const save = new SaveManager();
  const settings = new SettingsManager(save);
  const game = await GameManager.create(canvas, ui, settings, save);

  // Multi-level boards are prototypes for the next batch of levels; they sit with the test courses for now.
  // App Store builds ship the 100-level campaign only.
  const extras = __RELEASE__ ? [] : [...MULTI_LEVEL_PROTOTYPES, SHIFT_PROOF, TEST_DECK];
  // The menu shows the final maze idling in the background.
  game.loadLevel(WORLDS[2].levels[9] ?? ORBITAL_LABYRINTH);
  game.toMenu();
  const money = new Monetization(settings);
  const uiManager = new UIManager(ui, game, settings, WORLDS, extras, money);
  // Store and ads start in the background (iPhone app only); the game never waits on them.
  void money.init().then(() => settings.update({}));
  game.start();

  // Prevent iOS rubber-band scrolling and double-tap zoom during play, but let sliders drag and
  // menu panels (Settings, How to Play, level lists) scroll: in the iPhone app's web view a blanket
  // preventDefault on touchmove freezes both.
  document.addEventListener('touchmove', (e) => {
    const t = e.target as Element | null;
    if (t?.closest?.(SCROLL_OR_DRAG)) return;
    e.preventDefault();
  }, { passive: false });
  document.addEventListener('dblclick', (e) => e.preventDefault());

  // Exposed for automated smoke tests and on-device debugging via Safari Web Inspector.
  Object.assign(window as unknown as Record<string, unknown>, { gravityShift: game, gravitorUI: uiManager, gravitorWorlds: WORLDS });
}

/** Elements whose own touch dragging must keep working (see the touchmove guard in boot). */
const SCROLL_OR_DRAG = 'input[type=range], .panel';

boot().catch((err) => {
  document.body.innerHTML = `<pre style="color:#f66;padding:20px;white-space:pre-wrap">Failed to start: ${String(err?.stack ?? err)}</pre>`;
});
