'use client';

import { DiscountsManager } from '@maple/react/discounts';
import { useDiscounts } from '../../../hooks';

/**
 * Maple & Spruce class discount codes.
 *
 * Scoped to `program: 'classes'` — Music Together codes live on their own page
 * under Music Together (#791). Both pages render the same `DiscountsManager`,
 * so the two experiences stay identical apart from which codes they show.
 */
export default function DiscountsPage() {
  const {
    discountsState,
    createDiscount,
    updateDiscount,
    deleteDiscount,
  } = useDiscounts({ program: 'classes' });

  return (
    <DiscountsManager
      program="classes"
      title="Class Discount Codes"
      description="Redeemable at Maple & Spruce class checkout. Music Together codes are managed under Music Together."
      discountsState={discountsState}
      onCreate={createDiscount}
      onUpdate={updateDiscount}
      onDelete={deleteDiscount}
    />
  );
}
