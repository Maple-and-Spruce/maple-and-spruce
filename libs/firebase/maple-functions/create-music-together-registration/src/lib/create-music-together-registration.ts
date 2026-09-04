/**
 * Create Music Together Registration Cloud Function (public, MT Square account)
 *
 * The public checkout for a Music Together section. Routes payment to MT's
 * SEPARATE Square account (MT_SQUARE_KEYS), not Maple & Spruce's.
 *
 * Flow:
 *  1. Validate the family payload (Vest) before any Square write.
 *  2. Load the section; it must be `open`.
 *  3. Reserve a `pending` registration inside a transaction that enforces the
 *     per-section family cap (overbooking-safe).
 *  4. Charge in MT Square:
 *       - full pay → one-time nonce charge of the full price.
 *       - installments → upsert customer, vault the card, charge the *stored*
 *         card for installment 1, and materialize installments 2..N as
 *         `musicTogetherScheduledCharges` for the Week-5 auto-charge job.
 *  5. Confirm the registration and queue a confirmation email.
 *
 * On payment failure the reserved registration is cancelled so the seat frees.
 *
 * Deployed to us-east4 via CI/CD (maple-square codebase).
 */
import {
  Functions,
  throwInvalidArgument,
  throwNotFound,
  throwFailedPrecondition,
  throwValidationError,
  generateFamilyCalendarToken,
  familyCalendarSubscribeUrl,
  queueMail,
} from '@maple/firebase/functions';
import {
  Square,
  MT_SQUARE_SECRET_NAMES,
  MT_SQUARE_STRING_NAMES,
  MT_SQUARE_KEYS,
  PaymentError,
} from '@maple/firebase/square';
import {
  DiscountRepository,
  MusicTogetherSectionRepository,
  MusicTogetherRegistrationRepository,
  MusicTogetherScheduledChargeRepository,
  getDb,
} from '@maple/firebase/database';
import { FieldValue } from 'firebase-admin/firestore';
import {
  MT_CAPACITY_STATUSES,
  MT_DEFAULT_LOCATION,
  MT_MAX_CHILDREN,
  formatNameList,
  mtSectionOffersInstallments,
  mtSectionEnrollmentOpen,
  computeMusicTogetherFamilyPrice,
  mtApplyDiscount,
  isDiscountValid,
  isDiscountForProgram,
} from '@maple/ts/domain';
import type { MusicTogetherFamilyPrice } from '@maple/ts/domain';
import { musicTogetherRegistrationValidation } from '@maple/ts/validation';
import type {
  CreateMusicTogetherRegistrationRequest,
  CreateMusicTogetherRegistrationResponse,
} from '@maple/ts/firebase/api-types';

const COLLECTION = 'musicTogetherRegistrations';

/**
 * Give a consumed discount redemption back after a failed payment.
 *
 * The seat is freed on that path and the family was never charged, so burning
 * a single-use code on a declined card would lock them out of the offer
 * entirely. This is NOT the customer-cancellation path, where usage stays
 * consumed by design.
 *
 * Never throws: a bookkeeping failure here must not mask the payment error the
 * caller is about to surface.
 */
