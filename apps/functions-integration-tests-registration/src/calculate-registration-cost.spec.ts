import {
  clearFirestoreEmulator,
  setFirestoreDoc,
  callFunction,
} from '@maple/firebase/integration-test-utils';
import {
  PUBLISHED_CLASS,
  DRAFT_CLASS,
  CANCELLED_CLASS,
  PAST_CLASS,
  CLASS_IDS,
  PERCENT_DISCOUNT,
  AMOUNT_DISCOUNT,
  AMOUNT_BEFORE_DATE_DISCOUNT,
  EXPIRED_EARLY_BIRD_DISCOUNT,
  INACTIVE_DISCOUNT,
  LARGE_AMOUNT_DISCOUNT,
  PAIR_PERCENT_DISCOUNT,
  PAIR_AMOUNT_DISCOUNT,
  PAIR_AMOUNT_OVERSIZED,
  EXHAUSTED_DISCOUNT,
  EXPIRED_BY_DATE_DISCOUNT,
  MUSIC_TOGETHER_DISCOUNT,
  DISCOUNT_IDS,
} from '@maple/firebase/integration-test-utils';
import type {
  CalculateRegistrationCostRequest,
  CalculateRegistrationCostResponse,
} from '@maple/ts/firebase/api-types';

describe('calculateRegistrationCost', () => {
  beforeAll(async () => {
    await clearFirestoreEmulator();

    // Seed classes
    await Promise.all([
      setFirestoreDoc('classes', CLASS_IDS.published, PUBLISHED_CLASS),
      setFirestoreDoc('classes', CLASS_IDS.draft, DRAFT_CLASS),
      setFirestoreDoc('classes', CLASS_IDS.cancelled, CANCELLED_CLASS),
      setFirestoreDoc('classes', CLASS_IDS.past, PAST_CLASS),
    ]);

    // Seed discounts
    await Promise.all([
      setFirestoreDoc(
        'discounts',
        DISCOUNT_IDS.musicTogether,
        MUSIC_TOGETHER_DISCOUNT
      ),
      setFirestoreDoc('discounts', DISCOUNT_IDS.percent, PERCENT_DISCOUNT),
      setFirestoreDoc('discounts', DISCOUNT_IDS.amount, AMOUNT_DISCOUNT),
      setFirestoreDoc(
        'discounts',
        DISCOUNT_IDS.amountBeforeDate,
        AMOUNT_BEFORE_DATE_DISCOUNT
      ),
      setFirestoreDoc('discounts', DISCOUNT_IDS.expired, EXPIRED_EARLY_BIRD_DISCOUNT),
      setFirestoreDoc('discounts', DISCOUNT_IDS.inactive, INACTIVE_DISCOUNT),
      setFirestoreDoc('discounts', DISCOUNT_IDS.large, LARGE_AMOUNT_DISCOUNT),
      setFirestoreDoc(
        'discounts',
        DISCOUNT_IDS.pairPercent,
        PAIR_PERCENT_DISCOUNT
      ),
      setFirestoreDoc(
        'discounts',
        DISCOUNT_IDS.pairAmount,
        PAIR_AMOUNT_DISCOUNT
      ),
      setFirestoreDoc(
        'discounts',
        DISCOUNT_IDS.pairOversized,
        PAIR_AMOUNT_OVERSIZED
      ),
      setFirestoreDoc(
        'discounts',
        DISCOUNT_IDS.exhausted,
        EXHAUSTED_DISCOUNT
      ),
      setFirestoreDoc(
        'discounts',
        DISCOUNT_IDS.expiredByDate,
        EXPIRED_BY_DATE_DISCOUNT
      ),
    ]);
  });

  afterAll(async () => {
    await clearFirestoreEmulator();
  });

  // ===========================================================================
  // Input Validation (AC-1, AC-2)
  // ===========================================================================

  describe('Input validation', () => {
    it('AC-1: should return error when classId is missing', async () => {
      const result = await callFunction<
        Partial<CalculateRegistrationCostRequest>
      >({
        functionName: 'calculateRegistrationCost',
        data: { quantity: 1 },
      });

      expect(result.status).not.toBe(200);
    });

    it('AC-2: should return error when quantity is zero', async () => {
      const result = await callFunction<CalculateRegistrationCostRequest>({
        functionName: 'calculateRegistrationCost',
        data: { classId: CLASS_IDS.published, quantity: 0 },
      });

      expect(result.status).not.toBe(200);
    });

    it('AC-2: should return error when quantity is negative', async () => {
      const result = await callFunction<CalculateRegistrationCostRequest>({
        functionName: 'calculateRegistrationCost',
        data: { classId: CLASS_IDS.published, quantity: -1 },
      });

      expect(result.status).not.toBe(200);
    });
  });

  // ===========================================================================
  // Class Eligibility (AC-3, AC-4, AC-5, AC-6)
  // ===========================================================================

  describe('Class eligibility', () => {
    it('AC-3: should return error when class does not exist', async () => {
      const result = await callFunction<CalculateRegistrationCostRequest>({
        functionName: 'calculateRegistrationCost',
        data: { classId: 'nonexistent-class-id', quantity: 1 },
      });

      expect(result.status).not.toBe(200);
    });

    it('AC-4: should return error when class is in draft status', async () => {
      const result = await callFunction<CalculateRegistrationCostRequest>({
        functionName: 'calculateRegistrationCost',
        data: { classId: CLASS_IDS.draft, quantity: 1 },
      });

      expect(result.status).not.toBe(200);
    });

    it('AC-5: should return error when class is cancelled', async () => {
      const result = await callFunction<CalculateRegistrationCostRequest>({
        functionName: 'calculateRegistrationCost',
        data: { classId: CLASS_IDS.cancelled, quantity: 1 },
      });

      expect(result.status).not.toBe(200);
    });

    it('AC-6: should return error when class dateTime is in the past', async () => {
      const result = await callFunction<CalculateRegistrationCostRequest>({
        functionName: 'calculateRegistrationCost',
        data: { classId: CLASS_IDS.past, quantity: 1 },
      });

      expect(result.status).not.toBe(200);
    });
  });

  // ===========================================================================
  // Base Cost Calculation — No Discount (AC-7, AC-8, AC-9, AC-10)
  // ===========================================================================

  describe('Base cost calculation (no discount)', () => {
    it('AC-7: should calculate correct cost for quantity of 1', async () => {
      const result = await callFunction<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >({
        functionName: 'calculateRegistrationCost',
        data: { classId: CLASS_IDS.published, quantity: 1 },
      });

      expect(result.status).toBe(200);
      expect(result.data?.originalCostCents).toBe(
        PUBLISHED_CLASS.priceCents
      );
    });

    it('AC-8: should calculate correct cost for quantity > 1', async () => {
      const quantity = 3;
      const result = await callFunction<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >({
        functionName: 'calculateRegistrationCost',
        data: { classId: CLASS_IDS.published, quantity },
      });

      expect(result.status).toBe(200);
      expect(result.data?.originalCostCents).toBe(
        PUBLISHED_CLASS.priceCents * quantity
      );
      // Server echoes back the quantity and per-item price it used so
      // the checkout UI can render the cost summary line item directly
      // from this response, avoiding any locally-derived multiplier
      // drift (regression guard for #423).
      expect(result.data?.quantity).toBe(quantity);
      expect(result.data?.pricePerItemCents).toBe(PUBLISHED_CLASS.priceCents);
    });

    it('AC-9: should return zero discount when no discount code provided', async () => {
      const result = await callFunction<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >({
        functionName: 'calculateRegistrationCost',
        data: { classId: CLASS_IDS.published, quantity: 1 },
      });

      expect(result.status).toBe(200);
      expect(result.data?.discountAmountCents).toBe(0);
      expect(result.data?.discountDescription).toBeUndefined();
    });

    it('AC-10: should have finalCostCents equal originalCostCents when no discount', async () => {
      const result = await callFunction<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >({
        functionName: 'calculateRegistrationCost',
        data: { classId: CLASS_IDS.published, quantity: 1 },
      });

      expect(result.status).toBe(200);
      expect(result.data?.finalCostCents).toBe(
        result.data?.originalCostCents
      );
    });
  });

  // ===========================================================================
  // Percent Discount (AC-11, AC-12, AC-13)
  // ===========================================================================

  describe('Percent discount', () => {
    it('AC-11: should apply percent discount correctly', async () => {
      // 10% off $45.00 (4500 cents) = $4.50 discount (450 cents), $40.50 final (4050 cents)
      const result = await callFunction<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >({
        functionName: 'calculateRegistrationCost',
        data: {
          classId: CLASS_IDS.published,
          quantity: 1,
          discountCode: 'SAVE10',
        },
      });

      expect(result.status).toBe(200);
      const expectedDiscount = Math.round(
        PUBLISHED_CLASS.priceCents * (PERCENT_DISCOUNT.percent / 100)
      );
      expect(result.data?.discountAmountCents).toBe(expectedDiscount);
      expect(result.data?.finalCostCents).toBe(
        PUBLISHED_CLASS.priceCents - expectedDiscount
      );
    });

    it('AC-12: should return "X% off" discount description', async () => {
      const result = await callFunction<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >({
        functionName: 'calculateRegistrationCost',
        data: {
          classId: CLASS_IDS.published,
          quantity: 1,
          discountCode: 'SAVE10',
        },
      });

      expect(result.status).toBe(200);
      expect(result.data?.discountDescription).toBe('10% off');
    });

    it('AC-13: should apply percent discount with rounding on multi-quantity', async () => {
      // 10% off 2 x $45.00 (9000 cents) = $9.00 discount (900 cents)
      const quantity = 2;
      const result = await callFunction<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >({
        functionName: 'calculateRegistrationCost',
        data: {
          classId: CLASS_IDS.published,
          quantity,
          discountCode: 'SAVE10',
        },
      });

      expect(result.status).toBe(200);
      const originalCost = PUBLISHED_CLASS.priceCents * quantity;
      const expectedDiscount = Math.round(
        originalCost * (PERCENT_DISCOUNT.percent / 100)
      );
      expect(result.data?.originalCostCents).toBe(originalCost);
      expect(result.data?.discountAmountCents).toBe(expectedDiscount);
      expect(result.data?.finalCostCents).toBe(
        originalCost - expectedDiscount
      );
    });
  });

  // ===========================================================================
  // Amount Discount (AC-14, AC-15, AC-16)
  // ===========================================================================

  describe('Amount discount', () => {
    it('AC-14: should apply fixed amount discount correctly', async () => {
      // $10 off $45.00 = $35.00 final (3500 cents)
      const result = await callFunction<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >({
        functionName: 'calculateRegistrationCost',
        data: {
          classId: CLASS_IDS.published,
          quantity: 1,
          discountCode: 'TENOFF',
        },
      });

      expect(result.status).toBe(200);
      expect(result.data?.discountAmountCents).toBe(
        AMOUNT_DISCOUNT.amountCents
      );
      expect(result.data?.finalCostCents).toBe(
        PUBLISHED_CLASS.priceCents - AMOUNT_DISCOUNT.amountCents
      );
    });

    it('AC-15: should return "$X.XX off" discount description', async () => {
      const result = await callFunction<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >({
        functionName: 'calculateRegistrationCost',
        data: {
          classId: CLASS_IDS.published,
          quantity: 1,
          discountCode: 'TENOFF',
        },
      });

      expect(result.status).toBe(200);
      expect(result.data?.discountDescription).toBe('$10.00 off');
    });

    it('AC-16: should clamp finalCostCents to zero when discount exceeds total', async () => {
      // $500 discount on $45 class = $0 final (not negative)
      const result = await callFunction<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >({
        functionName: 'calculateRegistrationCost',
        data: {
          classId: CLASS_IDS.published,
          quantity: 1,
          discountCode: 'BIGDEAL',
        },
      });

      expect(result.status).toBe(200);
      expect(result.data?.finalCostCents).toBe(0);
      // discountAmountCents should be capped at the original cost
      expect(result.data?.discountAmountCents).toBeLessThanOrEqual(
        PUBLISHED_CLASS.priceCents
      );
    });
  });

  // ===========================================================================
  // Amount-Before-Date Discount (AC-17, AC-18, AC-19)
  // ===========================================================================

  describe('Amount-before-date discount', () => {
    it('AC-17: should apply discount when before cutoff date', async () => {
      // EARLYBIRD: $15 off, cutoff 60 days from now (still valid)
      const result = await callFunction<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >({
        functionName: 'calculateRegistrationCost',
        data: {
          classId: CLASS_IDS.published,
          quantity: 1,
          discountCode: 'EARLYBIRD',
        },
      });

      expect(result.status).toBe(200);
      expect(result.data?.discountAmountCents).toBe(
        AMOUNT_BEFORE_DATE_DISCOUNT.amountCents
      );
      expect(result.data?.finalCostCents).toBe(
        PUBLISHED_CLASS.priceCents -
          AMOUNT_BEFORE_DATE_DISCOUNT.amountCents
      );
    });

    it('AC-18: should silently ignore discount when past cutoff date', async () => {
      // LATEBIRD: $15 off, cutoff 7 days ago (expired)
      const result = await callFunction<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >({
        functionName: 'calculateRegistrationCost',
        data: {
          classId: CLASS_IDS.published,
          quantity: 1,
          discountCode: 'LATEBIRD',
        },
      });

      expect(result.status).toBe(200);
      // Expired discount treated as invalid → silently ignored
      expect(result.data?.discountAmountCents).toBe(0);
      expect(result.data?.finalCostCents).toBe(PUBLISHED_CLASS.priceCents);
      expect(result.data?.discountDescription).toBeUndefined();
    });

    it('AC-19: should include cutoff date in discount description', async () => {
      const result = await callFunction<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >({
        functionName: 'calculateRegistrationCost',
        data: {
          classId: CLASS_IDS.published,
          quantity: 1,
          discountCode: 'EARLYBIRD',
        },
      });

      expect(result.status).toBe(200);
      expect(result.data?.discountDescription).toMatch(
        /^\$15\.00 off \(before .+\)$/
      );
    });
  });

  // ===========================================================================
  // Invalid Discount Handling — Silent Ignore (AC-20, AC-21, AC-22)
  // ===========================================================================

  describe('Invalid discount handling (silent ignore)', () => {
    it('AC-20: should silently ignore non-existent discount code', async () => {
      const result = await callFunction<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >({
        functionName: 'calculateRegistrationCost',
        data: {
          classId: CLASS_IDS.published,
          quantity: 1,
          discountCode: 'DOESNOTEXIST',
        },
      });

      expect(result.status).toBe(200);
      expect(result.data?.discountAmountCents).toBe(0);
      expect(result.data?.finalCostCents).toBe(PUBLISHED_CLASS.priceCents);
      expect(result.data?.discountDescription).toBeUndefined();
    });

    it('AC-21: should silently ignore inactive discount', async () => {
      const result = await callFunction<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >({
        functionName: 'calculateRegistrationCost',
        data: {
          classId: CLASS_IDS.published,
          quantity: 1,
          discountCode: 'DISABLED',
        },
      });

      expect(result.status).toBe(200);
      expect(result.data?.discountAmountCents).toBe(0);
      expect(result.data?.finalCostCents).toBe(PUBLISHED_CLASS.priceCents);
      expect(result.data?.discountDescription).toBeUndefined();
    });

    it('AC-22: should silently ignore expired amount-before-date discount', async () => {
      // Same as AC-18 but explicitly in the "silent ignore" group
      const result = await callFunction<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >({
        functionName: 'calculateRegistrationCost',
        data: {
          classId: CLASS_IDS.published,
          quantity: 1,
          discountCode: 'LATEBIRD',
        },
      });

      expect(result.status).toBe(200);
      expect(result.data?.discountAmountCents).toBe(0);
      expect(result.data?.finalCostCents).toBe(PUBLISHED_CLASS.priceCents);
    });

    it('should silently ignore an exhausted limited-use code (USED-UP, usageCount=usageLimit)', async () => {
      const result = await callFunction<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >({
        functionName: 'calculateRegistrationCost',
        data: {
          classId: CLASS_IDS.published,
          quantity: 1,
          discountCode: 'USED-UP',
        },
      });

      expect(result.status).toBe(200);
      expect(result.data?.discountAmountCents).toBe(0);
      expect(result.data?.finalCostCents).toBe(PUBLISHED_CLASS.priceCents);
      expect(result.data?.discountDescription).toBeUndefined();
    });

    it('should silently ignore a globally-expired code (TIMEOUT, expiresAt in past)', async () => {
      const result = await callFunction<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >({
        functionName: 'calculateRegistrationCost',
        data: {
          classId: CLASS_IDS.published,
          quantity: 1,
          discountCode: 'TIMEOUT',
        },
      });

      expect(result.status).toBe(200);
      expect(result.data?.discountAmountCents).toBe(0);
      expect(result.data?.finalCostCents).toBe(PUBLISHED_CLASS.priceCents);
      expect(result.data?.discountDescription).toBeUndefined();
    });
  });

  // ===========================================================================
  // Quantity-tier discount (appliesTo: 'nth-slot-onward')
  // ===========================================================================

  describe('Quantity-tier discount — percent (PAIR50, 50% off slot 2+)', () => {
    it('applies no discount when quantity is below the threshold (qty=1)', async () => {
      const result = await callFunction<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >({
        functionName: 'calculateRegistrationCost',
        data: {
          classId: CLASS_IDS.published,
          quantity: 1,
          discountCode: 'PAIR50',
        },
      });

      expect(result.status).toBe(200);
      expect(result.data?.originalCostCents).toBe(PUBLISHED_CLASS.priceCents);
      expect(result.data?.discountAmountCents).toBe(0);
      expect(result.data?.finalCostCents).toBe(PUBLISHED_CLASS.priceCents);
    });

    it('discounts exactly one slot at qty=2 (50% off slot 2)', async () => {
      // qty=2 × $45 = $90; slot 2 gets 50% off = $22.50 off → $67.50 final
      const result = await callFunction<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >({
        functionName: 'calculateRegistrationCost',
        data: {
          classId: CLASS_IDS.published,
          quantity: 2,
          discountCode: 'PAIR50',
        },
      });

      expect(result.status).toBe(200);
      const expectedDiscount = Math.round(PUBLISHED_CLASS.priceCents * 0.5);
      expect(result.data?.originalCostCents).toBe(
        PUBLISHED_CLASS.priceCents * 2
      );
      expect(result.data?.discountAmountCents).toBe(expectedDiscount);
      expect(result.data?.finalCostCents).toBe(
        PUBLISHED_CLASS.priceCents * 2 - expectedDiscount
      );
    });

    it('discounts two slots at qty=3 (50% off slots 2 and 3)', async () => {
      // qty=3 × $45 = $135; slots 2 and 3 each get 50% off = $45 off → $90 final
      const result = await callFunction<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >({
        functionName: 'calculateRegistrationCost',
        data: {
          classId: CLASS_IDS.published,
          quantity: 3,
          discountCode: 'PAIR50',
        },
      });

      expect(result.status).toBe(200);
      const expectedDiscount = Math.round(PUBLISHED_CLASS.priceCents * 0.5) * 2;
      expect(result.data?.originalCostCents).toBe(
        PUBLISHED_CLASS.priceCents * 3
      );
      expect(result.data?.discountAmountCents).toBe(expectedDiscount);
      expect(result.data?.finalCostCents).toBe(
        PUBLISHED_CLASS.priceCents * 3 - expectedDiscount
      );
    });

    it('returns description with "(slots N+)" suffix', async () => {
      const result = await callFunction<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >({
        functionName: 'calculateRegistrationCost',
        data: {
          classId: CLASS_IDS.published,
          quantity: 2,
          discountCode: 'PAIR50',
        },
      });

      expect(result.status).toBe(200);
      expect(result.data?.discountDescription).toBe('50% off (slots 2+)');
    });
  });

  describe('Quantity-tier discount — amount (TRIO10, $10 off slot 3+)', () => {
    it('applies no discount when quantity is below the threshold (qty=2)', async () => {
      const result = await callFunction<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >({
        functionName: 'calculateRegistrationCost',
        data: {
          classId: CLASS_IDS.published,
          quantity: 2,
          discountCode: 'TRIO10',
        },
      });

      expect(result.status).toBe(200);
      expect(result.data?.discountAmountCents).toBe(0);
    });

    it('discounts one slot at qty=3 ($10 off slot 3)', async () => {
      const result = await callFunction<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >({
        functionName: 'calculateRegistrationCost',
        data: {
          classId: CLASS_IDS.published,
          quantity: 3,
          discountCode: 'TRIO10',
        },
      });

      expect(result.status).toBe(200);
      expect(result.data?.discountAmountCents).toBe(1000);
      expect(result.data?.finalCostCents).toBe(
        PUBLISHED_CLASS.priceCents * 3 - 1000
      );
    });

    it('discounts two slots at qty=4 ($20 off — $10 × 2 slots)', async () => {
      const result = await callFunction<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >({
        functionName: 'calculateRegistrationCost',
        data: {
          classId: CLASS_IDS.published,
          quantity: 4,
          discountCode: 'TRIO10',
        },
      });

      expect(result.status).toBe(200);
      expect(result.data?.discountAmountCents).toBe(2000);
    });
  });

  describe('Quantity-tier discount — per-slot cap (OVERSIZED-PAIR)', () => {
    it('caps the per-slot discount at the unit price (slot floors at $0)', async () => {
      // OVERSIZED-PAIR is $500 off slots 2+; at qty=2 with $45 unit price,
      // slot 2 is capped at $45 off (not $500). Slot 1 is full price.
      // Expected: $45 + $0 = $45 final, $45 discount.
      const result = await callFunction<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >({
        functionName: 'calculateRegistrationCost',
        data: {
          classId: CLASS_IDS.published,
          quantity: 2,
          discountCode: 'OVERSIZED-PAIR',
        },
      });

      expect(result.status).toBe(200);
      expect(result.data?.discountAmountCents).toBe(PUBLISHED_CLASS.priceCents);
      expect(result.data?.finalCostCents).toBe(PUBLISHED_CLASS.priceCents);
    });
  });

  // ===========================================================================
  // Public Access (AC-23)
  // ===========================================================================

  describe('Public access', () => {
    it('AC-23: should work without authentication', async () => {
      // No idToken provided — this is a public endpoint
      const result = await callFunction<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >({
        functionName: 'calculateRegistrationCost',
        data: { classId: CLASS_IDS.published, quantity: 1 },
      });

      expect(result.status).toBe(200);
      expect(result.data?.originalCostCents).toBe(
        PUBLISHED_CLASS.priceCents
      );
    });
  });
  // ===========================================================================
  // Program scoping (#791)
  // ===========================================================================

  describe('Program scoping', () => {
    it('ignores a Music Together code — it bills to a different business', async () => {
      const result = await callFunction<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >({
        functionName: 'calculateRegistrationCost',
        data: {
          classId: CLASS_IDS.published,
          quantity: 1,
          discountCode: 'MTONLY50',
        },
      });

      expect(result.status).toBe(200);
      expect(result.data?.discountAmountCents).toBe(0);
      expect(result.data?.discountDescription).toBeUndefined();
      expect(result.data?.finalCostCents).toBe(PUBLISHED_CLASS.priceCents);
    });

    it('still honors a legacy code with no stored program', async () => {
      // The shared fixtures predate scoping and carry no `program`. They must
      // keep working: the repository back-fills them to `classes`.
      const result = await callFunction<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >({
        functionName: 'calculateRegistrationCost',
        data: {
          classId: CLASS_IDS.published,
          quantity: 1,
          discountCode: 'SAVE10',
        },
      });

      expect(result.status).toBe(200);
      expect(result.data?.discountAmountCents).toBeGreaterThan(0);
    });
  });
});
