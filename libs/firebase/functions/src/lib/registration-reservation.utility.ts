/**
 * Shared class-registration reservation.
 *
 * Both payment paths must reserve a class spot identically before taking money:
 *  - `createRegistration` (inline Web Payments SDK card nonce, charged
 *    synchronously), and
 *  - `createRegistrationCheckoutLink` (Square-hosted Payment Link — the
 *    Safari/ITP fallback — confirmed later by the `payment.updated` webhook).
 *
 * This helper owns the capacity-critical, shared portion of that flow:
 *   1. validate input,
 *   2. verify the class is open,
 *   3. validate required agreement signatures,
 *   4. price the order (discount + tax),
 *   5. atomically reserve the spot by writing a `pending` registration inside
 *      the same Firestore transaction as the capacity check (and consume a
 *      discount usage).
 *
 * A `pending` registration already counts against capacity
 * (`RegistrationRepository.countByClassId` includes `pending`), so writing it
 * here IS the spot hold. Each caller then does its own payment step and flips
 * the registration to `confirmed` (card flow synchronously; hosted flow via
 * webhook). Abandoned hosted holds are released by the stale-pending reaper.
 *
 * Keeping this single-sourced prevents the two flows' capacity logic from
 * diverging — divergence there would mean overbooking.
 */
import { FieldValue } from 'firebase-admin/firestore';
import {
  ClassRepository,
  DiscountRepository,
  RegistrationRepository,
  AgreementTemplateRepository,
  getDb,
} from '@maple/firebase/database';
import {
  isClassRegistrationOpen,
  applyDiscount,
  isDiscountValid,
  calculateTax,
} from '@maple/ts/domain';
import { registrationValidation } from '@maple/ts/validation';
import type { CreateRegistrationRequest } from '@maple/ts/firebase/api-types';
import type { AgreementTemplate, Class } from '@maple/ts/domain';
import { randomBytes } from 'crypto';

/**
 * The subset of a registration request needed to validate, price, and reserve
 * a spot — everything except the payment credential. The inline card flow
 * (which additionally has a `paymentNonce`) and the hosted-checkout flow (which
 * has none) both satisfy this shape, so both reserve through the same helper.
 */
export type RegistrationReservationInput = Omit<
  CreateRegistrationRequest,
  'paymentNonce'
>;

/**
 * Browser context the callable captured from the HTTP request, forwarded so
 * the Meta CAPI `Purchase` trigger can send `client_ip_address` /
 * `client_user_agent` for probabilistic matching.
 *
 * Ad-attribution signal ONLY — never authorize or price anything off these.
 */
export interface RegistrationClientContext {
  ip?: string;
  userAgent?: string;
}

/**
 * Generate a short, human-readable confirmation number.
 * Format: MS-XXXXXX (6 uppercase alphanumeric chars, no I/O/0/1).
 */
export function generateConfirmationNumber(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return `MS-${code}`;
}

/**
 * Validate that all required agreement templates have matching signature data.
 * Shared by both payment paths — a class with required agreements must not
 * reach checkout (inline or hosted) without them signed.
 */
export function validateRequiredAgreements(
  requiredTemplates: AgreementTemplate[],
  agreements: RegistrationReservationInput['agreements']
): void {
  if (requiredTemplates.length === 0) return;

  if (!agreements || agreements.length === 0) {
    throw new Error(
      'Required agreements must be signed before checkout can complete'
    );
  }

  const submittedIds = new Set(agreements.map((a) => a.templateId));
  const missingTemplates = requiredTemplates.filter(
    (t) => !submittedIds.has(t.id)
  );

  if (missingTemplates.length > 0) {
    const names = missingTemplates.map((t) => t.name).join(', ');
    throw new Error(
      `The following agreements must be signed before checkout: ${names}`
    );
  }

  for (const agreement of agreements) {
    if (!agreement.signatureData) {
      throw new Error('Signature is required for all agreements');
    }
    if (!agreement.printedName?.trim()) {
      throw new Error('Printed name is required for all agreements');
    }
    if (agreement.isMinor) {
      if (!agreement.minorName?.trim()) {
        throw new Error("Minor's name is required");
      }
      if (!agreement.guardianName?.trim()) {
        throw new Error('Parent/guardian name is required');
      }
      if (!agreement.guardianSignatureData) {
        throw new Error('Parent/guardian signature is required');
      }
    }
  }
}

