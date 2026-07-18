/**
 * Create Registration Cloud Function
 *
 * Public endpoint (no auth required - customers register themselves).
 * Handles the full registration flow:
 * 1. Validate input
 * 2. Verify class exists, is published, is in the future
 * 3. Check capacity via Firestore transaction (prevent overbooking)
 * 4. Apply discount if code provided
 * 5. Calculate sales tax
 * 6. Create Square Order with tax line item
 * 7. Process Square payment against the order
 * 8. Create registration record
 * 9. Validate required agreement signatures (if any) — before payment
 * 10. Process required agreements (upload signatures, create records) — after payment
 * 11. Auto-attach deferred agreement/waiver requests for matching class category
 * 12. Write to `mail` collection for confirmation email (with waiver link if applicable)
 * 13. Return registration + confirmation number
 *
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { Functions, isE2ETestEmail } from '@maple/firebase/functions';
import {
  ClassRepository,
  DiscountRepository,
  RegistrationRepository,
  AgreementTemplateRepository,
  AgreementRequestRepository,
  SignedAgreementRepository,
  getDb,
} from '@maple/firebase/database';
import {
  Square,
  SQUARE_SECRET_NAMES,
  SQUARE_STRING_NAMES,
  PaymentError,
} from '@maple/firebase/square';
import {
  isClassRegistrationOpen,
  applyDiscount,
  isDiscountValid,
  calculateTax,
  formatSessions,
} from '@maple/ts/domain';
import { registrationValidation } from '@maple/ts/validation';
import type {
  CreateRegistrationRequest,
  CreateRegistrationResponse,
  InlineAgreementSigningData,
} from '@maple/ts/firebase/api-types';
import type {
  AgreementTemplate,
  MediaReleaseChoice,
  PercentDiscountData,
} from '@maple/ts/domain';
import { getStorage } from 'firebase-admin/storage';
import { randomBytes } from 'crypto';

/**
 * Generate a short, human-readable confirmation number.
 * Format: MS-XXXXXX (6 uppercase alphanumeric chars)
 */
function generateConfirmationNumber(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 to avoid confusion
  const bytes = randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return `MS-${code}`;
}

/**
 * Generate a referral discount code shared via the confirmation email.
 * Distinct prefix (`FR-`) makes the code recognizable as a referral when
 * customers redeem it.
 */
function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return `FR-${code}`;
}

/**
 * Extract the first HTTPS origin from ALLOWED_ORIGINS for signing URLs.
 */
function getAppUrl(allowedOrigins: string): string {
  const origins = allowedOrigins.split(',').map((o) => o.trim());
  const httpsOrigin = origins.find((o) => o.startsWith('https://'));
  return httpsOrigin ?? origins[0] ?? 'http://localhost:3000';
}

/**
 * Upload a base64 PNG to Firebase Storage and return the file path.
 */
async function uploadSignature(
  signedAgreementId: string,
  filename: string,
  base64Data: string
): Promise<string> {
  const bucket = getStorage().bucket();
  const filePath = `agreements/${signedAgreementId}/${filename}`;
  const file = bucket.file(filePath);

  const raw = base64Data.includes(',')
    ? base64Data.split(',')[1]
    : base64Data;
  const buffer = Buffer.from(raw, 'base64');

  await file.save(buffer, {
    metadata: { contentType: 'image/png' },
  });

  return filePath;
}

/**
 * Render agreement sections into an HTML snapshot for the legal record.
 */
