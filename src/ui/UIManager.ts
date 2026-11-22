import type { GameManager, LevelRecord, RunStats } from '../core/GameManager';
import type { SettingsManager } from '../settings/SettingsManager';
import { DEFAULT_SETTINGS, orbAvailable, ORB_LEVELS } from '../settings/SettingsManager';
import type { Monetization } from '../monetization/Monetization';
import type { Analytics, LevelInfo } from '../analytics/Analytics';
import type { LevelDef } from '../levels/LevelTypes';
import type { WorldDef } from '../levels/worldTypes';
import type { ShiftDirection } from '../game/GravityFrame';
import { drawOrbIcon } from '../brand/cnmbuck-orb';
import { BUNDLE, bundleWorthOffering, packFor } from '../monetization/packs';

/** Falls in one level (across restarts) before the Skip Level button is offered. */
const SKIP_AFTER_FALLS = 3;

/**
 * DOM overlay: menus, HUD, settings and toasts. Talks to the game only through
 * GameManager's public methods and events, so UI and gameplay stay decoupled.
 */
export class UIManager {
  private root: HTMLElement;
  private screens: Record<string, HTMLElement> = {};
  private hud!: HTMLElement;
  private toastEl!: HTMLElement;
  private debugEl!: HTMLElement;
  private shiftFlash!: HTMLElement;
  private toastTimer = 0;
  private shiftPad!: HTMLElement;
  private shiftKey = '';
  private previewDone: (() => void) | null = null;
  private settingsReturn: 'menu' | 'game' = 'menu';

  private levels: LevelDef[];
  private campaign: LevelDef[];
  private current = 0;
  /** Falls in the current level, counted across restarts; the Skip Level button appears at SKIP_AFTER_FALLS. */
  private levelFalls = 0;
  private skipping = false;
  /** Set between tapping NEXT LEVEL and that level starting (an ad may show in between). */
  private advancing = false;
  /** World shown in the level list (-1: the world list). */
  private openWorld = -1;
  /** World whose pack the paywall is selling, and the level to start once it's bought (-1: none). */
  private paywallWorld = -1;
  private paywallLevel = -1;
  /** Where the paywall's NOT NOW goes. */
  private paywallReturn: 'levels' | 'menu' = 'menu';
  /** Set while a purchase sheet is open, so a double tap can't start a second one. */
  private buying = false;

