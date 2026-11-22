/**
 * Paid world packs (Chris, 2026-11-22). Worlds 1-11 are free. Worlds 12-20 are sold as three
 * non-consumable 3-world packs, plus a best-value bundle of all of them that also includes
 * Remove Ads. Ads keep running in every world for players who haven't bought Remove Ads, and
 * Skip Level always needs a rewarded ad, whatever the player owns.
 *
 * Packs name their worlds by world id (src/levels/worlds.ts), so reordering worlds can't move a
 * world in or out of a pack by accident. Every product here must exist in App Store Connect as a
 * Non-Consumable with exactly this product ID (see the PR description for names and prices).
 */

/** App Store Connect product for Remove Ads (non-consumable). */
export const REMOVE_ADS_ID = 'com.cnmbuckstudios.gravitor.removeads';

export interface WorldPack {
  /** App Store Connect product ID. */
  productId: string;
  /** Shown on the paywall button. */
  name: string;
  /** World ids this product unlocks. */
  worlds: readonly string[];
  /** Price shown until the App Store answers with the localised one. */
  fallbackPrice: string;
}

export const WORLD_PACKS: readonly WorldPack[] = [
  { productId: 'com.cnmbuckstudios.gravitor.worlds12to14', name: 'Worlds 12-14 Pack', worlds: ['w12', 'w13', 'w14'], fallbackPrice: '$1.99' },
  { productId: 'com.cnmbuckstudios.gravitor.worlds15to17', name: 'Worlds 15-17 Pack', worlds: ['w15', 'w16', 'w17'], fallbackPrice: '$1.99' },
  { productId: 'com.cnmbuckstudios.gravitor.worlds18to20', name: 'Worlds 18-20 Pack', worlds: ['w18', 'w19', 'w20'], fallbackPrice: '$1.99' },
];

/** Every paid world plus Remove Ads, in one purchase. */
export const BUNDLE: WorldPack = {
  productId: 'com.cnmbuckstudios.gravitor.worlds12to20bundle',
  name: 'All Worlds 12-20 + Remove Ads',
  worlds: WORLD_PACKS.flatMap((p) => p.worlds),
  fallbackPrice: '$4.99',
};

/** Every product the game asks the App Store about. */
export const ALL_PRODUCT_IDS: readonly string[] = [REMOVE_ADS_ID, ...WORLD_PACKS.map((p) => p.productId), BUNDLE.productId];

/** The pack that sells this world, or null for a free world. */
export function packFor(worldId: string): WorldPack | null {
  return WORLD_PACKS.find((p) => p.worlds.includes(worldId)) ?? null;
}

/** Whether a world can be played with these products owned (free worlds always can). */
export function worldOwned(worldId: string, owned: readonly string[]): boolean {
  const pack = packFor(worldId);
  if (!pack) return true;
  return owned.includes(pack.productId) || owned.includes(BUNDLE.productId);
}

/** Remove Ads comes on its own or with the bundle. */
export function adFreeOwned(owned: readonly string[]): boolean {
  return owned.includes(REMOVE_ADS_ID) || owned.includes(BUNDLE.productId);
}

/**
 * Whether to offer the bundle on the paywall. Once every pack is owned it would only add Remove
 * Ads, which has its own (cheaper) button, so it is hidden then.
 */
export function bundleWorthOffering(owned: readonly string[]): boolean {
  if (owned.includes(BUNDLE.productId)) return false;
  return !WORLD_PACKS.every((p) => owned.includes(p.productId));
}