/** Priced, reserved registration — everything both payment paths need next. */
export interface ReserveRegistrationResult {
  /** Firestore id of the newly-written `pending` registration (== Square referenceId). */
  registrationId: string;
  /** The class being registered for. */
  classEntity: Class;
  /** Required agreement templates for the class category (for post-reserve processing). */
  requiredTemplates: AgreementTemplate[];
  /** Human-readable confirmation number stamped on the registration. */
  confirmationNumber: string;
  /** Pre-tax, post-discount subtotal in cents. */
  subtotalCents: number;
  /** Tax charged in cents. */
  taxAmountCents: number;
  /** Grand total in cents (subtotal + tax). */
  pricePaidCents: number;
  /** Tax rate applied, as a percentage. */
  taxRatePercent: number;
  /** Normalized (uppercased) discount code actually applied, if any. */
  discountCode?: string;
  /** Discount amount applied in cents (0 if none). */
  discountAmountCents: number;
}

/**
 * Validate, price, and atomically reserve a `pending` class registration.
 *
 * Throws on validation failure, a closed class, missing required agreements,
 * an invalid/expired discount, or insufficient capacity — in every case
 * WITHOUT writing anything (the capacity check and the write share one
 * transaction). On success the `pending` registration exists and holds the
 * spot; the caller is responsible for taking payment and confirming it.
 *
 * @param data          the registration request (same shape both flows use)
 * @param taxRatePercent the sales-tax rate (from Square config)
 */