  /** Campaign levels (all worlds, in order) unlock one after another; `extras` (test courses) are always available. */
  constructor(root: HTMLElement, private game: GameManager, private settings: SettingsManager, private worlds: WorldDef[], private extras: LevelDef[], private money: Monetization, private analytics: Analytics) {
    this.campaign = worlds.flatMap((w) => w.levels);
    this.levels = [...this.campaign, ...extras];
    this.root = root;
    this.build();
    // The O in the GRAVITOR logo is the Cnmbuck Orb, drawn by the brand kit.
    const orb = this.root.querySelector<HTMLCanvasElement>('.logo-orb');
    const g = orb?.getContext('2d');
    if (orb && g) drawOrbIcon(g, orb.width);
    this.bindGameEvents();
    this.refreshMenu();
    this.show('menu');
    requestAnimationFrame(this.tick);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.game.state === 'playing') {
        this.game.pause();
        this.show('pause');
      }
    });
  }

  // ---------- building ----------

  private build(): void {
    this.root.innerHTML = `
      <section class="screen menu" data-screen="menu">
        <h1 class="logo" aria-label="Gravitor"><span>GRAVIT</span><canvas class="logo-orb" width="240" height="240" aria-hidden="true"></canvas><span>R</span></h1>
        <div class="tagline">Tilt Your World. Defy Gravity.</div>
        <div class="menu-buttons">
          <button class="btn primary" data-action="play"><b>PLAY</b><small data-bind="play-sub"></small></button>
          <button class="btn" data-action="levels">LEVELS</button>
          <button class="btn" data-action="howto">HOW TO PLAY</button>
          <button class="btn" data-action="settings">SETTINGS</button>
        </div>
        <div class="menu-foot">A CNMBUCK STUDIOS GAME · ${__APP_BUILD__ ? `v${__APP_VERSION__} (${__APP_BUILD__})` : `v${__APP_VERSION__}`} · ${this.worlds.length} worlds · ${this.campaign.length} levels</div>
      </section>

      <section class="screen panel-screen" data-screen="levels">
        <div class="panel levels-panel">
          <h2 data-bind="levels-title">WORLDS</h2>
          <div class="level-list" data-bind-html="level-list"></div>
          <div class="extras-block">
            <div class="section-label">TEST COURSES</div>
            <div class="level-list extras">
              ${this.extras.map((l, i) => `<button class="level-row" data-level="${this.campaign.length + i}"><span class="lv-num">·</span><span class="lv-name">${l.name}<small>${l.subtitle}</small></span></button>`).join('')}
            </div>
          </div>
          <button class="btn" data-action="levels-back">BACK</button>
        </div>
      </section>

      <section class="screen panel-screen" data-screen="paywall">
        <div class="panel paywall">
          <div class="pw-kicker" data-bind="pw-kicker"></div>
          <h2 data-bind="pw-title"></h2>
          <div class="pw-worlds" data-bind-html="pw-worlds"></div>
          <button class="btn primary" data-action="buy-pack" data-bind-show="pw-pack"><b data-bind="pw-pack-name"></b><small data-bind="pw-pack-sub"></small></button>
          <button class="btn pw-best" data-action="buy-bundle" data-bind-show="pw-bundle"><span class="pw-badge">BEST VALUE</span><b>ALL WORLDS 12-20</b><small data-bind="pw-bundle-sub"></small></button>
          <div class="note pw-note" data-bind="pw-note"></div>
          <button class="btn btn-small" data-action="restore">RESTORE PURCHASES</button>
          <button class="btn link-btn" data-action="paywall-back">NOT NOW</button>
        </div>
      </section>

      <section class="screen panel-screen" data-screen="howto">
        <div class="panel howto">
          <h2>HOW TO PLAY</h2>
          <div class="howto-card"><div class="hi hi-tilt"><span class="phone"></span></div><div><b>Tilt to roll</b><p>Hold your phone however is comfortable. Tilt it and the sphere rolls downhill, building momentum. Small tilts give small pushes; level the phone and it slows to a stop.</p></div></div>
          <div class="howto-card"><div class="hi">◎</div><div><b>Calibrate anytime</b><p>Changed how you're holding the phone? Tap ◎ and hold still for a moment. That position becomes "level".</p></div></div>
          <div class="howto-card"><div class="hi hi-goal"></div><div><b>Reach the portal</b><p>Find your way through the maze to the glowing ring. Fewer falls and a faster time earn more stars.</p></div></div>
          <div class="howto-card"><div class="hi hi-hazard"></div><div><b>Watch for hazards</b><p>Red edges mark holes and drops. Red striped floor destroys the sphere. Amber pistons slide back and forth; time your run past them.</p></div></div>
          <div class="howto-card"><div class="hi hi-check"></div><div><b>Checkpoints</b><p>Roll over a green ring to save your progress. After a fall you restart from the last one.</p></div></div>
          <div class="howto-card"><div class="hi hi-grav">▶</div><div><b>Gravity zones</b><p>On purple floor, a shift button appears. Tap it and gravity turns 90°: the wall beside you becomes the floor. Shifts are optional shortcuts, so use them when you're ready.</p></div></div>
          <div class="howto-card"><div class="hi hi-grav">⇅</div><div><b>Flips</b><p>Under a glass ceiling, the ⇅ button flips gravity upside down. Roll across the ceiling, then flip back down.</p></div></div>
          <div class="howto-card"><div class="hi">▦</div><div><b>Later worlds</b><p>Cracked orange tiles crumble after you touch them. Green chevrons boost you, blue ones carry you, pale floor is ice. Yellow switches open yellow doors. Red lasers blink: go when they're off. Pink rings launch you, and teal zones lower gravity. Cyan platforms ferry you over gaps (they wait at each end), amber arms sweep the floor and discs turn under you.</p></div></div>
          <div class="howto-card"><div class="hi">◎</div><div><b>Worlds 11 to 20</b><p>Teal-edged holes drop you to the floor below. Coloured rings on the floor are warp gates: roll in and come out of the matching ring (red ones send you back). Gold keys unlock the goal. Fans blow you toward the edge while they spin, and floors with a red outline turn into energy for a moment, so cross while they're dark.</p></div></div>
          <div class="howto-card"><div class="hi">✋</div><div><b>Prefer touch?</b><p>Settings → Controls → TOUCH. Drag anywhere on the screen to steer with a virtual joystick.</p></div></div>
          <button class="btn primary" data-action="menu">GOT IT</button>
        </div>
      </section>

      <section class="hud" data-screen="hud">
        <div class="hud-top">
          <div class="hud-stats" aria-label="Run stats">
            <span class="stat" title="Time"><i class="ico">◷</i><b data-bind="time">0.0</b></span>
            <span class="stat" title="Falls"><i class="ico">↓</i><b data-bind="falls">0</b></span>
            <span class="stat keys-stat" title="Keys"><i class="ico">⚿</i><b data-bind="keys">0/0</b></span>
            <span class="stat shifts-stat" title="Gravity shifts"><i class="ico">⟲</i><b data-bind="shifts">0</b></span>
            <span class="gravity-ind" title="Gravity"><i class="g-arrow">▼</i><b data-bind="surface-short">F</b></span>
          </div>
          <div class="hud-buttons">
            <button class="icon-btn" data-action="pause" aria-label="Pause">❚❚</button>
            <button class="icon-btn" data-action="calibrate" aria-label="Calibrate">◎</button>
            <button class="icon-btn" data-action="reset" aria-label="Reset">↺</button>
          </div>
        </div>
        <button class="skip-btn" data-action="skip-level" aria-label="Skip this level">SKIP LEVEL <span data-bind="skip-note">▶ AD</span></button>
        <div class="shift-pad">
          <button class="shift-btn" data-shift="left" aria-label="Shift gravity left">◀</button>
          <button class="shift-btn" data-shift="forward" aria-label="Shift gravity forward">▲</button>
          <button class="shift-btn" data-shift="right" aria-label="Shift gravity right">▶</button>
          <button class="shift-btn" data-shift="flip" aria-label="Flip gravity">⇅</button>
          <div class="shift-label">SHIFT GRAVITY</div>
        </div>
        <div class="shift-flash"></div>
        <div class="flyover-skip">TAP TO SKIP PREVIEW</div>
      </section>

      <section class="screen panel-screen" data-screen="pause">
        <div class="panel">
          <h2>PAUSED</h2>
          <button class="btn primary" data-action="resume">RESUME</button>
          <button class="btn" data-action="restart">RESTART LEVEL</button>
          <button class="btn" data-action="settings">SETTINGS</button>
          <button class="btn" data-action="menu">MAIN MENU</button>
        </div>
      </section>

      <section class="screen panel-screen" data-screen="complete">
        <div class="panel">
          <h2>LEVEL COMPLETE</h2>
          <div class="stars" data-bind="stars"></div>
          <div class="result-grid">
            <small>TIME</small><b data-bind="r-time"></b>
            <small>FALLS</small><b data-bind="r-falls"></b>
            <small>SHIFTS</small><b data-bind="r-shifts"></b>
            <small>BEST</small><b data-bind="r-best"></b>
          </div>
          <button class="btn primary" data-action="next" data-bind-show="has-next">NEXT LEVEL</button>
          <button class="btn" data-action="restart">RETRY</button>
          <button class="btn" data-action="menu">MAIN MENU</button>
          <button class="btn link-btn" data-action="remove-ads" data-bind-show="can-buy">REMOVE ADS · UNLOCK THE ORB</button>
        </div>
      </section>

      <section class="screen panel-screen" data-screen="settings">
        <div class="panel settings">
          <h2>SETTINGS</h2>
          <div class="row">Controls
            <span class="seg" data-setting="controlMode">
              <button data-value="tilt">TILT</button><button data-value="touch">TOUCH</button>
            </span>
          </div>
          <label class="row col">Tilt sensitivity <output data-out="tiltSensitivity"></output>
            <input type="range" min="0.5" max="2" step="0.05" data-setting="tiltSensitivity" />
          </label>
          <label class="row col">Dead zone <output data-out="deadZoneDeg"></output>
            <input type="range" min="0" max="6" step="0.25" data-setting="deadZoneDeg" />
          </label>
          <label class="row col">Smoothing <output data-out="smoothing"></output>
            <input type="range" min="0" max="0.15" step="0.005" data-setting="smoothing" />
          </label>
          <button class="btn btn-small" data-action="reset-tilt">RESET TILT TO DEFAULTS</button>
          <button class="btn" data-action="calibrate">CALIBRATE NOW</button>
          <div class="row">Graphics
            <span class="seg" data-setting="graphics"><button data-value="high">HIGH</button><button data-value="low">LOW</button></span>
          </div>
          <label class="row">Sound effects <input type="checkbox" data-setting="sfx" /></label>
          <label class="row">Music <input type="checkbox" data-setting="music" /></label>
          <label class="row">Vibration <input type="checkbox" data-setting="haptics" /></label>
          <label class="row">Course preview <input type="checkbox" data-setting="preview" /></label>
          <div class="row">Ball
            <span class="seg" data-setting="ball"><button data-value="chrome">CHROME</button><button data-value="orb" class="orb-choice">CNMBUCK ORB</button></span>
          </div>
          <div class="note" data-bind="orb-note"></div>
          <div class="store" data-bind-show="store">
            <button class="btn" data-action="remove-ads" data-bind-show="can-buy"><b>REMOVE ADS</b><small data-bind="ads-price">One-time purchase · also unlocks the Cnmbuck Orb</small></button>
            <div class="note" data-bind="ads-note"></div>
            <button class="btn" data-action="restore">RESTORE PURCHASES</button>
            <button class="btn btn-small" data-action="test-ad" data-bind-show="store-debug">SHOW A TEST AD NOW</button>
            <div class="note" data-bind="store-debug" data-bind-show="store-debug"></div>
          </div>
          <div class="row" data-testing>Physics
            <span class="seg" data-setting="physics"><button data-value="refined">REFINED</button><button data-value="classic">CLASSIC</button></span>
          </div>
          <label class="row" data-testing>Debug readout <input type="checkbox" data-setting="showDebug" /></label>
          <label class="row" data-testing>Unlock all levels (testing) <input type="checkbox" data-setting="unlockAll" /></label>
          <div class="note" data-testing>Physics: REFINED is the new tuning; CLASSIC is the previous build, kept for comparison. Music arrives later; its toggle is saved now.</div>
          <button class="btn primary" data-action="close-settings">DONE</button>
        </div>
      </section>

      <div class="toast"></div>
      <pre class="debug"></pre>
    `;

    this.root.querySelectorAll<HTMLElement>('[data-screen]').forEach((el) => (this.screens[el.dataset.screen!] = el));
    this.hud = this.screens.hud;
    this.toastEl = this.root.querySelector('.toast')!;
    this.debugEl = this.root.querySelector('.debug')!;
    this.shiftFlash = this.root.querySelector('.shift-flash')!;
    this.shiftPad = this.root.querySelector('.shift-pad')!;

    // iOS only allows audio to start from a user gesture. Any tap also skips the preview.
    window.addEventListener('pointerdown', () => {
      this.game.audio.unlock();
      this.game.skipPreview();
    }, { capture: true });
    this.root.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!t) return;
      if (t.dataset.level) this.startLevel(Number(t.dataset.level));
      else if (t.dataset.paywall) this.openPaywall(Number(t.dataset.paywall), -1, 'levels');
      else if (t.dataset.world) {
        this.openWorld = Number(t.dataset.world);
        this.refreshMenu();
      }
      else if (t.dataset.action) this.action(t.dataset.action);
    });
    // Shift buttons react on pointerdown for zero added latency.
    this.root.querySelectorAll<HTMLButtonElement>('[data-shift]').forEach((b) =>
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.shift(b.dataset.shift as ShiftDirection, b);
      }),
    );
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.key === 'q') this.shift('left');
      else if (e.key === 'e') this.shift('right');
      else if (e.key === 'r') this.shift('forward');
      else if (e.key === 'f') this.shift('flip');
      else if (e.key === 'c') this.action('calibrate');
    });

    // App Store build: drop the testing-only settings rows entirely.
    if (__RELEASE__) this.root.querySelectorAll('[data-testing]').forEach((el) => el.remove());
    this.bindSettings();
  }

  private bindSettings(): void {
    const panel = this.screens.settings;
    panel.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((input) => {
      input.addEventListener('input', () => this.settings.update({ [input.dataset.setting!]: Number(input.value) }));
      dragRange(input);
    });
    panel.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach((input) => {
      input.addEventListener('change', () => this.settings.update({ [input.dataset.setting!]: input.checked }));
    });
    panel.querySelectorAll<HTMLElement>('.seg').forEach((seg) => {
      seg.addEventListener('click', async (e) => {
        const b = (e.target as HTMLElement).closest('button');
        if (!b) return;
        e.preventDefault();
        const key = seg.dataset.setting!;
        const value = b.dataset.value!;
        if (key === 'ball' && value === 'orb' && !orbAvailable(this.settings.get())) {
          this.toast(`Finish ${ORB_LEVELS} levels to win the Cnmbuck Orb`, 2200);
          return;
        }
        if (key === 'controlMode' && value === 'tilt' && this.game.input.permission !== 'granted') {
          const ok = await this.ensureTilt();
          if (!ok) return;
          await this.calibrate();
        }
        this.settings.update({ [key]: value });
      });
    });
    this.settings.onChange(() => this.syncSettings());
    this.syncSettings();
  }

  private syncSettings(): void {
    const s = this.settings.get() as unknown as Record<string, unknown>;
    const panel = this.screens.settings;
    panel.querySelectorAll<HTMLInputElement>('input').forEach((i) => {
      const v = s[i.dataset.setting!];
      if (i.type === 'checkbox') i.checked = Boolean(v);
      else i.value = String(v);
    });
    panel.querySelectorAll<HTMLElement>('.seg').forEach((seg) =>
      seg.querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('on', s[seg.dataset.setting!] === b.dataset.value)),
    );
    const fmt: Record<string, (v: number) => string> = {
      tiltSensitivity: (v) => `${v.toFixed(2)}×`,
      deadZoneDeg: (v) => `${v.toFixed(2)}°`,
      smoothing: (v) => `${Math.round(v * 1000)} ms`,
    };
    panel.querySelectorAll<HTMLOutputElement>('output').forEach((o) => (o.textContent = fmt[o.dataset.out!](s[o.dataset.out!] as number)));
    const orbWon = orbAvailable(this.settings.get());
    panel.querySelector('.orb-choice')?.classList.toggle('locked', !orbWon);
    this.bind('orb-note', orbWon
      ? 'The Cnmbuck Orb: Cnmbuck Studios\' signature ball, in every Cnmbuck Studios game.'
      : `🔒 Cnmbuck Orb: finish ${ORB_LEVELS} levels to win Cnmbuck Studios' signature ball.`);
    this.syncStore();
    this.debugEl.style.display = this.settings.get().showDebug ? 'block' : 'none';
    this.hud.classList.toggle('touch-mode', this.settings.get().controlMode === 'touch');
  }

  private bindGameEvents(): void {
    this.game.events = {
      onShift: (dir, surface) => {
        this.flashShift(dir);
        this.toast(`GRAVITY → ${surface}`);
      },
      onShiftRejected: (reason) => this.toast(reason),
      onFall: () => {
        this.levelFalls++;
        this.analytics.levelFail(this.game.stats.time);
        const offer = this.levelFalls === SKIP_AFTER_FALLS && this.canSkip();
        this.toast(offer ? 'STUCK? YOU CAN SKIP THIS LEVEL' : 'FELL INTO THE VOID', offer ? 2400 : 1600);
        this.syncSkip();
      },
      onCheckpoint: () => this.toast('CHECKPOINT'),
      onSwitch: () => this.toast(`SWITCH · DOOR OPEN FOR ${Math.round(this.game.features.doorTimeLeft())} SECONDS`),
      onKey: (left, total) => this.toast(left ? `KEY ${total - left} OF ${total}` : 'ALL KEYS · THE GOAL IS OPEN', 1600),
      onGoalLocked: (left) => this.toast(`LOCKED · FIND ${left} MORE KEY${left === 1 ? '' : 'S'}`, 2000),
      onWarp: (decoy) => this.toast(decoy ? 'DECOY GATE · BACK YOU GO' : 'WARP', decoy ? 1600 : 700),
      onZoneEnter: (zone) => this.toast(zone.hint, 2400),
      onPreviewEnd: () => {
        this.hud.classList.remove('flyover');
        this.previewDone?.();
        this.previewDone = null;
      },
      onComplete: (stats, stars, record, newBest) => this.showComplete(stats, stars, record, newBest),
    };
  }

  // ---------- flow ----------

  private async startLevel(index: number): Promise<void> {
    // A level in a world pack the player doesn't own opens the paywall instead (Play, Next Level
    // into World 12, a skip from 11-10, ...). Buying it starts this level.
    if (this.paidLocked(index)) {
      this.openPaywall(this.worldOf(index), index, 'menu');
      return;
    }
    // Must run synchronously inside the tap so iOS will show the motion permission prompt.
    const permission = this.settings.get().controlMode === 'tilt' ? this.ensureTilt() : Promise.resolve(true);
    const def = this.levels[index];
    this.current = index;
    this.levelFalls = 0;
    this.syncSkip();
    this.game.loadLevel(def);
    this.analytics.levelStart(this.levelInfo(index));
    this.hud.classList.toggle('no-shifts', !def.allowShifts);
    this.show('hud');
    const previewing = this.game.startPreview(this.settings.get().preview);
    this.hud.classList.toggle('flyover', previewing);
    this.toast(index < this.campaign.length ? `${this.levelLabel(index)} · ${def.name.toUpperCase()}` : def.name.toUpperCase(), previewing ? 3000 : 1600);
    const tiltOk = await permission;
    // Calibrate after the preview, once the player has settled into a grip.
    if (previewing) await new Promise<void>((r) => (this.previewDone = r));
    if (tiltOk) await this.calibrate();
  }

  /** Requests motion permission; falls back to touch controls when unavailable. */
  private async ensureTilt(): Promise<boolean> {
    const input = this.game.input;
    if (input.permission === 'granted') return true;
    const result = await input.enableTilt();
    if (result === 'granted') return true;
    this.settings.update({ controlMode: 'touch' });
    this.toast(result === 'denied' ? 'Motion access denied · using touch joystick' : 'No motion sensors · using touch joystick', 3500);
    return false;
  }

  private async calibrate(): Promise<void> {
    const input = this.game.input;
    if (input.permission !== 'granted') {
      this.toast(this.settings.get().controlMode === 'touch' ? 'Touch mode needs no calibration' : 'Tilt unavailable');
      return;
    }
    this.toast('HOLD STEADY…', 2000);
    const result = await input.calibration.calibrate(300);
    this.toast(result === 'ok' ? '✓ CALIBRATED' : result === 'unsteady' ? 'CALIBRATED · phone was moving, tap ◎ to redo' : 'Calibration failed · try again', result === 'ok' ? 1400 : 2600);
  }

  private action(a: string): void {
    switch (a) {
      case 'settings':
        this.settingsReturn = this.game.state === 'menu' ? 'menu' : 'game';
        this.game.pause();
        this.syncStore();
        this.show('settings');
        break;
      case 'close-settings':
        if (this.settingsReturn === 'menu') this.show('menu');
        else this.show('pause');
        break;
      case 'pause':
        this.game.pause();
        this.show('pause');
        break;
      case 'resume':
        this.game.resume();
        this.show('hud');
        break;
      case 'restart':
        this.analytics.levelQuit('restart', this.game.stats.time);
        this.game.restart();
        this.analytics.levelStart(this.levelInfo(this.current));
        this.show('hud');
        break;
      case 'reset':
        this.game.respawn();
        this.toast('RESET');
        break;
      case 'calibrate':
        void this.calibrate();
        break;
      case 'reset-tilt': {
        const { tiltSensitivity, deadZoneDeg, smoothing } = DEFAULT_SETTINGS;
        this.settings.update({ tiltSensitivity, deadZoneDeg, smoothing });
        this.toast('Tilt settings reset', 1400);
        break;
      }
      case 'menu':
        this.analytics.levelQuit('menu', this.game.stats.time);
        this.game.toMenu();
        this.refreshMenu();
        this.show('menu');
        break;
      case 'play':
        void this.startLevel(this.nextUnplayed());
        break;
      case 'levels':
        // Open on the world being played, so the list starts where the player is.
        this.openWorld = this.worldOf(this.current < this.campaign.length ? this.current : this.nextUnplayed());
        this.refreshMenu();
        this.show('levels');
        break;
      case 'levels-back':
        if (this.openWorld >= 0) {
          this.openWorld = -1;
          this.refreshMenu();
        } else this.show('menu');
        break;
      case 'howto':
        this.show('howto');
        break;
      case 'skip-level':
        void this.skipLevel();
        break;
      case 'next': {
        // A due ad shows here, between the result and the next level, never during play.
        // The target is fixed at the first tap and later taps are ignored until it starts:
        // a double tap (the result screen stays tappable while it fades) used to run this
        // twice and jump two levels ahead, leaving the level in between unplayed.
        if (this.advancing || this.game.state !== 'complete') break;
        this.advancing = true;
        const next = this.current + 1;
        void this.money.maybeShowAd().finally(() => {
          this.advancing = false;
          void this.startLevel(next);
        });
        break;
      }
      case 'remove-ads':
        void this.money.buyRemoveAds().then(({ owned, error }) => {
          if (owned) this.toast('✓ Ads removed · the Cnmbuck Orb is yours', 3000);
          else if (error) this.toast(error, 3200);
          this.syncStore();
        });
        break;
      case 'test-ad':
        void this.money.testAd().then((msg) => { this.toast(msg, 3200); this.syncStore(); });
        break;
      case 'restore':
        void this.money.restore().then((owned) => {
          this.toast(owned.length ? '✓ Purchases restored' : 'No purchases to restore', 2200);
          this.syncStore();
          this.afterPurchase();
        });
        break;
      case 'buy-pack': {
        const pack = packFor(this.worlds[this.paywallWorld]?.id ?? '');
        if (pack) void this.purchase(pack.productId);
        break;
      }
      case 'buy-bundle':
        void this.purchase(BUNDLE.productId);
        break;
      case 'paywall-back':
        this.paywallWorld = this.paywallLevel = -1;
        this.refreshMenu();
        this.show(this.paywallReturn);
        break;
    }
  }

  private shift(dir: ShiftDirection, btn?: HTMLElement): void {
    const ok = this.game.requestShift(dir);
    if (!ok && btn) {
      btn.classList.remove('denied');
      void btn.offsetWidth;
      btn.classList.add('denied');
    }
  }

  /**
   * Campaign level `i` is in a paid world the player hasn't bought. The testing switch
   * "Unlock all levels" opens paid worlds too (never on in App Store builds).
   */
  private paidLocked(i: number): boolean {
    if (i < 0 || i >= this.campaign.length || this.settings.get().unlockAll) return false;
    return !this.money.ownsWorld(this.worlds[this.worldOf(i)].id);
  }

  private unlocked(i: number): boolean {
    if (this.settings.get().unlockAll) return true;
    if (i === 0 || i >= this.campaign.length) return true;
    // A level already finished or skipped never shows as locked again.
    const own = this.campaign[i].id;
    if (this.game.recordFor(own).bestTime !== null || this.game.wasSkipped(own)) return true;
    const prev = this.campaign[i - 1].id;
    return this.game.recordFor(prev).bestTime !== null || this.game.wasSkipped(prev);
  }

  /** Campaign levels other than the very last can be skipped (an extras course has nothing after it). */
  private canSkip(): boolean {
    return this.current < this.campaign.length - 1;
  }

  private syncSkip(): void {
    this.hud.classList.toggle('can-skip', this.levelFalls >= SKIP_AFTER_FALLS && this.canSkip());
    this.bind('skip-note', this.money.native ? '▶ AD' : '');
  }

  /** Watch a rewarded ad (where ads run) and move on to the next level; the skipped one stays unplayed. */
  private async skipLevel(): Promise<void> {
    if (!this.canSkip() || this.skipping) return;
    this.skipping = true;
    this.game.pause();
    if (this.money.native) this.toast('LOADING AD…', 8000);
    const result = await this.money.rewardedSkip();
    this.skipping = false;
    if (result === 'cancelled' || result === 'unavailable') {
      this.game.resume();
      this.toast(result === 'cancelled' ? 'Watch the whole ad to skip' : 'No ad available right now · try again in a moment', 2400);
      return;
    }
    this.analytics.levelSkip(this.game.stats.time, this.levelFalls);
    this.game.markSkipped(this.campaign[this.current].id);
    this.toast('LEVEL SKIPPED', 1400);
    void this.startLevel(this.current + 1);
  }

  /** World index of campaign level `i`. */
  private worldOf(i: number): number {
    let n = 0;
    for (let w = 0; w < this.worlds.length; w++) {
      n += this.worlds[w].levels.length;
      if (i < n) return w;
    }
    return this.worlds.length - 1;
  }

  /** Campaign index of a world's first level. */
  private worldStart(w: number): number {
    return this.worlds.slice(0, w).reduce((n, x) => n + x.levels.length, 0);
  }

  /** "3-7": world 3, level 7. */
  /** Campaign level `i` as analytics reports it (null for test courses, which aren't tracked). */
  private levelInfo(i: number): LevelInfo | null {
    if (i >= this.campaign.length) return null;
    const l = this.campaign[i];
    return { id: l.id, name: l.name, world: this.worldOf(i) + 1, number: i + 1, label: this.levelLabel(i) };
  }

  private levelLabel(i: number): string {
    const w = this.worldOf(i);
    return `${w + 1}-${i - this.worldStart(w) + 1}`;
  }

  /** Where Play goes: the next unfinished level after the furthest one reached. */
  private nextUnplayed(): number {
    // Carry on after the furthest level reached (finished or skipped): a level skipped or left behind
    // earlier (11-10 in Chris's 1.1.0 playtest) must not pull Play back to it.
    const done = (i: number) => this.game.recordFor(this.campaign[i].id).bestTime !== null;
    const reached = (i: number) => done(i) || this.game.wasSkipped(this.campaign[i].id);
    let last = -1;
    for (let i = 0; i < this.campaign.length; i++) if (reached(i)) last = i;
    for (let i = last + 1; i < this.campaign.length; i++) if (!done(i)) return i;
    // Everything from there on is done: go back for anything left unfinished, else the last level.
    const i = this.campaign.findIndex((_, k) => !reached(k));
    return i === -1 ? this.campaign.length - 1 : i;
  }

  private refreshMenu(): void {
    const n = this.nextUnplayed();
    this.bind('play-sub', `Level ${this.levelLabel(n)} · ${this.campaign[n].name}${this.paidLocked(n) ? ' · 🔒' : ''}`);
    const list = this.root.querySelector<HTMLElement>('[data-bind-html="level-list"]')!;
    const extras = this.root.querySelector<HTMLElement>('.extras-block')!;
    extras.style.display = this.openWorld < 0 && this.extras.length ? '' : 'none';
    if (this.openWorld < 0) {
      this.bind('levels-title', 'WORLDS');
      list.innerHTML = this.worlds
        .map((w, wi) => {
          const start = this.worldStart(wi);
          const recs = w.levels.map((l) => this.game.recordFor(l.id));
          const stars = recs.reduce((a, r) => a + r.bestStars, 0);
          const done = recs.filter((r) => r.bestTime !== null).length;
          const pack = this.paidLocked(start) ? packFor(w.id) : null;
          if (pack) {
            // Not bought: the row opens the paywall, whether or not the player has got this far.
            return `<button class="level-row world-row pack-locked" data-paywall="${wi}" style="--accent:${w.theme.accent}">
              <span class="lv-num">${wi + 1}</span>
              <span class="lv-name">${w.name}<small>${w.idea}</small></span>
              <span class="lv-stats"><span class="lv-pack">🔒 ${this.money.priceOf(pack.productId)}</span><small>${pack.name.replace(' Pack', '')} pack</small></span>
            </button>`;
          }
          const open = this.unlocked(start);
          return `<button class="level-row world-row ${open ? '' : 'locked'}" ${open ? `data-world="${wi}"` : 'disabled'} style="--accent:${w.theme.accent}">
            <span class="lv-num">${wi + 1}</span>
            <span class="lv-name">${w.name}<small>${open ? w.idea : 'Finish world ' + wi + ' to unlock'}</small></span>
            <span class="lv-stats">${open ? `<span class="lv-stars">★ ${stars}/${w.levels.length * 3}</span><small>${done}/${w.levels.length} done</small>` : '🔒'}</span>
          </button>`;
        })
        .join('');
      return;
    }
    const w = this.worlds[this.openWorld];
    const start = this.worldStart(this.openWorld);
    this.bind('levels-title', `WORLD ${this.openWorld + 1} · ${w.name.toUpperCase()}`);
    list.innerHTML = w.levels
      .map((l, li) => {
        const i = start + li;
        const r = this.game.recordFor(l.id);
        const open = this.unlocked(i);
        const stars = '★'.repeat(r.bestStars) + '☆'.repeat(3 - r.bestStars);
        return `<button class="level-row ${open ? '' : 'locked'}" ${open ? `data-level="${i}"` : 'disabled'} style="--accent:${w.theme.accent}">
          <span class="lv-num">${this.levelLabel(i)}</span>
          <span class="lv-name">${l.name}<small>${open ? l.subtitle : 'Finish the level before to unlock'}</small></span>
          <span class="lv-stats">${open ? `<span class="lv-stars">${stars}</span><small>${r.bestTime !== null ? r.bestTime.toFixed(1) + 's' : this.game.wasSkipped(l.id) ? 'skipped' : '—'}</small>` : '🔒'}</span>
        </button>`;
      })
      .join('');
  }

  /** Store buttons exist only in the iPhone app; Remove Ads hides once bought. */
  private syncStore(): void {
    const show = (key: string, on: boolean) => this.root.querySelectorAll<HTMLElement>(`[data-bind-show="${key}"]`).forEach((el) => (el.style.display = on ? '' : 'none'));
    show('store', this.money.native);
    show('can-buy', this.money.native && !this.money.adFree);
    if (this.money.price) this.bind('ads-price', `${this.money.price} · one-time · also unlocks the Cnmbuck Orb`);
    const packs = this.worlds.filter((w) => packFor(w.id) && this.money.ownsWorld(w.id)).map((w) => this.worlds.indexOf(w) + 1);
    this.bind('ads-note', [
      this.money.adFree ? '✓ Ads between levels removed. Thank you for supporting Cnmbuck Studios. (Skip Level still plays a short ad.)' : '',
      packs.length ? `✓ Worlds ${packs.join(', ')} unlocked.` : '',
    ].filter(Boolean).join(' '));
    // With Debug readout on, Settings shows why ads/store are or aren't working, plus a test-ad button.
    show('store-debug', this.money.native && this.settings.get().showDebug);
    this.bind('store-debug', this.money.status());
  }

  /** Shows the paywall for world `w`'s pack. `level`: the level to start once bought (-1: open the world). */
  private openPaywall(w: number, level: number, back: 'levels' | 'menu'): void {
    const pack = packFor(this.worlds[w].id);
    if (!pack) return;
    if (this.game.state !== 'menu') {
      this.analytics.levelQuit('menu', this.game.stats.time);
      this.game.toMenu();
    }
    this.paywallWorld = w;
    this.paywallLevel = level;
    this.paywallReturn = back;
    this.syncPaywall();
    this.show('paywall');
  }

  private syncPaywall(): void {
    const w = this.paywallWorld;
    const pack = w >= 0 ? packFor(this.worlds[w].id) : null;
    if (!pack) return;
    const owned = this.money.owned;
    const packWorlds = this.worlds.filter((x) => pack.worlds.includes(x.id));
    const levels = (ids: readonly string[]) => this.worlds.filter((x) => ids.includes(x.id)).reduce((n, x) => n + x.levels.length, 0);
    const show = (key: string, on: boolean) => this.root.querySelectorAll<HTMLElement>(`[data-bind-show="${key}"]`).forEach((el) => (el.style.display = on ? '' : 'none'));
    this.bind('pw-kicker', `WORLD ${w + 1} · ${this.worlds[w].name.toUpperCase()}`);
    this.bind('pw-title', `UNLOCK ${pack.name.replace(' Pack', '').toUpperCase()}`);
    this.root.querySelector<HTMLElement>('[data-bind-html="pw-worlds"]')!.innerHTML = packWorlds
      .map((x) => {
        const wi = this.worlds.indexOf(x);
        return `<div class="pw-world ${wi === w ? 'here' : ''}" style="--accent:${x.theme.accent}"><span class="lv-num">${wi + 1}</span><span class="lv-name">${x.name}<small>${x.idea}</small></span></div>`;
      })
      .join('');
    this.bind('pw-pack-name', pack.name.toUpperCase());
    this.bind('pw-pack-sub', `${this.money.priceOf(pack.productId)} · ${levels(pack.worlds)} levels · one-time purchase`);
    show('pw-pack', !owned.includes(pack.productId));
    const bundle = bundleWorthOffering(owned);
    show('pw-bundle', bundle);
    this.bind('pw-bundle-sub', `${this.money.priceOf(BUNDLE.productId)} · all ${levels(BUNDLE.worlds)} levels${this.money.adFree ? '' : ' + Remove Ads'} · one-time`);
    this.bind('pw-note', this.money.native
      ? 'Retries are always free. Remove Ads (in the bundle) turns off the ads between levels; Skip Level still plays a short ad.'
      : 'World packs are bought in the iPhone app.');
    this.root.querySelectorAll<HTMLButtonElement>('[data-action="buy-pack"], [data-action="buy-bundle"]').forEach((b) => (b.disabled = this.buying));
  }

  private async purchase(productId: string): Promise<void> {
    if (this.buying) return;
    this.buying = true;
    this.syncPaywall();
    const { owned, error } = await this.money.buy(productId);
    this.buying = false;
    this.syncStore();
    if (owned) this.toast(productId === BUNDLE.productId ? '✓ Worlds 12-20 unlocked · ads removed' : '✓ Worlds unlocked · thank you!', 2600);
    else if (error) this.toast(error, 3200);
    this.syncPaywall();
    if (owned) this.afterPurchase();
  }

  /** Once the paywall's world is owned, carry on into it: the level that was waiting, else the world's level list. */
  private afterPurchase(): void {
    const w = this.paywallWorld;
    if (w < 0 || !this.screens.paywall.classList.contains('visible') || this.paidLocked(this.worldStart(w))) {
      this.refreshMenu();
      return;
    }
    const level = this.paywallLevel;
    this.paywallWorld = this.paywallLevel = -1;
    if (level >= 0) {
      void this.startLevel(level);
      return;
    }
    this.openWorld = w;
    this.refreshMenu();
    this.show('levels');
  }

  private showComplete(stats: RunStats, stars: number, record: LevelRecord, newBest: boolean): void {
    const hasNext = this.current + 1 < this.campaign.length;
    if (this.current < this.campaign.length) this.money.levelFinished(this.worldOf(this.current));
    this.analytics.levelEnd(stats, stars);
    this.analytics.setLevelsCleared(this.campaign.filter((l) => this.game.recordFor(l.id).bestTime !== null).length);
    this.syncStore();
    this.root.querySelectorAll<HTMLElement>('[data-bind-show="has-next"]').forEach((el) => (el.style.display = hasNext ? '' : 'none'));
    this.bind('stars', '★'.repeat(stars) + '☆'.repeat(3 - stars));
    this.bind('r-time', `${stats.time.toFixed(2)}s`);
    this.bind('r-falls', String(stats.falls));
    this.bind('r-shifts', String(stats.shifts));
    this.bind('r-best', `${record.bestTime?.toFixed(2)}s${newBest ? ' · NEW!' : ''}`);
    window.setTimeout(() => this.show('complete'), 900);
    // Finishing ORB_LEVELS levels wins the Cnmbuck Orb: put it straight on and say so, once
    if (!this.settings.get().orbWon && this.campaign.filter((l) => this.game.recordFor(l.id).bestTime !== null).length >= ORB_LEVELS) {
      this.settings.update({ orbWon: true, ball: 'orb' });
      window.setTimeout(() => this.toast('🏆 You won the Cnmbuck Orb! Change ball in Settings', 3600), 1200);
    }
  }

  // ---------- helpers ----------

  private show(name: string): void {
    for (const [k, el] of Object.entries(this.screens)) {
      const visible = k === name || (k === 'hud' && name !== 'menu' && this.game.state !== 'menu');
      el.classList.toggle('visible', visible);
    }
  }

  private bind(key: string, text: string): void {
    this.root.querySelectorAll(`[data-bind="${key}"]`).forEach((el) => (el.textContent = text));
  }

  private toast(text: string, ms = 1600): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('visible');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('visible'), ms);
  }

  private flashShift(dir: ShiftDirection): void {
    const f = this.shiftFlash;
    f.dataset.dir = dir;
    f.classList.remove('go');
    void f.offsetWidth;
    f.classList.add('go');
  }

  private tick = (): void => {
    requestAnimationFrame(this.tick);
    const g = this.game;
    if (g.state === 'playing' || g.state === 'paused' || g.state === 'preview') {
      this.bind('time', g.stats.time.toFixed(1));
      this.bind('falls', String(g.stats.falls));
      this.bind('shifts', String(g.stats.shifts));
      const total = g.features.keyCount;
      this.hud.classList.toggle('has-keys', total > 0);
      if (total) this.bind('keys', `${total - g.features.keysLeft}/${total}`);
      this.bind('surface-short', g.surfaceName[0]);
      // Only offer the shifts that are possible right now.
      const allowed = g.availableShifts();
      const key = allowed.join(',');
      if (key !== this.shiftKey) {
        this.shiftKey = key;
        this.shiftPad.classList.toggle('active', allowed.length > 0);
        this.shiftPad.querySelectorAll<HTMLElement>('[data-shift]').forEach((b) => b.classList.toggle('hidden', !allowed.includes(b.dataset.shift as ShiftDirection)));
      }
    }
    if (this.settings.get().showDebug) {
      const t = g.input.tilt;
      const v = g.input.current;
      this.debugEl.textContent =
        `fps ${g.fps.toFixed(0)}  sensor ${t.sampleRateHz.toFixed(0)}Hz  perm ${g.input.permission}\n` +
        `tilt x ${t.tiltDeg[0].toFixed(1)}°  y ${t.tiltDeg[1].toFixed(1)}°\n` +
        `input ${v[0].toFixed(2)}, ${v[1].toFixed(2)}  speed ${g.ball.speed.toFixed(1)}  ${g.ball.grounded ? 'grounded' : 'air'}`;
    }
  };
}

