import type { GameManager, LevelRecord, RunStats } from '../core/GameManager';
import type { SettingsManager } from '../settings/SettingsManager';
import type { LevelDef } from '../levels/LevelTypes';
import type { ShiftDirection } from '../game/GravityFrame';

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
  private settingsReturn: 'menu' | 'game' = 'menu';

  constructor(root: HTMLElement, private game: GameManager, private settings: SettingsManager, private levels: LevelDef[]) {
    this.root = root;
    this.build();
    this.bindGameEvents();
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
        <div class="logo"><span>GRAVITY</span><span class="accent">SHIFT</span></div>
        <div class="tagline">Tilt Your World. Defy Gravity.</div>
        <div class="menu-buttons">
          ${this.levels.map((l, i) => `<button class="btn ${i === 0 ? 'primary' : ''}" data-level="${i}"><b>${i === 0 ? 'PLAY' : l.name.toUpperCase()}</b><small>${l.subtitle}</small></button>`).join('')}
          <button class="btn" data-action="settings">SETTINGS</button>
        </div>
        <div class="menu-foot">v0.1 · Milestone 1 + gravity-shift prototype</div>
      </section>

      <section class="hud" data-screen="hud">
        <div class="hud-top">
          <div class="hud-stats">
            <div class="level-name" data-bind="level"></div>
            <div class="stat-row">
              <div class="stat"><small>TIME</small><b data-bind="time">0.0</b></div>
              <div class="stat"><small>FALLS</small><b data-bind="falls">0</b></div>
              <div class="stat shifts-stat"><small>SHIFTS</small><b data-bind="shifts">0</b></div>
            </div>
          </div>
          <div class="hud-buttons">
            <button class="icon-btn" data-action="pause" aria-label="Pause">❚❚</button>
            <button class="icon-btn" data-action="calibrate" aria-label="Calibrate">◎</button>
            <button class="icon-btn" data-action="reset" aria-label="Reset">↺</button>
          </div>
        </div>
        <div class="gravity-chip"><span class="g-arrow">▼</span> GRAVITY · <b data-bind="surface">FLOOR</b></div>
        <div class="shift-pad">
          <button class="shift-btn" data-shift="left" aria-label="Shift gravity left">◀</button>
          <button class="shift-btn" data-shift="forward" aria-label="Shift gravity forward">▲</button>
          <button class="shift-btn" data-shift="right" aria-label="Shift gravity right">▶</button>
          <div class="shift-label">SHIFT GRAVITY</div>
        </div>
        <div class="shift-flash"></div>
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
          <button class="btn primary" data-action="restart">RETRY</button>
          <button class="btn" data-action="menu">MAIN MENU</button>
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
          <button class="btn" data-action="calibrate">CALIBRATE NOW</button>
          <div class="row">Graphics
            <span class="seg" data-setting="graphics"><button data-value="high">HIGH</button><button data-value="low">LOW</button></span>
          </div>
          <label class="row">Sound effects <input type="checkbox" data-setting="sfx" /></label>
          <label class="row">Music <input type="checkbox" data-setting="music" /></label>
          <label class="row">Debug readout <input type="checkbox" data-setting="showDebug" /></label>
          <div class="note">Audio arrives in Milestone 3; these toggles are saved now.</div>
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

    this.root.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!t) return;
      if (t.dataset.level) this.startLevel(Number(t.dataset.level));
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
      else if (e.key === 'c') this.action('calibrate');
    });

    this.bindSettings();
  }

  private bindSettings(): void {
    const panel = this.screens.settings;
    panel.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((input) => {
      input.addEventListener('input', () => this.settings.update({ [input.dataset.setting!]: Number(input.value) }));
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
      onFall: () => this.toast('FELL INTO THE VOID'),
      onCheckpoint: () => this.toast('CHECKPOINT'),
      onComplete: (stats, stars, record, newBest) => this.showComplete(stats, stars, record, newBest),
    };
  }

  // ---------- flow ----------

  private async startLevel(index: number): Promise<void> {
    // Must run synchronously inside the tap so iOS will show the motion permission prompt.
    const permission = this.settings.get().controlMode === 'tilt' ? this.ensureTilt() : Promise.resolve(true);
    const def = this.levels[index];
    this.game.loadLevel(def);
    this.hud.classList.toggle('no-shifts', !def.allowShifts);
    this.bind('level', def.name.toUpperCase());
    this.show('hud');
    if (await permission) await this.calibrate();
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
    const ok = await input.calibration.calibrate(300);
    this.toast(ok ? '✓ CALIBRATED' : 'Calibration failed · try again');
  }

  private action(a: string): void {
    switch (a) {
      case 'settings':
        this.settingsReturn = this.game.state === 'menu' ? 'menu' : 'game';
        this.game.pause();
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
        this.game.restart();
        this.show('hud');
        break;
      case 'reset':
        this.game.respawn();
        this.toast('RESET');
        break;
      case 'calibrate':
        void this.calibrate();
        break;
      case 'menu':
        this.game.toMenu();
        this.show('menu');
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

  private showComplete(stats: RunStats, stars: number, record: LevelRecord, newBest: boolean): void {
    this.bind('stars', '★'.repeat(stars) + '☆'.repeat(3 - stars));
    this.bind('r-time', `${stats.time.toFixed(2)}s`);
    this.bind('r-falls', String(stats.falls));
    this.bind('r-shifts', String(stats.shifts));
    this.bind('r-best', `${record.bestTime?.toFixed(2)}s${newBest ? ' · NEW!' : ''}`);
    window.setTimeout(() => this.show('complete'), 900);
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
    if (g.state === 'playing' || g.state === 'paused') {
      this.bind('time', g.stats.time.toFixed(1));
      this.bind('falls', String(g.stats.falls));
      this.bind('shifts', String(g.stats.shifts));
      this.bind('surface', g.surfaceName);
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
