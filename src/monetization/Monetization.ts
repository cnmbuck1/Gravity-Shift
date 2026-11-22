import { Capacitor } from '@capacitor/core';
import type { SettingsManager } from '../settings/SettingsManager';

/**
 * Ads between levels and the one-time Remove Ads purchase (iPhone app only).
 *
 * On the web build (GitHub Pages, test links) everything here is a no-op: no ads, no store.
 * The native plugins are loaded lazily so the web bundle never touches them.
 */

/** App Store Connect product for Remove Ads (non-consumable). */
export const REMOVE_ADS_ID = 'com.cnmbuckstudios.gravitor.removeads';

/**
 * AdMob interstitial unit. Until Chris's real unit is filled in, Google's public test unit is
 * used and ads are shown as test ads. The matching AdMob app ID lives in ios/App/App/Info.plist
 * (GADApplicationIdentifier) and must be swapped at the same time.
 */
const AD_UNIT_ID = 'ca-app-pub-8965676427575286/1317249734';
const TEST_AD_UNIT_ID = 'ca-app-pub-3940256099942544/4411468910';
/** AdMob rewarded unit for "watch an ad to skip this level". Empty: Google's public iOS test unit. */
const REWARDED_UNIT_ID = 'ca-app-pub-8965676427575286/7138928760';
const TEST_REWARDED_UNIT_ID = 'ca-app-pub-3940256099942544/1712485313';
/** How long to wait for a rewarded ad to load when the player asks to skip. */
const REWARDED_WAIT_MS = 8000;

/**
 * How a skip request ended: watched the ad, skipped for free (web build only),
 * closed the ad early, or no ad could be loaded (no skip: the player can try again or keep playing).
 */
export type SkipResult = 'rewarded' | 'free' | 'cancelled' | 'unavailable';

/** Ad rules agreed in the ads plan. */
/** Between-level ad every 3 finished levels, from World 1 on (Chris, 2026-11-19). No time caps. */
const EVERY_N_LEVELS = 3;
/** Saved so quitting the app doesn't reset the count. */
const COUNT_KEY = 'gravitor:levelsSinceAd';
/** After a failed ad load, try again after this long, doubling each time up to RETRY_MAX_MS. */
const RETRY_FIRST_MS = 20_000;
const RETRY_MAX_MS = 5 * 60_000;
/** When a between-level ad is due but still loading, wait this long for it before moving on. */
const DUE_WAIT_MS = 2500;

type AdMobApi = typeof import('@capacitor-community/admob').AdMob;
type PurchasesApi = typeof import('@capgo/native-purchases').NativePurchases;

export class Monetization {
  readonly native = Capacitor.isNativePlatform();
  private admob: AdMobApi | null = null;
  private store: PurchasesApi | null = null;
  private adReady = false;
  private rewardedReady = false;
  /** TestFlight or Xcode install: use Google's test ad units, which always fill. */
  private testAds = false;
  private finishedSinceAd = loadCount();
  /** Current back-off for each ad type's next reload, and its pending timer. */
  private retryMs = { interstitial: RETRY_FIRST_MS, rewarded: RETRY_FIRST_MS };
  private retryTimer: { interstitial?: ReturnType<typeof setTimeout>; rewarded?: ReturnType<typeof setTimeout> } = {};
  /** Localised price for the Remove Ads button, once the store answers. */
  price: string | null = null;
  /** Whether the App Store returned the Remove Ads product (false: not set up in App Store Connect). */
  productFound = false;
  /** Last store/ads problem, shown in Settings when Debug readout is on. */
  lastError = '';

  constructor(private settings: SettingsManager) {}

  get adFree(): boolean {
    return this.settings.get().adFree;
  }

  async init(): Promise<void> {
    if (!this.native) return;
    try {
      this.store = (await import('@capgo/native-purchases')).NativePurchases;
      await this.refreshEntitlement();
      const { products } = await this.store.getProducts({ productIdentifiers: [REMOVE_ADS_ID] });
      this.productFound = products.length > 0;
      this.price = products[0]?.priceString ?? null;
      if (!this.productFound) this.lastError = `App Store returned no product ${REMOVE_ADS_ID}`;
    } catch (e) {
      console.warn('Store unavailable', e);
      this.lastError = `Store: ${errorText(e)}`;
    }
    try {
      // TestFlight and Xcode installs are 'Sandbox'/'Xcode': show test ads there, real ads only to App Store players.
      const { appTransaction } = await this.store!.getAppTransaction();
      this.testAds = appTransaction.environment !== 'Production';
    } catch {
      /* iOS 15 or no answer: keep real ads */
    }
    // Ads start even with Remove Ads: it only removes the between-level ads, and Skip Level
    // always needs a rewarded ad.
    await this.startAds();
  }

