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
const AD_UNIT_ID = '';
const TEST_AD_UNIT_ID = 'ca-app-pub-3940256099942544/4411468910';

/** Ad rules agreed in the ads plan. */
const EVERY_N_LEVELS = 3;
const NO_ADS_FIRST_MS = 5 * 60_000;
const MIN_GAP_MS = 3 * 60_000;

type AdMobApi = typeof import('@capacitor-community/admob').AdMob;
type PurchasesApi = typeof import('@capgo/native-purchases').NativePurchases;

export class Monetization {
  readonly native = Capacitor.isNativePlatform();
  private admob: AdMobApi | null = null;
  private store: PurchasesApi | null = null;
  private adReady = false;
  private sessionStart = Date.now();
  private lastAd = 0;
  private finishedSinceAd = 0;
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
    if (this.adFree) return;
    try {
      this.admob = (await import('@capacitor-community/admob')).AdMob;
      await this.admob.initialize({ initializeForTesting: !AD_UNIT_ID });
      void this.prepare();
    } catch (e) {
      console.warn('Ads unavailable', e);
      this.lastError = `Ads: ${errorText(e)}`;
    }
  }

  private async prepare(): Promise<void> {
    if (!this.admob || this.adReady || this.adFree) return;
    try {
      // npa: non-personalised ads only, so the app needs no tracking prompt.
      await this.admob.prepareInterstitial({ adId: AD_UNIT_ID || TEST_AD_UNIT_ID, isTesting: !AD_UNIT_ID, npa: true });
      this.adReady = true;
    } catch (e) {
      this.adReady = false;
      this.lastError = `Ad load: ${errorText(e)}`;
    }
  }

  /** Call once per level finished. `world` is 0-based; World 1 never shows ads. */
  levelFinished(world: number): void {
    if (world > 0) this.finishedSinceAd++;
  }

  /**
   * Called when the player leaves the level-complete screen for the next level. Shows an ad
   * if one is due and loaded; never throws and never blocks the game for long.
   */
  async maybeShowAd(): Promise<void> {
    if (!this.admob || this.adFree) return;
    const now = Date.now();
    if (this.finishedSinceAd < EVERY_N_LEVELS || now - this.sessionStart < NO_ADS_FIRST_MS || now - this.lastAd < MIN_GAP_MS) return;
    if (!this.adReady) {
      void this.prepare();
      return;
    }
    this.adReady = false;
    try {
      await this.admob.showInterstitial();
      this.lastAd = Date.now();
      this.finishedSinceAd = 0;
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
    const wait = Math.max(0, NO_ADS_FIRST_MS - (Date.now() - this.sessionStart));
    const gap = Math.max(0, MIN_GAP_MS - (Date.now() - this.lastAd));
    const store = this.store ? (this.productFound ? `store ok ${this.price ?? ''}` : 'store: product missing') : 'store: not started';
    const ads = this.adFree ? 'ads off (owned)' : `ads ${this.admob ? (this.adReady ? 'loaded' : 'loading') : 'not started'}, ${this.finishedSinceAd}/${EVERY_N_LEVELS} levels after World 1, wait ${Math.ceil(Math.max(wait, gap) / 1000)}s`;
    return `${store} · ${ads}${this.lastError ? ' · ' + this.lastError : ''}`;
  }

  /** Restore Purchases (required by Apple). Returns true when Remove Ads is owned. */
  async restore(): Promise<boolean> {
    if (!this.store) return false;
    try {
      await this.store.restorePurchases();
      await this.refreshEntitlement();
    } catch (e) {
      console.warn('Restore failed', e);
    }
    return this.adFree;
  }

  private async refreshEntitlement(): Promise<void> {
    if (!this.store) return;
    const { purchases } = await this.store.getPurchases();
    if (purchases.some((p) => p.productIdentifier === REMOVE_ADS_ID)) this.grant();
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
