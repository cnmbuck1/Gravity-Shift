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
      this.price = products[0]?.priceString ?? null;
    } catch (e) {
      console.warn('Store unavailable', e);
    }
    if (this.adFree) return;
    try {
      this.admob = (await import('@capacitor-community/admob')).AdMob;
      await this.admob.initialize({ initializeForTesting: !AD_UNIT_ID });
      void this.prepare();
    } catch (e) {
      console.warn('Ads unavailable', e);
    }
  }

  private async prepare(): Promise<void> {
    if (!this.admob || this.adReady || this.adFree) return;
    try {
      // npa: non-personalised ads only, so the app needs no tracking prompt.
      await this.admob.prepareInterstitial({ adId: AD_UNIT_ID || TEST_AD_UNIT_ID, isTesting: !AD_UNIT_ID, npa: true });
      this.adReady = true;
    } catch {
      this.adReady = false;
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

  /** Buy Remove Ads. Returns true when the player now owns it. */
  async buyRemoveAds(): Promise<boolean> {
    if (!this.store) return false;
    try {
      const { PURCHASE_TYPE } = await import('@capgo/native-purchases');
      const t = await this.store.purchaseProduct({ productIdentifier: REMOVE_ADS_ID, productType: PURCHASE_TYPE.INAPP, quantity: 1 });
      if (t?.productIdentifier === REMOVE_ADS_ID) this.grant();
    } catch (e) {
      console.warn('Purchase failed or cancelled', e);
    }
    return this.adFree;
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
