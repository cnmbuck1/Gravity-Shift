import { describe, expect, it } from 'vitest';
import { ALL_PRODUCT_IDS, BUNDLE, REMOVE_ADS_ID, WORLD_PACKS, adFreeOwned, bundleWorthOffering, packFor, worldOwned } from '../src/monetization/packs';
import { WORLDS } from '../src/levels/worlds';

const [p1, p2, p3] = WORLD_PACKS.map((p) => p.productId);

describe('world packs', () => {
  it('sells Worlds 12-20 in three 3-world packs and keeps Worlds 1-11 free', () => {
    const paid = WORLDS.map((w, i) => [i + 1, packFor(w.id)?.productId ?? null] as const);
    expect(paid.filter(([, p]) => p === null).map(([n]) => n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(paid.filter(([, p]) => p === p1).map(([n]) => n)).toEqual([12, 13, 14]);
    expect(paid.filter(([, p]) => p === p2).map(([n]) => n)).toEqual([15, 16, 17]);
    expect(paid.filter(([, p]) => p === p3).map(([n]) => n)).toEqual([18, 19, 20]);
  });

  it('names only worlds that exist', () => {
    const ids = new Set(WORLDS.map((w) => w.id));
    for (const id of BUNDLE.worlds) expect(ids.has(id)).toBe(true);
  });

  it('unlocks a world with its pack or the bundle, and nothing else', () => {
    expect(worldOwned('w11', [])).toBe(true);
    expect(worldOwned('w12', [])).toBe(false);
    expect(worldOwned('w12', [REMOVE_ADS_ID])).toBe(false);
    expect(worldOwned('w12', [p2])).toBe(false);
    expect(worldOwned('w14', [p1])).toBe(true);
    expect(worldOwned('w20', [BUNDLE.productId])).toBe(true);
  });

  it('includes Remove Ads in the bundle only', () => {
    expect(adFreeOwned([p1, p2, p3])).toBe(false);
    expect(adFreeOwned([BUNDLE.productId])).toBe(true);
    expect(adFreeOwned([REMOVE_ADS_ID])).toBe(true);
  });

  it('stops offering the bundle once it or every pack is owned', () => {
    expect(bundleWorthOffering([])).toBe(true);
    expect(bundleWorthOffering([p1, p2])).toBe(true);
    expect(bundleWorthOffering([p1, p2, p3])).toBe(false);
    expect(bundleWorthOffering([BUNDLE.productId])).toBe(false);
  });

  it('uses unique product IDs under the app bundle ID', () => {
    expect(new Set(ALL_PRODUCT_IDS).size).toBe(ALL_PRODUCT_IDS.length);
    for (const id of ALL_PRODUCT_IDS) expect(id).toMatch(/^com\.cnmbuckstudios\.gravitor\.[a-z0-9]+$/);
  });
});