function renderAgreementHtml(
  templateName: string,
  sections: Array<{ title: string; content: string }>
): string {
  const sectionHtml = sections
    .map(
      (s) =>
        `<section><h2>${s.title}</h2><div>${s.content}</div></section>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head><title>${templateName}</title></head>
<body>
<h1>${templateName}</h1>
${sectionHtml}
</body>
</html>`;
}

/**
 * Validate that all required agreement templates have matching signature data.
 */
function validateRequiredAgreements(
  requiredTemplates: AgreementTemplate[],
  agreements: InlineAgreementSigningData[] | undefined
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

  // Validate each submitted agreement has required fields
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

export const createRegistration = Functions.endpoint
  .usingSecrets(...SQUARE_SECRET_NAMES)
  .usingStrings(...SQUARE_STRING_NAMES, 'ALLOWED_ORIGINS')
  .handle<CreateRegistrationRequest, CreateRegistrationResponse>(
    async (data, _context, secrets, strings) => {
      // 1. Validate input
      const validationResult = registrationValidation(data);
      if (!validationResult.isValid()) {
        const errors = validationResult.getErrors();
        const errorMessages = Object.entries(errors)
          .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
          .join('; ');
        throw new Error(`Validation failed: ${errorMessages}`);
      }

      // When the client sent the new attendees array, cross-check that
      // `quantity === 1 + additionalAttendees.length` so a stale UI can't
      // book a different number of spots than the attendees it described.
      // Callers that omit the field (legacy POS / API clients) are still
      // trusted to send a correct `quantity` directly.
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

      // 2b. Check for required agreements and validate signatures before payment
      const requiredTemplates = classEntity.categoryId
        ? await AgreementTemplateRepository.findRequiredForCategory(
            classEntity.categoryId
          )
        : [];

      if (requiredTemplates.length > 0) {
        validateRequiredAgreements(requiredTemplates, data.agreements);
      }

      // 3. Calculate cost (with optional discount)
      const originalCostCents = classEntity.priceCents * data.quantity;
      let discountAmountCents = 0;
      let discountCode: string | undefined;
      // The discount doc id (if any) is used inside the capacity transaction
      // to atomically check + increment usageCount. Looked up here so the
      // transaction body has it without a second findByCode roundtrip.
      let discountIdToRedeem: string | undefined;

      if (data.discountCode) {
        const discount = await DiscountRepository.findByCode(data.discountCode);
        // The frontend has already shown the customer a price that depends
        // on this code. If the code isn't valid at submit time, we MUST NOT
        // silently fall back to full price — the customer hasn't consented
        // to that charge. Fail the registration with a clear error so the
        // customer can refresh and retry.
        if (!discount || !isDiscountValid(discount)) {
          throw new Error(
            `Discount code "${data.discountCode}" is no longer valid. Please refresh and try again.`
          );
        }
        const result = applyDiscount(discount, {
          unitPriceCents: classEntity.priceCents,
          quantity: data.quantity,
        });
        // For quantity-tier codes that don't trigger at this quantity (e.g.,
        // "second slot 50% off" with qty=1), applyDiscount returns 0. The
        // code is structurally valid, the preview correctly showed no
        // discount, and the customer's expected price matches the no-discount
        // total — so this is fine. We just don't reserve a usage.
        if (result.discountAmountCents > 0) {
          discountAmountCents = result.discountAmountCents;
          discountCode = data.discountCode.toUpperCase();
          discountIdToRedeem = discount.id;
        }
      }

      const subtotalCents = Math.max(0, originalCostCents - discountAmountCents);

      // 4. Calculate sales tax
      const square = new Square(
        secrets as typeof secrets &
          Record<(typeof SQUARE_SECRET_NAMES)[number], string>,
        strings as typeof strings &
          Record<(typeof SQUARE_STRING_NAMES)[number], string>
      );
      const taxRatePercent = square.taxRatePercent;
      const { taxAmountCents, totalCents: pricePaidCents } = calculateTax(
        subtotalCents,
        taxRatePercent
      );

      // 5. Check capacity atomically via Firestore transaction
      //    This prevents overbooking race conditions.
      const db = getDb();
      const registrationDocRef = RegistrationRepository.getDocRef();
      const confirmationNumber = generateConfirmationNumber();

      await db.runTransaction(async (transaction) => {
        // === All reads must come before any writes ===

        // Count existing registrations for this class (pending + confirmed)
        const existingSnapshot = await transaction.get(
          db
            .collection('registrations')
            .where('classId', '==', data.classId)
            .where('status', 'in', ['pending', 'confirmed'])
        );

        // Re-read the discount inside the transaction so the usage check
        // is atomic with the increment below. Single-use codes redeemed by
        // a parallel registration will be caught here.
        const discountRef = discountIdToRedeem
          ? DiscountRepository.getDocRef(discountIdToRedeem)
          : undefined;
        const discountSnap = discountRef
          ? await transaction.get(discountRef)
          : undefined;

        // === Validation ===

        // Sum up quantities (each registration can have quantity > 1)
        const currentSpotsTaken = existingSnapshot.docs.reduce((sum, doc) => {
          return sum + (doc.data().quantity || 1);
        }, 0);

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
            throw new Error(
              'Discount code has reached its usage limit'
            );
          }
        }

        // === Writes ===

        // Reserve the spot by creating the registration with 'pending' status
        // inside the transaction so it's atomic with the capacity check
        const now = new Date();
        // Filter out empty attendee rows for storage — only keep ones the
        // user actually filled, so admin views aren't littered with blanks.
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
          createdAt: now,
          updatedAt: now,
        });

        // Atomically consume one usage of the discount. Per ADR product
        // decision, usage is NOT restored if the registration is later
        // cancelled — single-use means single-use.
        if (discountRef) {
          transaction.update(discountRef, {
            usageCount: FieldValue.increment(1),
            updatedAt: now,
          });
        }
      });

      // 6. Create Square Order and process payment
      let squarePaymentId: string | undefined;
      let squareReceiptUrl: string | undefined;
      let squareOrderId: string | undefined;
      try {
        if (subtotalCents > 0) {
          // Create Square Order with line item and tax
          const orderResult = await square.ordersService.createOrder({
            locationId: square.locationId,
            idempotencyKey: `order-${registrationDocRef.id}-${Date.now()}`,
            referenceId: registrationDocRef.id,
            lineItems: [
              {
                name: classEntity.name,
                quantity: data.quantity.toString(),
                basePriceCents: classEntity.priceCents,
              },
            ],
            taxes: [
              {
                name: 'WV Sales Tax',
                percentage: taxRatePercent.toString(),
                scope: 'ORDER',
              },
            ],
            discounts:
              discountAmountCents > 0
                ? [
                    {
                      name: discountCode || 'Discount',
                      amountCents: discountAmountCents,
                      scope: 'ORDER',
                    },
                  ]
                : undefined,
          });

          squareOrderId = orderResult.orderId;

          // Process payment against the order
          const paymentResult = await square.paymentsService.createPayment({
            sourceId: data.paymentNonce,
            amountCents: orderResult.totalCents,
            idempotencyKey: `reg-${registrationDocRef.id}-${Date.now()}`,
            locationId: square.locationId,
            buyerEmailAddress: data.customerEmail,
            note: `Registration for ${classEntity.name} - ${confirmationNumber}`,
            referenceId: registrationDocRef.id,
            orderId: squareOrderId,
          });

          squarePaymentId = paymentResult.paymentId;
          squareReceiptUrl = paymentResult.receiptUrl;
        }

        // 7. Update registration to confirmed with payment info
        await registrationDocRef.update({
          status: 'confirmed',
          squarePaymentId: squarePaymentId || null,
          squareOrderId: squareOrderId || null,
          squareReceiptUrl: squareReceiptUrl || null,
          updatedAt: new Date(),
        });
      } catch (paymentError) {
        // Payment failed - update registration to cancelled
        const errorDetail =
          paymentError instanceof Error
            ? paymentError.message
            : 'Unknown error';
        await registrationDocRef.update({
          status: 'cancelled',
          notes: `Payment failed: ${errorDetail}`,
          updatedAt: new Date(),
        });

        // Forward user-friendly message from PaymentError, or wrap generic errors
        if (paymentError instanceof PaymentError) {
          throw paymentError;
        }
        throw new PaymentError(
          'Unable to process payment. Please try again or use a different card.',
          undefined
        );
      }

      // 8. Process required agreements (signed at checkout)
      let agreementsSigned = false;
      try {
        if (requiredTemplates.length > 0 && data.agreements) {
          const templateMap = new Map(
            requiredTemplates.map((t) => [t.id, t])
          );

          for (const agreementData of data.agreements) {
            const template = templateMap.get(agreementData.templateId);
            if (!template) continue;

            const tempId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

            // Upload signature images
            const signatureImagePath = await uploadSignature(
              tempId,
              'signature.png',
              agreementData.signatureData
            );

            let guardianSignatureImagePath: string | undefined;
            if (agreementData.isMinor && agreementData.guardianSignatureData) {
              guardianSignatureImagePath = await uploadSignature(
                tempId,
                'guardian-signature.png',
                agreementData.guardianSignatureData
              );
            }

            // Create agreement request (already signed)
            const signingToken = randomBytes(32).toString('hex');
            const request = await AgreementRequestRepository.create({
              templateId: template.id,
              templateVersion: template.version,
              signerEmail: data.customerEmail,
              signerName: data.customerName,
              signerPhone: data.customerPhone,
              deliveryMethod: 'registration',
              registrationId: registrationDocRef.id,
              classId: data.classId,
              signingToken,
              expiresAt: new Date(), // Already signed, expiry irrelevant
              status: 'pending', // Will be marked signed immediately
            });

            // Create signed agreement record
            const agreementHtmlSnapshot = renderAgreementHtml(
              template.name,
              template.sections
            );

            const signedAgreement = await SignedAgreementRepository.create({
              requestId: request.id,
              templateId: template.id,
              templateVersion: template.version,
              agreementHtmlSnapshot,
              signerEmail: data.customerEmail,
              printedName: agreementData.printedName.trim(),
              signatureImagePath,
              mediaReleaseChoice: agreementData.mediaReleaseChoice as
                | MediaReleaseChoice
                | undefined,
              isMinor: agreementData.isMinor ?? false,
              minorName: agreementData.minorName,
              guardianName: agreementData.guardianName,
              guardianSignatureImagePath,
              signedAt: new Date(),
              ipAddress: 'inline-checkout',
              userAgent: 'inline-checkout',
            });

            // Rename storage files to use the actual signed agreement ID
            const bucket = getStorage().bucket();
            const newSignaturePath = `agreements/${signedAgreement.id}/signature.png`;
            await bucket.file(signatureImagePath).move(newSignaturePath);

            if (guardianSignatureImagePath) {
              const newGuardianPath = `agreements/${signedAgreement.id}/guardian-signature.png`;
              await bucket
                .file(guardianSignatureImagePath)
                .move(newGuardianPath);
            }

            // Mark request as signed
            await AgreementRequestRepository.markSigned(
              request.id,
              signedAgreement.id
            );
          }

          agreementsSigned = true;
        }
      } catch (requiredAgreementError) {
        // Log but don't fail — payment already processed
        console.error(
          'Failed to process required agreements after payment:',
          requiredAgreementError
        );
      }

      // 9. Auto-attach deferred agreement requests for this class category
      let waiverUrl: string | undefined;
      try {
        if (classEntity.categoryId) {
          const allTemplates =
            await AgreementTemplateRepository.findAutoAttachForCategory(
              classEntity.categoryId
            );

          // Only create pending requests for deferred templates
          const deferredTemplates = allTemplates.filter(
            (t) => (t.signingRequirement ?? 'deferred') === 'deferred'
          );

          if (deferredTemplates.length > 0) {
            const appUrl = getAppUrl(strings.ALLOWED_ORIGINS);

            for (const template of deferredTemplates) {
              const signingToken = randomBytes(32).toString('hex');
              const expiresAt = new Date();
              expiresAt.setDate(expiresAt.getDate() + 30);

              await AgreementRequestRepository.create({
                templateId: template.id,
                templateVersion: template.version,
                signerEmail: data.customerEmail,
                signerName: data.customerName,
                signerPhone: data.customerPhone,
                deliveryMethod: 'registration',
                registrationId: registrationDocRef.id,
                classId: data.classId,
                signingToken,
                expiresAt,
                status: 'pending',
              });

              // Use the first template's signing URL for the confirmation email
              if (!waiverUrl) {
                waiverUrl = `${appUrl}/sign/${signingToken}`;
              }
            }
          }
        }
      } catch (agreementError) {
        // Don't fail the registration if deferred agreement creation fails
        console.error(
          'Failed to create deferred agreement requests:',
          agreementError
        );
      }

      // 9b. Generate a referral code if the class opts into the program.
      // Best-effort: a failure here must NOT fail the registration — the
      // customer's class is paid for and reserved. We just won't include a
      // referral code in their email.
      let referralCode: string | undefined;
      let referralExpiresFormatted: string | undefined;
      if (classEntity.referralDiscount) {
        try {
          const { percent, expiresAfterDays } = classEntity.referralDiscount;
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + expiresAfterDays);
          const code = generateReferralCode();
          // Construct an explicit PercentDiscountData shape so TypeScript
          // can resolve the Discount discriminated union.
          const referralInput: Omit<
            PercentDiscountData,
            'id' | 'createdAt' | 'updatedAt'
          > = {
            code,
            description: `Friend referral from ${data.customerName} (${classEntity.name})`,
            type: 'percent',
            percent,
            status: 'active',
            appliesTo: 'order',
            nthSlot: 1,
            usageLimit: 1,
            usageCount: 0,
            expiresAt,
            generatedFromRegistrationId: registrationDocRef.id,
          };
          await DiscountRepository.create(referralInput);
          referralCode = code;
          referralExpiresFormatted = expiresAt.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          });
        } catch (referralError) {
          console.error(
            'Failed to generate referral code (registration unaffected):',
            referralError
          );
        }
      }

      // 10. Write to mail collection for confirmation emails.
      // The registration-e2e Pay-flow specs run against the deployed dev
      // project, whose Send Email extension delivers via real Gmail SMTP.
      // Test recipients use a non-routable `.test` TLD, so without this
      // guard every post-merge run produces a real NXDOMAIN bounce back
      // to the configured From address.
      const skipMail = isE2ETestEmail(data.customerEmail);
      if (skipMail) {
        console.log(
          `Skipping confirmation email queue for E2E test recipient ${data.customerEmail}`
        );
      }
      if (!skipMail) try {
        const formatCurrency = (cents: number): string =>
          `$${(cents / 100).toFixed(2)}`;

        const classDate = (() => {
          const { dateDisplay, timeDisplay } = formatSessions(
            classEntity.sessions,
            'America/New_York'
          );
          return timeDisplay && timeDisplay !== 'Varies'
            ? `${dateDisplay} \u00B7 ${timeDisplay}`
            : dateDisplay;
        })();
        const classDuration =
          classEntity.durationMinutes >= 60
            ? `${Math.floor(classEntity.durationMinutes / 60)} hour${Math.floor(classEntity.durationMinutes / 60) > 1 ? 's' : ''}${classEntity.durationMinutes % 60 ? ` ${classEntity.durationMinutes % 60} min` : ''}`
            : `${classEntity.durationMinutes} minutes`;
        const classLocation = classEntity.location || 'Maple & Spruce';

        // Partition attendees: those with email get their own confirmation,
        // those without become a "remind your N friends" prompt to the
        // registrant so they aren't left wondering how their friend hears about it.
        const attendeesWithEmail = additionalAttendees.filter(
          (a) => a.email && a.email.trim().length > 0
        );
        const extrasWithoutEmailCount =
          additionalAttendees.length - attendeesWithEmail.length;

        // Full roster shown in the registrant's confirmation: primary
        // purchaser first, then each additional attendee they entered.
        const attendees = [
          { name: data.customerName, email: data.customerEmail },
          ...additionalAttendees
            .map((a) => ({
              name: a.name?.trim() || undefined,
              email: a.email?.trim() || undefined,
            }))
            .filter((a) => a.name || a.email),
        ];

        await db.collection('mail').add({
          to: data.customerEmail,
          template: {
            name: 'registration-confirmation',
            data: {
              customerName: data.customerName,
              className: classEntity.name,
              classDate,
              classDuration,
              classLocation,
              confirmationNumber,
              subtotal: formatCurrency(subtotalCents),
              taxRate: taxRatePercent,
              taxAmount: formatCurrency(taxAmountCents),
              amountPaid: formatCurrency(pricePaidCents),
              quantity: data.quantity,
              receiptUrl: squareReceiptUrl?.includes('squareupsandbox.com')
                ? undefined
                : squareReceiptUrl,
              materialsIncluded: classEntity.materialsIncluded,
              whatToBring: classEntity.whatToBring,
              agreementsSigned: agreementsSigned || undefined,
              waiverUrl,
              referralCode,
              referralExpires: referralExpiresFormatted,
              referralPercent: classEntity.referralDiscount?.percent,
              extrasWithoutEmailCount:
                extrasWithoutEmailCount > 0
                  ? extrasWithoutEmailCount
                  : undefined,
              extrasWithoutEmailNoun:
                extrasWithoutEmailCount === 1 ? 'friend' : 'friends',
              attendees,
            },
          },
        });

        // Per-attendee confirmation emails (class details only, no payment).
        for (const attendee of attendeesWithEmail) {
          try {
            await db.collection('mail').add({
              to: attendee.email,
              template: {
                name: 'registration-confirmation-attendee',
                data: {
                  attendeeName: attendee.name?.trim() || undefined,
                  registrantName: data.customerName,
                  className: classEntity.name,
                  classDate,
                  classDuration,
                  classLocation,
                  materialsIncluded: classEntity.materialsIncluded,
                  whatToBring: classEntity.whatToBring,
                },
              },
            });
          } catch (attendeeEmailError) {
            console.error(
              `Failed to queue attendee confirmation email for ${attendee.email}:`,
              attendeeEmailError
            );
          }
        }
      } catch (emailError) {
        // Don't fail the registration if email fails
        console.error('Failed to queue confirmation email:', emailError);
      }

      // 11. Fetch and return the final registration
      const registration = await RegistrationRepository.findById(
        registrationDocRef.id
      );

      if (!registration) {
        throw new Error('Registration created but could not be retrieved');
      }

      return {
        registration,
        confirmationNumber,
        waiverUrl,
        agreementsSigned: agreementsSigned || undefined,
      };
    }
  );
