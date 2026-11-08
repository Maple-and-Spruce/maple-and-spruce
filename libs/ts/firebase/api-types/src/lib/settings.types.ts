/**
 * The `settings` router (#161): app-level lists the studio edits on Settings.
 */
import type {
  GiftCardAmountSettings,
  GiftCertificateClassType,
  InstrumentOption,
} from '@maple/ts/domain';

export type GetInstrumentsRequest = Record<string, never>;

export interface GetInstrumentsResponse {
  instruments: InstrumentOption[];
}

export interface SaveInstrumentsRequest {
  instruments: InstrumentOption[];
}

export interface SaveInstrumentsResponse {
  instruments: InstrumentOption[];
}

/** `settings/getGiftCardSettings` (#309), admin only. */
export type GetGiftCardSettingsRequest = Record<string, never>;

export interface GetGiftCardSettingsResponse {
  settings: GiftCardAmountSettings;
}

/** `settings/updateGiftCardSettings` (#309), admin only. Replaces all three. */
export type UpdateGiftCardSettingsRequest = GiftCardAmountSettings;

export interface UpdateGiftCardSettingsResponse {
  settings: GiftCardAmountSettings;
}

/**
 * `publicSite/getGiftCardOptions` (#309): what the gift card buy page
 * offers. Public.
 */
export type GetGiftCardOptionsRequest = Record<string, never>;

export interface GetGiftCardOptionsResponse {
  amounts: GiftCardAmountSettings;
  /** Class types switched on as gift certificates, in display order. */
  classTypes: GiftCertificateClassType[];
}
