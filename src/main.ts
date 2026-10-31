import './ui/styles.css';
import { GameManager } from './core/GameManager';
import { SaveManager } from './settings/SaveManager';
import { SettingsManager } from './settings/SettingsManager';
import { UIManager } from './ui/UIManager';
import { SHIFT_PROOF } from './levels/shiftProof';
import { TEST_DECK } from './levels/testDeck';
import { ORBITAL_LABYRINTH } from './levels/orbitalLabyrinth';
import { WORLDS } from './levels/worlds';

async function boot(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui')!;
  const save = new SaveManager();
  const settings = new SettingsManager(save);
  const game = await GameManager.create(canvas, ui, settings, save);

  const extras = [SHIFT_PROOF, TEST_DECK];
  // The menu shows the final maze idling in the background.
  game.loadLevel(WORLDS[2].levels[9] ?? ORBITAL_LABYRINTH);
  game.toMenu();
  const uiManager = new UIManager(ui, game, settings, WORLDS, extras);
  game.start();

  // Prevent iOS rubber-band scrolling and double-tap zoom during play.
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('dblclick', (e) => e.preventDefault());

  // Exposed for automated smoke tests and on-device debugging via Safari Web Inspector.
  Object.assign(window as unknown as Record<string, unknown>, { gravityShift: game, gravitorUI: uiManager, gravitorWorlds: WORLDS });
}

boot().catch((err) => {
  document.body.innerHTML = `<pre style="color:#f66;padding:20px;white-space:pre-wrap">Failed to start: ${String(err?.stack ?? err)}</pre>`;
});