/**
 * Pointer-driven slider: touch anywhere on the track and drag to set the value. iOS web views only let
 * you drag a native range by its small thumb (and not at all when touchmove is cancelled), so the
 * sliders follow the finger directly instead. Fires the usual `input` event.
 */
function dragRange(input: HTMLInputElement): void {
  const setFrom = (clientX: number) => {
    const r = input.getBoundingClientRect();
    const min = Number(input.min || 0), max = Number(input.max || 100), step = Number(input.step || 1);
    const thumb = 14; // half the thumb width: the ends of the track map to min and max
    const t = Math.min(1, Math.max(0, (clientX - r.left - thumb) / Math.max(1, r.width - thumb * 2)));
    const v = Math.min(max, Math.max(min, Math.round((min + t * (max - min)) / step) * step));
    const text = String(Number(v.toFixed(6)));
    if (input.value === text) return;
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  input.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    input.setPointerCapture(e.pointerId);
    setFrom(e.clientX);
  });
  input.addEventListener('pointermove', (e) => {
    if (input.hasPointerCapture(e.pointerId)) setFrom(e.clientX);
  });
  const end = (e: PointerEvent) => { if (input.hasPointerCapture(e.pointerId)) input.releasePointerCapture(e.pointerId); };
  input.addEventListener('pointerup', end);
  input.addEventListener('pointercancel', end);
}