  /** Starts the AdMob SDK and preloads both ads. Safe to call again after a failed start. */
  private async startAds(): Promise<void> {
    if (this.admob) return;
    try {
      const admob = (await import('@capacitor-community/admob')).AdMob;
      await admob.initialize({ initializeForTesting: this.testAds });
      this.admob = admob;
      void this.prepare();
      void this.prepareRewarded();
    } catch (e) {
      console.warn('Ads unavailable', e);
      this.lastError = `Ads: ${errorText(e)}`;
    }
  }

  private async prepare(): Promise<void> {
    if (!this.admob || this.adReady || this.adFree) return;
    try {
      // npa: non-personalised ads only, so the app needs no tracking prompt.
      await this.admob.prepareInterstitial({ adId: this.testAds ? TEST_AD_UNIT_ID : AD_UNIT_ID, isTesting: this.testAds, npa: true });
      this.adReady = true;
      this.retryMs.interstitial = RETRY_FIRST_MS;
    } catch (e) {
      this.adReady = false;
      this.lastError = `Ad load: ${errorText(e)}`;
      this.scheduleRetry('interstitial');
    }
  }

  private async prepareRewarded(): Promise<void> {
    if (!this.admob || this.rewardedReady) return;
    try {
      await this.admob.prepareRewardVideoAd({ adId: this.testAds ? TEST_REWARDED_UNIT_ID : REWARDED_UNIT_ID, isTesting: this.testAds, npa: true });
      this.rewardedReady = true;
      this.retryMs.rewarded = RETRY_FIRST_MS;
    } catch (e) {
      this.rewardedReady = false;
      this.lastError = `Rewarded load: ${errorText(e)}`;
      this.scheduleRetry('rewarded');
    }
  }

  /**
   * Reloads an ad that failed to load (usually "no fill") after a back-off of 20 s, 40 s, ...
   * up to 5 minutes, so one is ready as soon as AdMob has one instead of only on the next
   * level break or skip.
   */
  private scheduleRetry(kind: 'interstitial' | 'rewarded'): void {
    if (this.retryTimer[kind]) return;
    const wait = this.retryMs[kind];
    this.retryMs[kind] = Math.min(wait * 2, RETRY_MAX_MS);
    this.retryTimer[kind] = setTimeout(() => {
      this.retryTimer[kind] = undefined;
      void (kind === 'interstitial' ? this.prepare() : this.prepareRewarded());
    }, wait);
  }

  /**
   * "Watch an ad to skip this level". In the iPhone app the skip needs a fully watched rewarded
   * ad: closing it early cancels the skip, and when no ad loads within a few seconds there is no
   * skip ('unavailable'; the player can try again, and retries are always free).
   * This applies with Remove Ads too (Chris, 2026-11-19); only the web build skips without an ad.
   */
  async rewardedSkip(): Promise<SkipResult> {
    if (!this.native) return 'free';
    if (!this.admob) await this.startAds();
    if (!this.admob) return 'unavailable';
    if (!this.rewardedReady) {
      await Promise.race([this.prepareRewarded(), new Promise((r) => setTimeout(r, REWARDED_WAIT_MS))]);
      if (!this.rewardedReady) return 'unavailable';
    }
    this.rewardedReady = false;
    try {
      const reward = await this.admob.showRewardVideoAd();
      // A rewarded ad also counts as this break's ad, so no interstitial follows right after.
      this.finishedSinceAd = 0;
      saveCount(0);
      return reward ? 'rewarded' : 'cancelled';
    } catch {
      return 'cancelled';
    } finally {
      void this.prepareRewarded();
    }
  }

  /** Call once per level finished (every world counts). */
  levelFinished(_world: number): void {
    this.finishedSinceAd++;
    saveCount(this.finishedSinceAd);
  }