export async function reserveClassRegistration(
  data: RegistrationReservationInput,
  taxRatePercent: number,
  clientContext: RegistrationClientContext = {}
): Promise<ReserveRegistrationResult> {
  // 1. Validate input
  const validationResult = registrationValidation(data);
  if (!validationResult.isValid()) {
    const errors = validationResult.getErrors();
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  // Cross-check quantity vs. the attendees array when the client sent it, so a
  // stale UI can't book a different number of spots than it described.
  const additionalAttendees = data.additionalAttendees ?? [];
  if (
    data.additionalAttendees !== undefined &&
    data.quantity !== 1 + additionalAttendees.length
  ) {
    throw new Error(
      `Quantity (${data.quantity}) must equal 1 + additionalAttendees.length (${1 + additionalAttendees.length}).`
    );
  }

  // 2. Verify class exists and is open for registration
  const classEntity = await ClassRepository.findById(data.classId);
  if (!classEntity) {
    throw new Error(`Class not found: ${data.classId}`);
  }
  if (!isClassRegistrationOpen(classEntity)) {
    throw new Error('This class is not currently open for registration');
  }

  // 3. Required agreements must be signed before checkout (inline or hosted)
  const requiredTemplates = classEntity.categoryId
    ? await AgreementTemplateRepository.findRequiredForCategory(
        classEntity.categoryId
      )
    : [];
  if (requiredTemplates.length > 0) {
    validateRequiredAgreements(requiredTemplates, data.agreements);
  }

  // 4. Price the order (optional discount, then tax)
  const originalCostCents = classEntity.priceCents * data.quantity;
  let discountAmountCents = 0;
  let discountCode: string | undefined;
  let discountIdToRedeem: string | undefined;

  if (data.discountCode) {
    const discount = await DiscountRepository.findByCode(data.discountCode);
    // The customer was shown a price that depends on this code; if it's no
    // longer valid at submit time we must NOT silently charge full price.
    if (!discount || !isDiscountValid(discount)) {
      throw new Error(
        `Discount code "${data.discountCode}" is no longer valid. Please refresh and try again.`
      );
    }
    const result = applyDiscount(discount, {
      unitPriceCents: classEntity.priceCents,
      quantity: data.quantity,
    });
    if (result.discountAmountCents > 0) {
      discountAmountCents = result.discountAmountCents;
      discountCode = data.discountCode.toUpperCase();
      discountIdToRedeem = discount.id;
    }
  }

  const subtotalCents = Math.max(0, originalCostCents - discountAmountCents);
  const { taxAmountCents, totalCents: pricePaidCents } = calculateTax(
    subtotalCents,
    taxRatePercent
  );

  // 5. Reserve the spot atomically (capacity check + write share one txn)
  const db = getDb();
  const registrationDocRef = RegistrationRepository.getDocRef();
  const confirmationNumber = generateConfirmationNumber();

  await db.runTransaction(async (transaction) => {
    // === Reads before writes ===
    const existingSnapshot = await transaction.get(
      db
        .collection('registrations')
        .where('classId', '==', data.classId)
        .where('status', 'in', ['pending', 'confirmed'])
    );

    const discountRef = discountIdToRedeem
      ? DiscountRepository.getDocRef(discountIdToRedeem)
      : undefined;
    const discountSnap = discountRef
      ? await transaction.get(discountRef)
      : undefined;

    // === Validation ===
    const currentSpotsTaken = existingSnapshot.docs.reduce(
      (sum, doc) => sum + (doc.data().quantity || 1),
      0
    );
    const spotsNeeded = data.quantity;
    if (currentSpotsTaken + spotsNeeded > classEntity.capacity) {
      const spotsRemaining = classEntity.capacity - currentSpotsTaken;
      throw new Error(
        spotsRemaining <= 0
          ? 'This class is full'
          : `Only ${spotsRemaining} spot${spotsRemaining === 1 ? '' : 's'} remaining`
      );
    }

    if (discountRef && discountSnap) {
      const fresh = discountSnap.data();
      if (!fresh || fresh.status !== 'active') {
        throw new Error('Discount code is no longer available');
      }
      const expiresAt = fresh.expiresAt?.toDate?.() ?? fresh.expiresAt;
      if (expiresAt && new Date() > new Date(expiresAt)) {
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

    // === Writes ===
    const now = new Date();
    const persistedAttendees = additionalAttendees
      .map((a) => ({
        name: a.name?.trim() || undefined,
        email: a.email?.trim() || undefined,
      }))
      .filter((a) => a.name || a.email);

    transaction.set(registrationDocRef, {
      classId: data.classId,
      customerEmail: data.customerEmail,
      customerName: data.customerName,
      customerPhone: data.customerPhone || null,
      quantity: data.quantity,
      additionalAttendees:
        persistedAttendees.length > 0 ? persistedAttendees : null,
      pricePaidCents,
      subtotalCents,
      taxAmountCents,
      taxRatePercent,
      discountCode: discountCode || null,
      discountAmountCents: discountAmountCents || null,
      status: 'pending',
      source: 'web',
      notes: data.notes || null,
      confirmationNumber,
      // Meta ad-attribution, captured by the widget / HTTP request. Read by
      // `sendRegistrationConversion` when the doc flips to `confirmed`. Stored
      // as explicit nulls (not omitted) so the field set is stable across the
      // inline and hosted-checkout paths.
      fbp: data.metaAttribution?.fbp || null,
      fbc: data.metaAttribution?.fbc || null,
      eventSourceUrl: data.metaAttribution?.eventSourceUrl || null,
      clientIp: clientContext.ip || null,
      clientUserAgent: clientContext.userAgent || null,
      createdAt: now,
      updatedAt: now,
    });

    // Consume one discount usage atomically. Per product decision usage is
    // NOT restored on later cancellation — single-use means single-use.
    if (discountRef) {
      transaction.update(discountRef, {
        usageCount: FieldValue.increment(1),
        updatedAt: now,
      });
    }
  });

  return {
    registrationId: registrationDocRef.id,
    classEntity,
    requiredTemplates,
    confirmationNumber,
    subtotalCents,
    taxAmountCents,
    pricePaidCents,
    taxRatePercent,
    discountCode,
    discountAmountCents,
  };
}
