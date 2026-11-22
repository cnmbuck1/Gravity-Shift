import { Capacitor } from '@capacitor/core';
import type { SettingsManager } from '../settings/SettingsManager';
import { ALL_PRODUCT_IDS, BUNDLE, REMOVE_ADS_ID, WORLD_PACKS, adFreeOwned, worldOwned } from './packs';

export { REMOVE_ADS_ID } from './packs';

/**
 * Ads between levels and the one-time purchases (iPhone app only): Remove Ads, the world packs
 * and the all-worlds bundle (see packs.ts).
 *
 * On the web build (GitHub Pages, test links) everything here is a no-op: no ads, no store.
 * The native plugins are loaded lazily so the web bundle never touches them.
 */

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
  /** Localised price for each product the App Store returned, by product ID. */
  private prices: Record<string, string> = {};
  /** Whether the App Store returned the Remove Ads product (false: not set up in App Store Connect). */
  productFound = false;
  /** Last store/ads problem, shown in Settings when Debug readout is on. */
  lastError = '';

  constructor(private settings: SettingsManager) {}

  get adFree(): boolean {
    return this.settings.get().adFree;
  }

  /** Localised Remove Ads price, once the store answers. */
  get price(): string | null {
    return this.prices[REMOVE_ADS_ID] ?? null;
  }

  /** Products the player owns (cached; refreshed from the App Store at launch and on restore). */
  get owned(): readonly string[] {
    return this.settings.get().owned;
  }

  /** Whether this world is free or bought. Doesn't look at the testing "unlock all" switch. */
  ownsWorld(worldId: string): boolean {
    return worldOwned(worldId, this.owned);
  }

  /** The App Store's localised price for a product, or the planned US price until it answers. */
  priceOf(productId: string): string {
    const fallback = [...WORLD_PACKS, BUNDLE].find((p) => p.productId === productId)?.fallbackPrice ?? '';
    return this.prices[productId] ?? fallback;
  }

  /** Whether the App Store knows this product (false: not created in App Store Connect yet). */
  hasProduct(productId: string): boolean {
    return productId in this.prices;
  }

  async init(): Promise<void> {
    if (!this.native) return;
    try {
      this.store = (await import('@capgo/native-purchases')).NativePurchases;
      await this.refreshEntitlement();
      const { products } = await this.store.getProducts({ productIdentifiers: [...ALL_PRODUCT_IDS] });
      for (const p of products) this.prices[p.identifier] = p.priceString;
      this.productFound = REMOVE_ADS_ID in this.prices;
      const missing = ALL_PRODUCT_IDS.filter((id) => !(id in this.prices));
      if (missing.length) this.lastError = `App Store returned no product ${missing.join(', ')}`;
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

  /** Buy Remove Ads (see buy). */
  buyRemoveAds(): Promise<{ owned: boolean; error?: string }> {
    return this.buy(REMOVE_ADS_ID);
  }

  /**
   * Buy one of the products (Remove Ads, a world pack or the bundle). Resolves with `owned`
   * when the player now owns it, or with an `error` the player should see (a cancelled
   * purchase has neither).
   */
  async buy(productId: string): Promise<{ owned: boolean; error?: string }> {
    const has = () => this.owned.includes(productId);
    if (!this.store) return { owned: false, error: this.native ? 'The App Store isn\'t available right now.' : 'Purchases are only in the iPhone app.' };
    try {
      const { PURCHASE_TYPE } = await import('@capgo/native-purchases');
      const t = await this.store.purchaseProduct({ productIdentifier: productId, productType: PURCHASE_TYPE.INAPP, quantity: 1 });
      if (t?.productIdentifier === productId) this.grant([productId]);
      return { owned: has() };
    } catch (e) {
      const msg = errorText(e);
      console.warn('Purchase failed or cancelled', e);
      if (/cancel/i.test(msg)) return { owned: has() };
      this.lastError = `Purchase: ${msg}`;
      const notSetUp = /cannot find product|product not found/i.test(msg) || !this.hasProduct(productId);
      return { owned: false, error: notSetUp ? 'This isn\'t available from the App Store yet.' : `Purchase failed: ${msg}` };
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
    const found = ALL_PRODUCT_IDS.filter((id) => id in this.prices).length;
    const store = this.store ? `store ${found}/${ALL_PRODUCT_IDS.length} products, owned ${this.owned.length ? this.owned.map((id) => id.split('.').pop()).join('+') : 'none'}` : 'store: not started';
    const ads = (this.testAds ? 'TEST ads, ' : '') + (this.adFree ? 'interstitials off (owned)' : `ads ${this.admob ? (this.adReady ? 'loaded' : 'loading') : 'not started'}, ${this.finishedSinceAd}/${EVERY_N_LEVELS} levels`);
    return `${store} · ${ads}${this.lastError ? ' · ' + this.lastError : ''}`;
  }

  /** Restore Purchases (required by Apple). Returns the products owned afterwards. */
  async restore(): Promise<readonly string[]> {
    if (!this.store) return this.owned;
    try {
      await this.store.restorePurchases();
      await this.refreshEntitlement();
      void this.startAds();
    } catch (e) {
      console.warn('Restore failed', e);
    }
    return this.owned;
  }

  /**
   * The App Store is the source of truth for every purchase. The saved list is only a cache: a
   * TestFlight (sandbox) purchase stays in the saved settings when the App Store version is
   * installed over it, and would otherwise turn ads off or keep packs unlocked for good. If the
   * store can't be asked (throws), the cache is kept, so a player offline keeps what they bought.
   */
  private async refreshEntitlement(): Promise<void> {
    if (!this.store) return;
    const { purchases } = await this.store.getPurchases({ onlyCurrentEntitlements: true });
    const owned = ALL_PRODUCT_IDS.filter((id) => purchases.some((p) => p.productIdentifier === id));
    this.setOwned(owned);
  }

  /** Adds newly bought products to what's owned. */
  private grant(ids: readonly string[]): void {
    this.setOwned([...new Set([...this.owned, ...ids])]);
  }

  private setOwned(owned: string[]): void {
    const adFree = adFreeOwned(owned);
    const s = this.settings.get();
    if (adFree !== s.adFree || owned.join() !== s.owned.join()) this.settings.update({ owned, adFree });
    if (adFree) this.adReady = false;
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
