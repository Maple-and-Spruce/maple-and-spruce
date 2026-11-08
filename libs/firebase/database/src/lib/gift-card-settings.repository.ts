/**
 * Gift Card Settings Repository (#309)
 *
 * Single config doc (`appConfig/giftCards`) holding what the website sells as
 * dollar gift cards: the one-tap amounts and the lowest and highest "Other
 * amount". Until Katie edits it in Admin > Settings it reads as the amounts
 * the buy page shipped with, so nothing has to be seeded.
 *
 * Read by the buy page (through `publicSite/getGiftCardOptions`) and by
 * `giftCards/purchaseGiftCard`, which enforces it.
 */
import { getDb } from './utilities/database.config';
import {
  DEFAULT_GIFT_CARD_AMOUNT_SETTINGS,
  type GiftCardAmountSettings,
} from '@maple/ts/domain';

const CONFIG_COLLECTION = 'appConfig';
const CONFIG_DOC = 'giftCards';

function docRef() {
  return getDb().collection(CONFIG_COLLECTION).doc(CONFIG_DOC);
}

function isCents(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * The stored settings, or the defaults when nothing usable is stored. Each
 * field falls back on its own, so a half-written doc still sells.
 */
function toSettings(data: Record<string, unknown> | undefined): GiftCardAmountSettings {
  const presets = data?.['presetCents'];
  const minCents = data?.['minCents'];
  const maxCents = data?.['maxCents'];
  return {
    presetCents:
      Array.isArray(presets) && presets.length > 0 && presets.every(isCents)
        ? [...presets].sort((a, b) => a - b)
        : [...DEFAULT_GIFT_CARD_AMOUNT_SETTINGS.presetCents],
    minCents: isCents(minCents) ? minCents : DEFAULT_GIFT_CARD_AMOUNT_SETTINGS.minCents,
    maxCents: isCents(maxCents) ? maxCents : DEFAULT_GIFT_CARD_AMOUNT_SETTINGS.maxCents,
  };
}

export const GiftCardSettingsRepository = {
  async get(): Promise<GiftCardAmountSettings> {
    const doc = await docRef().get();
    return toSettings(doc.exists ? doc.data() : undefined);
  },

  /** Saves validated settings, presets smallest first. */
  async set(
    settings: GiftCardAmountSettings,
    updatedByUid?: string
  ): Promise<GiftCardAmountSettings> {
    await docRef().set(
      {
        presetCents: [...settings.presetCents].sort((a, b) => a - b),
        minCents: settings.minCents,
        maxCents: settings.maxCents,
        updatedAt: new Date(),
        updatedByUid: updatedByUid ?? null,
      },
      { merge: true }
    );
    return this.get();
  },
};
