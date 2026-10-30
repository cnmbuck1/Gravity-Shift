import './ui/styles.css';
import { GameManager } from './core/GameManager';
import { SaveManager } from './settings/SaveManager';
import { SettingsManager } from './settings/SettingsManager';
import { UIManager } from './ui/UIManager';
import { SHIFT_PROOF } from './levels/shiftProof';
import { TEST_DECK } from './levels/testDeck';

async function boot(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui')!;
  const save = new SaveManager();
  const settings = new SettingsManager(save);
  const game = await GameManager.create(canvas, ui, settings, save);

  // The menu shows the first level idling in the background.
  const levels = [SHIFT_PROOF, TEST_DECK];
  game.loadLevel(levels[0]);
  game.toMenu();
  new UIManager(ui, game, settings, levels);
  game.start();

  // Prevent iOS rubber-band scrolling and double-tap zoom during play.
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('dblclick', (e) => e.preventDefault());

  // Exposed for automated smoke tests and on-device debugging via Safari Web Inspector.
  (window as unknown as { gravityShift: GameManager }).gravityShift = game;
}

boot().catch((err) => {
  document.body.innerHTML = `<pre style="color:#f66;padding:20px;white-space:pre-wrap">Failed to start: ${String(err?.stack ?? err)}</pre>`;
});
