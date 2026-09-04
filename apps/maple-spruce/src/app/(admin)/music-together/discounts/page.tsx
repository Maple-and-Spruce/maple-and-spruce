'use client';

import { DiscountsManager } from '@maple/react/discounts';
import { useDiscounts } from '../../../../hooks';

/**
 * Music Together discount codes.
 *
 * The same management experience as the class discounts page — same
 * `DiscountsManager`, same form — filtered to `program: 'music-together'`.
 *
 * This page is why the discount functions are gated `[Admin, MtTeacher]`
 * rather than admin-only: Music Together promotions are Stephanie's to run,
 * and they bill to her separate Square account. The server still forces a
 * non-admin caller to this program, so reaching this page is not what grants
 * the access — the role is.
 */
export default function MusicTogetherDiscountsPage() {
  const {
    discountsState,
    createDiscount,
    updateDiscount,
    deleteDiscount,
  } = useDiscounts({ program: 'music-together' });

  return (
    <DiscountsManager
      program="music-together"
      title="Music Together Discount Codes"
      description="Redeemable at Music Together registration checkout. A code takes its discount off every payment, including the scheduled second installment."
      discountsState={discountsState}
      onCreate={createDiscount}
      onUpdate={updateDiscount}
      onDelete={deleteDiscount}
    />
  );
}