  /**
   * Called when the player leaves the level-complete screen for the next level. Shows an ad
   * if one is due and loaded; never throws and never blocks the game for long.
   */
  async maybeShowAd(): Promise<void> {
    if (!this.admob) void this.startAds();
    if (!this.admob || this.adFree) return;
    if (this.finishedSinceAd < EVERY_N_LEVELS) return;
    if (!this.adReady) {
      // Due but not loaded yet: give it a moment, then move on (it shows at the next level instead).
      await Promise.race([this.prepare(), new Promise((r) => setTimeout(r, DUE_WAIT_MS))]);
      if (!this.adReady) return;
    }
    this.adReady = false;
    try {
      await this.admob.showInterstitial();
      this.finishedSinceAd = 0;
      saveCount(0);
    } catch {
      /* failed to show: skip silently */
    }
    void this.prepare();
  }

  /**
   * Buy Remove Ads. Resolves with `owned` when the player now owns it, or with an `error` the
   * player should see (a cancelled purchase has neither).
   */
  async buyRemoveAds(): Promise<{ owned: boolean; error?: string }> {
    if (!this.store) return { owned: false, error: 'The App Store isn\'t available right now.' };
    try {
      const { PURCHASE_TYPE } = await import('@capgo/native-purchases');
      const t = await this.store.purchaseProduct({ productIdentifier: REMOVE_ADS_ID, productType: PURCHASE_TYPE.INAPP, quantity: 1 });
      if (t?.productIdentifier === REMOVE_ADS_ID) this.grant();
      return { owned: this.adFree };
    } catch (e) {
      const msg = errorText(e);
      console.warn('Purchase failed or cancelled', e);
      if (/cancel/i.test(msg)) return { owned: this.adFree };
      this.lastError = `Purchase: ${msg}`;
      const notSetUp = /cannot find product|product not found/i.test(msg) || !this.productFound;
      return { owned: false, error: notSetUp ? 'Remove Ads isn\'t available from the App Store yet.' : `Purchase failed: ${msg}` };
    }
  }

  /** Testing aid: show an interstitial now, ignoring the pacing rules. Returns what happened. */
  async testAd(): Promise<string> {
    if (!this.native) return 'Ads only run in the iPhone app.';
    if (this.adFree) return 'Ads are off: Remove Ads is owned.';
    if (!this.admob) return `Ads SDK not started. ${this.lastError}`.trim();
    if (!this.adReady) {
      await this.prepare();
      if (!this.adReady) return `No ad loaded. ${this.lastError}`.trim();
    }
    this.adReady = false;
    try {
      await this.admob.showInterstitial();
      void this.prepare();
      return 'Test ad shown.';
    } catch (e) {
      void this.prepare();
      return `Ad failed to show: ${errorText(e)}`;
    }
  }

  /** One line for the debug readout: why the next ad will or won't show. */
  status(): string {
    if (!this.native) return 'web build: no ads or store';
    const store = this.store ? (this.productFound ? `store ok ${this.price ?? ''}` : 'store: product missing') : 'store: not started';
    const ads = (this.testAds ? 'TEST ads, ' : '') + (this.adFree ? 'interstitials off (owned)' : `ads ${this.admob ? (this.adReady ? 'loaded' : 'loading') : 'not started'}, ${this.finishedSinceAd}/${EVERY_N_LEVELS} levels`);
    return `${store} · ${ads}${this.lastError ? ' · ' + this.lastError : ''}`;
  }

  /** Restore Purchases (required by Apple). Returns true when Remove Ads is owned. */
  async restore(): Promise<boolean> {
    if (!this.store) return false;
    try {
      await this.store.restorePurchases();
      await this.refreshEntitlement();
      void this.startAds();
    } catch (e) {
      console.warn('Restore failed', e);
    }
    return this.adFree;
  }

  /**
   * The App Store is the source of truth for Remove Ads. The saved flag is only a cache: a
   * TestFlight (sandbox) purchase stays in the saved settings when the App Store version is
   * installed over it, and would otherwise turn ads off for good. If the store can't be asked
   * (throws), the cached flag is kept.
   */
  private async refreshEntitlement(): Promise<void> {
    if (!this.store) return;
    const { purchases } = await this.store.getPurchases({ onlyCurrentEntitlements: true });
    if (purchases.some((p) => p.productIdentifier === REMOVE_ADS_ID)) this.grant();
    else if (this.settings.get().adFree) this.settings.update({ adFree: false });
  }

  private grant(): void {
    if (!this.settings.get().adFree) this.settings.update({ adFree: true });
    this.adReady = false;
  }
}

function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

function loadCount(): number {
  try {
    return Number(localStorage.getItem(COUNT_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveCount(n: number): void {
  try {
    localStorage.setItem(COUNT_KEY, String(n));
  } catch {
    /* storage blocked: the count just restarts next launch */
  }
}
