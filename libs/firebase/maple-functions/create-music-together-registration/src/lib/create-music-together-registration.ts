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
} from '@maple/firebase/functions';
import {
  Square,
  MT_SQUARE_SECRET_NAMES,
  MT_SQUARE_STRING_NAMES,
  MT_SQUARE_KEYS,
  PaymentError,
} from '@maple/firebase/square';
import {
  MusicTogetherSectionRepository,
  MusicTogetherRegistrationRepository,
  MusicTogetherScheduledChargeRepository,
  getDb,
} from '@maple/firebase/database';
import {
  MT_CAPACITY_STATUSES,
  MT_MAX_CHILDREN,
  mtSectionOffersInstallments,
  mtSectionEnrollmentOpen,
  computeMusicTogetherFamilyPrice,
} from '@maple/ts/domain';
import { musicTogetherRegistrationValidation } from '@maple/ts/validation';
import type {
  CreateMusicTogetherRegistrationRequest,
  CreateMusicTogetherRegistrationResponse,
} from '@maple/ts/firebase/api-types';

const COLLECTION = 'musicTogetherRegistrations';

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
    const familyPrice = computeMusicTogetherFamilyPrice(section, numChildren);
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

    await db.runTransaction(async (tx) => {
      const existing = await tx.get(
        db
          .collection(COLLECTION)
          .where('sectionId', '==', data.sectionId)
          .where('status', 'in', [...MT_CAPACITY_STATUSES])
      );
      if (existing.size >= section.capacityFamilies) {
        // Full — the widget switches to the waitlist (Phase 5).
        throw new Error('This section is full.');
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
    await getDb()
      .collection('mail')
      .add({
        to: data.email,
        template: {
          name: 'music-together-confirmation',
          data: {
            parentName: parentNames[0] ?? '',
            sectionName: section.name,
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
        },
      });

    return {
      registrationId: regRef.id,
      status: 'confirmed',
      amountChargedCents: firstChargeCents,
      scheduledChargeCount: createdCharges,
      cardLast4,
      squareReceiptUrl,
    };
  });
