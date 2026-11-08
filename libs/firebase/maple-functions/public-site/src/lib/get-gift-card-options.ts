/**
 * `publicSite/getGiftCardOptions` (#309): what the gift card buy page offers.
 *
 * The dollar amounts from Admin > Settings, and the class types Katie has
 * switched on as gift certificates with their prices. Public, read only:
 * nothing here is more than the buy page already shows.
 */
import {
  ClassCategoryRepository,
  GiftCardSettingsRepository,
} from '@maple/firebase/database';
import {
  isGiftCertificateCategory,
  toGiftCertificateClassType,
} from '@maple/ts/domain';
import type {
  GetGiftCardOptionsRequest,
  GetGiftCardOptionsResponse,
} from '@maple/ts/firebase/api-types';

export async function getGiftCardOptions(
  _data?: GetGiftCardOptionsRequest
): Promise<GetGiftCardOptionsResponse> {
  const [amounts, categories] = await Promise.all([
    GiftCardSettingsRepository.get(),
    ClassCategoryRepository.findAll(),
  ]);
  return {
    amounts,
    classTypes: categories.filter(isGiftCertificateCategory).map(toGiftCertificateClassType),
  };
}