async function releaseDiscountUsage(
  discountRef: FirebaseFirestore.DocumentReference | undefined,
  registrationId: string,
  discountCode: string | undefined
): Promise<void> {
  if (!discountRef) return;
  try {
    await discountRef.update({
      usageCount: FieldValue.increment(-1),
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error('MT discount release failed', {
      registrationId,
      discountCode,
      detail: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Re-validate a discount from the copy read inside the reservation
 * transaction. Throws (aborting the transaction, so no seat is taken) when the
 * code was deactivated, expired, or spent since `resolveDiscount` read it.
 *
 * Reads raw Firestore data rather than a hydrated `Discount` because this runs
 * on the transaction's own snapshot — the point is to trust nothing but the
 * bytes the transaction itself saw.
 */
function assertStillRedeemable(
  snap: FirebaseFirestore.DocumentSnapshot,
  now: Date
): void {
  const fresh = snap.data();
  if (!fresh || fresh.status !== 'active') {
    throw new Error('Discount code is no longer available');
  }
  const expiresAt = fresh.expiresAt?.toDate?.() ?? fresh.expiresAt;
  if (expiresAt && now > new Date(expiresAt)) {
    throw new Error('Discount code has expired');
  }
  const usageLimit =
    typeof fresh.usageLimit === 'number' ? fresh.usageLimit : null;
  const usageCount =
    typeof fresh.usageCount === 'number' ? fresh.usageCount : 0;
  if (usageLimit !== null && usageCount >= usageLimit) {
    throw new Error('Discount code has reached its usage limit');
  }
}

/**
 * Resolve an optional discount code into a discounted family price.
 *
 * AUTHORITATIVE, like the base pricing: the client sends only the code string
 * and the discount is re-looked-up here. A code that has gone invalid between
 * the widget's lookup and this call FAILS the registration — silently charging
 * full price would bill a family a number they never agreed to.
 *
 * Returns the untouched price and no code when none was sent (or when the code
 * happens to take nothing off).
 */
async function resolveDiscount<Item extends { amountCents: number; dueAt: Date }>(
  basePrice: MusicTogetherFamilyPrice<Item>,
  requested: string | undefined,
  paymentPlan: 'full' | 'installments',
  now: Date
): Promise<{
  price: MusicTogetherFamilyPrice<Item>;
  discountId?: string;
  discountCode?: string;
  discountAmountCents: number;
}> {
  const code = requested?.trim();
  if (!code) {
    return { price: basePrice, discountAmountCents: 0 };
  }

  const discount = await DiscountRepository.findByCode(code);
  // Same branch, same wording, for a Maple & Spruce class code (#791): MT
  // bills to Stephanie's separate Square account, so honoring one here would
  // move a discount between two businesses' books — and a distinct message
  // would leak which class promotions are live.
  if (
    !discount ||
    !isDiscountValid(discount, now) ||
    !isDiscountForProgram(discount, 'music-together')
  ) {
    throwFailedPrecondition(
      `Discount code "${code}" is no longer valid. Please refresh and try again.`
    );
  }

  let discounted;
  try {
    // Discounts every amount, the scheduled Week-5 charge included.
    discounted = mtApplyDiscount(basePrice, discount, now);
  } catch (error) {
    // Slot-scoped codes have no meaning for MT's family pricing.
    throwFailedPrecondition(
      error instanceof RangeError
        ? error.message
        : `Discount code "${code}" can't be used for Music Together.`
    );
  }

  // Record the reduction on the plan the family actually chose — the two plans
  // are priced independently, so the other number would be wrong.
  const discountAmountCents =
    paymentPlan === 'installments'
      ? discounted.installmentsDiscountCents
      : discounted.fullDiscountCents;
  if (discountAmountCents <= 0) {
    return { price: basePrice, discountAmountCents: 0 };
  }
  return {
    price: discounted,
    discountId: discount.id,
    discountCode: discounted.discountCode,
    discountAmountCents,
  };
}

export const createMusicTogetherRegistration = Functions.endpoint
  .usingSecrets(...MT_SQUARE_SECRET_NAMES)
  .usingStrings(...MT_SQUARE_STRING_NAMES, 'ALLOWED_ORIGINS')
  .handle<
    CreateMusicTogetherRegistrationRequest,
    CreateMusicTogetherRegistrationResponse
  >(async (data, context, secrets, strings) => {
    // Structured adult name (shared with Music Together Worldwide) plus a
    // parentNames array kept for the roster/licensee views. When a caller
    // omits parentNames, fall back to the adult's first + last name.
    const adultFirstName = (data.adultFirstName ?? '').trim();
    const adultLastName = (data.adultLastName ?? '').trim();
    const providedParentNames = (data.parentNames ?? [])
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
    const parentNames =
      providedParentNames.length > 0
        ? providedParentNames
        : [`${adultFirstName} ${adultLastName}`.trim()].filter(
            (n) => n.length > 0
          );

    // 1. Validate the payload before touching Square.
    const validation = musicTogetherRegistrationValidation({
      sectionId: data.sectionId,
      adultFirstName: data.adultFirstName,
      adultLastName: data.adultLastName,
      parentNames,
      children: data.children,
      email: data.email,
      phone: data.phone,
      address: data.address,
      accommodations: data.accommodations,
      paymentPlan: data.paymentPlan,
      policiesAccepted: data.policiesAccepted,
      privacyConsent: data.privacyConsent,
      cardOnFileAuth: data.cardOnFileAuth,
    });
    if (validation.hasErrors()) {
      throwValidationError(validation.getErrors());
    }
    if (!data.paymentNonce) {
      throwInvalidArgument('Payment information is required');
    }

    // 2. Load the section; it must be open for registration.
    const section = await MusicTogetherSectionRepository.findById(
      data.sectionId
    );
    if (!section) {
      throwNotFound('Music Together section', data.sectionId);
    }
    // Enrollment is gated by the explicit controls (live toggle + optional
    // schedule), evaluated now — not a stored status. Capacity is enforced
    // transactionally below, so the window-only check is used here.
    const now = new Date();
    if (!mtSectionEnrollmentOpen(section, now)) {
      if (
        section.enrollmentActive &&
        section.enrollmentOpensAt &&
        now < section.enrollmentOpensAt
      ) {
        throwFailedPrecondition(
          "Registration for this section isn't open yet."
        );
      }
      throwFailedPrecondition('Registration for this section has closed.');
    }

    // 3. Resolve the charge amounts from the section's configurable plan,
    //    applying the per-child sibling discount. This is AUTHORITATIVE — the
    //    client never sends an amount; we recompute the family total here from
    //    the section's base prices so a tampered client can't underpay.
    const offersInstallments = mtSectionOffersInstallments(section);
    if (data.paymentPlan === 'installments' && !offersInstallments) {
      throwFailedPrecondition(
        'This section does not offer an installment plan.'
      );
    }
    // The installment plan vaults a card on file, which real Square only allows
    // with a STORE-intent verification token from the client's verifyBuyer call.
    // Fail before reserving the seat / touching Square if it's missing.
    if (data.paymentPlan === 'installments' && !data.cardVerificationToken) {
      throwInvalidArgument(
        'Card verification is required for the installment plan.'
      );
    }
    const numChildren = data.children?.length ?? 0;
    if (numChildren < 1 || numChildren > MT_MAX_CHILDREN) {
      throwInvalidArgument(
        `A family can enroll between 1 and ${MT_MAX_CHILDREN} children.`
      );
    }
    const plan = section.installmentPlan ?? [];
    // First child full price, 50% off the 2nd & 3rd — applied identically to
    // the pay-in-full total and to EACH installment (incl. the scheduled ones).
    const basePrice = computeMusicTogetherFamilyPrice(section, numChildren);

    // 3b. Optional discount code — resolved authoritatively from the code
    //     string alone (see `resolveDiscount`).
    const {
      price: familyPrice,
      discountId: discountIdToRedeem,
      discountCode,
      discountAmountCents,
    } = await resolveDiscount(
      basePrice,
      data.discountCode,
      data.paymentPlan,
      now
    );

    const firstChargeCents =
      data.paymentPlan === 'installments'
        ? familyPrice.installments[0].amountCents
        : familyPrice.fullCents;
    // Installments 2..N become scheduled card-on-file charges (discounted too).
    const scheduledItems =
      data.paymentPlan === 'installments'
        ? familyPrice.installments.slice(1)
        : [];

    // The family's TOTAL committed tuition, sibling discount included.
    //
    // For installments this is the SUM OF THE PLAN, not `familyPrice.fullCents`
    // — the installment plan carries a premium (2 x $132 = $264 vs $252 paid in
    // full), so `fullCents` would understate what the family actually owes and
    // report a number nobody is ever charged.
    //
    // Persisted (rather than recomputed by a consumer) for two reasons: the
    // scheduled charges are materialized AFTER the confirming write, so anything
    // summing that collection races them; and it keeps pricing math in this one
    // place instead of coupling downstream readers to the section.
    const totalCommittedCents =
      data.paymentPlan === 'installments'
        ? familyPrice.installments.reduce(
            (sum, item) => sum + item.amountCents,
            0
          )
        : familyPrice.fullCents;

    // Square rejects a $0 payment, so a code that zeroes the charge would fail
    // deep inside the card-vault sequence with an opaque error. Refuse it here
    // instead: a fully comped family is an admin action, not a checkout.
    if (firstChargeCents <= 0) {
      throwFailedPrecondition(
        'That discount code would reduce this registration to $0. Please contact us to enroll at no charge.'
      );
    }

    const square = new Square(secrets, strings, MT_SQUARE_KEYS);

    // Per-family calendar subscription token: reuse the family's existing token
    // (matched by email) so one subscribe link tracks all their sections; mint
    // a fresh unguessable one for a brand-new family.
    const calendarToken =
      (await MusicTogetherRegistrationRepository.findCalendarTokenByEmail(
        data.email
      )) ?? generateFamilyCalendarToken();

    // 4. Reserve the seat inside a transaction that enforces the family cap.
    const db = getDb();
    const regRef = MusicTogetherRegistrationRepository.getDocRef();
    const children = data.children.map((c) => ({
      name: c.name.trim(),
      dob: new Date(c.dob),
    }));
    const accommodations = data.accommodations?.trim() || null;

    const discountRef = discountIdToRedeem
      ? DiscountRepository.getDocRef(discountIdToRedeem)
      : undefined;

    await db.runTransaction(async (tx) => {
      // === Reads before writes ===
      const existing = await tx.get(
        db
          .collection(COLLECTION)
          .where('sectionId', '==', data.sectionId)
          .where('status', 'in', [...MT_CAPACITY_STATUSES])
      );
      const discountSnap = discountRef ? await tx.get(discountRef) : undefined;

      if (existing.size >= section.capacityFamilies) {
        // Full — the widget switches to the waitlist (Phase 5).
        throw new Error('This section is full.');
      }

      // Re-check the redemption INSIDE the transaction. The read above is a
      // point-in-time snapshot; only this makes two families racing for the
      // last use of a single-use code resolve to exactly one winner.
      if (discountSnap) {
        assertStillRedeemable(discountSnap, now);
      }

      tx.set(regRef, {
        sectionId: data.sectionId,
        adultFirstName,
        adultLastName,
        parentNames,
        children,
        email: data.email,
        phone: data.phone,
        address: data.address,
        accommodations,
        paymentPlan: data.paymentPlan,
        policiesAcceptedAt: now,
        privacyConsentAcceptedAt: now,
        cardOnFileAuthAt:
          data.paymentPlan === 'installments' ? now : null,
        pricePaidCents: firstChargeCents,
        totalCommittedCents,
        discountCode: discountCode || null,
        discountAmountCents,
        scheduledChargeCount: scheduledItems.length,
        status: 'pending',
        notes: data.notes || null,
        calendarToken,
        // Meta ad-attribution, read by `sendMusicTogetherConversion` when this
        // doc flips to `confirmed`. Advisory signal only — never authorized on.
        fbp: data.metaAttribution?.fbp || null,
        fbc: data.metaAttribution?.fbc || null,
        eventSourceUrl: data.metaAttribution?.eventSourceUrl || null,
        clientIp: context.ip || null,
        clientUserAgent: context.userAgent || null,
        createdAt: now,
        updatedAt: now,
      });

      if (discountRef) {
        tx.update(discountRef, {
          usageCount: FieldValue.increment(1),
          updatedAt: now,
        });
      }
    });

    // 5. Charge in MT Square (+ vault a card for the installment plan).
    let squareCustomerId: string | undefined;
    let squareCardId: string | undefined;
    let cardLast4: string | undefined;
    let squarePaymentId: string | undefined;
    let squareReceiptUrl: string | undefined;
    try {
      if (data.paymentPlan === 'installments') {
        // The nonce is single-use, so vault the card first, then charge the
        // STORED card (customerId required) for installment 1. The same card
        // is used by the scheduled charges later.
        squareCustomerId = await square.customersService.upsertByEmail({
          email: data.email,
          name: parentNames[0],
          phone: data.phone,
        });
        const card = await square.cardsService.createCardOnFile({
          sourceId: data.paymentNonce,
          customerId: squareCustomerId,
          cardholderName: parentNames[0],
          verificationToken: data.cardVerificationToken,
          idempotencyKey: `mtcard-${regRef.id}`,
        });
        squareCardId = card.cardId;
        cardLast4 = card.last4;

        const payment = await square.paymentsService.createPayment({
          sourceId: squareCardId,
          customerId: squareCustomerId,
          amountCents: firstChargeCents,
          idempotencyKey: `mtreg-${regRef.id}`,
          locationId: square.locationId,
          buyerEmailAddress: data.email,
          note: `Music Together — ${section.name} (installment 1 of ${plan.length})`,
          referenceId: regRef.id,
        });
        squarePaymentId = payment.paymentId;
        squareReceiptUrl = payment.receiptUrl;
      } else {
        // Full pay — a single one-time charge of the nonce.
        const payment = await square.paymentsService.createPayment({
          sourceId: data.paymentNonce,
          amountCents: firstChargeCents,
          idempotencyKey: `mtreg-${regRef.id}`,
          locationId: square.locationId,
          buyerEmailAddress: data.email,
          note: `Music Together — ${section.name}`,
          referenceId: regRef.id,
        });
        squarePaymentId = payment.paymentId;
        squareReceiptUrl = payment.receiptUrl;
      }
    } catch (paymentError) {
      const detail =
        paymentError instanceof Error ? paymentError.message : 'Unknown error';
      const squareErrorCode =
        paymentError instanceof PaymentError
          ? paymentError.squareErrorCode
          : undefined;
      // Log the real cause with context — the vault/charge sequence has three
      // Square calls (customer upsert, card vault, stored-card charge) and the
      // generic customer message alone can't tell them apart in prod logs.
      console.error('MT registration payment failed', {
        registrationId: regRef.id,
        sectionId: data.sectionId,
        paymentPlan: data.paymentPlan,
        squareErrorCode,
        detail,
      });
      await regRef.update({
        status: 'cancelled',
        notes: `Payment failed: ${detail}`,
        updatedAt: new Date(),
      });
      await releaseDiscountUsage(discountRef, regRef.id, discountCode);
      if (paymentError instanceof PaymentError) {
        throw paymentError;
      }
      throw new PaymentError(
        'Unable to process payment. Please try again or use a different card.',
        undefined
      );
    }

    // 6. Payment succeeded — confirm first so a confirmed, paid family is never
    //    blocked by a later non-payment hiccup.
    await regRef.update({
      status: 'confirmed',
      squareCustomerId: squareCustomerId || null,
      squareCardId: squareCardId || null,
      squarePaymentId: squarePaymentId || null,
      squareReceiptUrl: squareReceiptUrl || null,
      updatedAt: new Date(),
    });

    // 7. Materialize the remaining installments as scheduled charges. If this
    //    fails after a successful charge, we do NOT fail the request (the
    //    family is paid + enrolled); record how many were created so admins
    //    can reconcile.
    let createdCharges = 0;
    try {
      for (let i = 0; i < scheduledItems.length; i++) {
        const item = scheduledItems[i];
        await MusicTogetherScheduledChargeRepository.create({
          registrationId: regRef.id,
          sectionId: data.sectionId,
          installmentNumber: i + 2, // installment 1 charged now; these are 2..N
          amountCents: item.amountCents,
          dueAt: item.dueAt,
          status: 'scheduled',
        });
        createdCharges++;
      }
    } catch (scheduleError) {
      const detail =
        scheduleError instanceof Error
          ? scheduleError.message
          : 'Unknown error';
      await regRef.update({
        scheduledChargeCount: createdCharges,
        notes: `Confirmed, but scheduling installments failed after ${createdCharges}/${scheduledItems.length}: ${detail}`,
        updatedAt: new Date(),
      });
    }

    // 8. Confirmation email (fire-and-forget via the mail collection).
    //    Template `music-together-confirmation` is seeded via
    //    tools/seed-email-templates.ts. The extension's Handlebars can't format
    //    currency/dates, so pass template-ready strings (raw cents/plan kept for
    //    any downstream consumers).
    const fmtMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;
    const fmtDate = (d: Date) =>
      d.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'America/New_York',
      });
    const secondInstallment = scheduledItems[0];
    // First meeting of the term — the "Starts: <day>, <date> at <time>" line.
    // A section with no sessions yet still confirms; the template hides the row.
    const firstSession = [...(section.sessions ?? [])].sort(
      (a, b) => a.dateTime.getTime() - b.dateTime.getTime()
    )[0];
    const fmtPart = (d: Date, opts: Intl.DateTimeFormatOptions) =>
      d.toLocaleDateString('en-US', { timeZone: 'America/New_York', ...opts });
    await queueMail({
      sender: 'music-together',
      to: data.email,
      templateName: 'music-together-confirmation',
      data: {
            caregiverName: formatNameList(parentNames),
            childNames: formatNameList(children.map((c) => c.name)),
            sectionName: section.name,
            classLocation: section.location || MT_DEFAULT_LOCATION,
            firstClassDay: firstSession
              ? fmtPart(firstSession.dateTime, { weekday: 'long' })
              : '',
            firstClassDate: firstSession
              ? fmtPart(firstSession.dateTime, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })
              : '',
            firstClassTime: firstSession
              ? firstSession.dateTime.toLocaleTimeString('en-US', {
                  timeZone: 'America/New_York',
                  hour: 'numeric',
                  minute: '2-digit',
                })
              : '',
            paymentPlan: data.paymentPlan,
            amountChargedCents: firstChargeCents,
            scheduledChargeCount: createdCharges,
            // Template-ready presentation fields:
            amountChargedLabel: fmtMoney(firstChargeCents),
            isInstallments: data.paymentPlan === 'installments',
            secondInstallmentLabel: secondInstallment
              ? fmtMoney(secondInstallment.amountCents)
              : '',
            secondInstallmentDate: secondInstallment
              ? fmtDate(new Date(secondInstallment.dueAt))
              : '',
            cardLast4: cardLast4 ?? '',
            receiptUrl: squareReceiptUrl ?? '',
            // Auto-updating per-family calendar subscription (webcal://). Stays
            // current as the family registers/cancels or class times change.
            calendarSubscribeUrl: familyCalendarSubscribeUrl(calendarToken),
      },
    });

    return {
      registrationId: regRef.id,
      status: 'confirmed',
      amountChargedCents: firstChargeCents,
      scheduledChargeCount: createdCharges,
      discountCode,
      discountAmountCents: discountCode ? discountAmountCents : undefined,
      cardLast4,
      squareReceiptUrl,
    };
  });
