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
import {
  Functions,
  paymentThrottles,
  isE2ETestEmail,
  reserveClassRegistration,
  processInlineAgreements,
} from '@maple/firebase/functions';
import {
  DiscountRepository,
  RegistrationRepository,
  AgreementTemplateRepository,
  AgreementRequestRepository,
  getDb,
} from '@maple/firebase/database';
import {
  Square,
  SQUARE_SECRET_NAMES,
  SQUARE_STRING_NAMES,
  PaymentError,
} from '@maple/firebase/square';
import {
  formatPrivateHour,
  cancelPageUrl,
  formatFreeCancellationDeadline,
  formatSessions,
  freeCancellationUntil,
  isPrivateHoursClass,
  lineItemName,
} from '@maple/ts/domain';
import type {
  CreateRegistrationRequest,
  CreateRegistrationResponse,
} from '@maple/ts/firebase/api-types';
import type { PercentDiscountData } from '@maple/ts/domain';
import { randomBytes } from 'crypto';
import {
  CLASS_CERTIFICATE_DISCOUNT_NAME,
  chargeWithGiftCard,
  classCertificateCoverCents,
  giftCardIdempotencyKeys,
  readUsableGiftCard,
  type UsableGiftCard,
} from './gift-card-payment';
import {
  confirmationCalendarAttachments,
  type MailAttachment,
} from './calendar-attachment';

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

export const createRegistration = Functions.endpoint
  .withAppCheck('enforce')
  .throttling('createRegistration', paymentThrottles('customerEmail'))
  .usingSecrets(...SQUARE_SECRET_NAMES)
  .usingStrings(...SQUARE_STRING_NAMES, 'ALLOWED_ORIGINS')
  .handle<CreateRegistrationRequest, CreateRegistrationResponse>(
    async (data, context, secrets, strings) => {
      const additionalAttendees = data.additionalAttendees ?? [];

      // Square is needed both for the tax rate (below) and to charge the card.
      const square = new Square(
        secrets as typeof secrets &
          Record<(typeof SQUARE_SECRET_NAMES)[number], string>,
        strings as typeof strings &
          Record<(typeof SQUARE_STRING_NAMES)[number], string>
      );

      // 0. Gift card (#301): read it from Square before holding a spot, so an
      // unknown, turned-off or empty card is refused without reserving a seat
      // or using up a single-use discount code. Only a read; nothing is
      // charged until the order exists.
      const giftCardNonce = data.giftCardNonce?.trim() || undefined;
      const giftCard: UsableGiftCard | undefined = giftCardNonce
        ? await readUsableGiftCard(square, giftCardNonce)
        : undefined;

      // 1-5. Validate, price, and atomically reserve a `pending` spot. Shared
      // with the hosted-checkout fallback so both paths reserve identically.
      const {
        registrationId,
        classEntity,
        requiredTemplates,
        confirmationNumber,
        subtotalCents,
        taxAmountCents,
        pricePaidCents,
        taxRatePercent,
        discountCode,
        discountAmountCents,
      } = await reserveClassRegistration(data, square.taxRatePercent, {
        // Ad-attribution signal only (Meta CAPI client_ip_address /
        // client_user_agent) — never authorized on.
        ip: context.ip,
        userAgent: context.userAgent,
      });

      const db = getDb();
      const registrationDocRef = RegistrationRepository.getDocRef(registrationId);

      // 6. Create Square Order and process payment
      let squarePaymentId: string | undefined;
      let squareReceiptUrl: string | undefined;
      let squareOrderId: string | undefined;
      // Set only when a gift card paid: what each source paid and the
      // studio-covered certificate amount (#301).
      let giftCardFields:
        | {
            squareGiftCardPaymentId: string;
            giftCardId: string;
            giftCardLast4: string;
            giftCardPaidCents: number;
            cardPaidCents: number;
            classCertificateCoverCents: number | null;
            pricePaidCents: number;
            taxAmountCents: number;
          }
        | undefined;
      try {
        if (subtotalCents > 0 && giftCard && giftCardNonce) {
          // Gift card checkout (#301). See gift-card-payment.ts for how the
          // money moves and how a failure is unwound.
          const coverCents = classCertificateCoverCents({
            giftCard,
            classEntity,
            subtotalCents,
          });
          const discounts = [
            ...(discountAmountCents > 0
              ? [
                  {
                    name: discountCode || 'Discount',
                    amountCents: discountAmountCents,
                    scope: 'ORDER' as const,
                  },
                ]
              : []),
            ...(coverCents > 0
              ? [
                  {
                    name: CLASS_CERTIFICATE_DISCOUNT_NAME,
                    amountCents: coverCents,
                    scope: 'ORDER' as const,
                  },
                ]
              : []),
          ];
          const orderResult = await square.ordersService.createOrder({
            locationId: square.locationId,
            idempotencyKey: giftCardIdempotencyKeys(registrationDocRef.id).order,
            referenceId: registrationDocRef.id,
            lineItems: [
              {
                name: lineItemName(classEntity, data.slotStart),
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
            discounts: discounts.length > 0 ? discounts : undefined,
          });
          squareOrderId = orderResult.orderId;

          const charge = await chargeWithGiftCard({
            square,
            registrationId: registrationDocRef.id,
            orderId: orderResult.orderId,
            orderTotalCents: orderResult.totalCents,
            giftCard,
            giftCardNonce,
            cardNonce: data.paymentNonce,
            buyerEmailAddress: data.customerEmail,
            note: `Registration for ${classEntity.name} - ${confirmationNumber}`,
          });

          // The card payment is what a card refund goes back to; when the
          // gift card paid it all, its own payment is.
          squarePaymentId = charge.cardPaymentId ?? charge.giftCardPaymentId;
          squareReceiptUrl = charge.receiptUrl;
          giftCardFields = {
            squareGiftCardPaymentId: charge.giftCardPaymentId,
            giftCardId: giftCard.card.id,
            giftCardLast4: giftCard.card.last4,
            giftCardPaidCents: charge.giftCardPaidCents,
            cardPaidCents: charge.cardPaidCents,
            classCertificateCoverCents: coverCents > 0 ? coverCents : null,
            // What the family actually paid. `subtotalCents` keeps the class
            // price after any discount code, before the certificate cover.
            pricePaidCents: charge.giftCardPaidCents + charge.cardPaidCents,
            taxAmountCents: orderResult.taxCents,
          };
        } else if (subtotalCents > 0) {
          // Create Square Order with line item and tax
          const orderResult = await square.ordersService.createOrder({
            locationId: square.locationId,
            idempotencyKey: `order-${registrationDocRef.id}-${Date.now()}`,
            referenceId: registrationDocRef.id,
            lineItems: [
              {
                name: lineItemName(classEntity, data.slotStart),
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
          ...giftCardFields,
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

      // 8. Process required agreements (signed at checkout). Shared with the
      // hosted-checkout fallback so both paths persist signatures identically.
      let agreementsSigned = false;
      try {
        agreementsSigned = await processInlineAgreements({
          registrationId: registrationDocRef.id,
          classId: data.classId,
          requiredTemplates,
          agreements: data.agreements,
          signer: {
            email: data.customerEmail,
            name: data.customerName,
            phone: data.customerPhone,
          },
        });
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
            // Earned by registering for a class, redeemable against classes.
            // Never 'music-together' — that would let a craft-class referral
            // draw down Stephanie's separate Square account.
            program: 'classes',
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
      // What was actually paid, and how, for the email (#301).
      const amountPaidCents = giftCardFields?.pricePaidCents ?? pricePaidCents;
      const taxPaidCents = giftCardFields?.taxAmountCents ?? taxAmountCents;
      if (!skipMail) try {
        const formatCurrency = (cents: number): string =>
          `$${(cents / 100).toFixed(2)}`;

        const classDate = (() => {
          // A private hour: the one hour this group booked, not every hour.
          if (data.slotStart && isPrivateHoursClass(classEntity)) {
            return formatPrivateHour(data.slotStart, classEntity.durationMinutes);
          }
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
        // Shown only while it is ahead: a booking inside the two weeks gets
        // no cancellation line at all.
        const cancelDeadline = freeCancellationUntil(
          { sessions: classEntity.sessions, slotStart: data.slotStart },
          new Date()
        );

        // Every session as an .ics, so the mail client offers "Add to
        // Calendar" whatever browser the buyer checked out in. A failure here
        // must not cost the buyer their confirmation email.
        let calendarAttachments: MailAttachment[] = [];
        try {
          calendarAttachments = confirmationCalendarAttachments(
            classEntity,
            confirmationNumber,
            data.slotStart
          );
        } catch (calendarError) {
          console.error('Failed to build confirmation .ics:', calendarError);
        }
        const calendarMessage =
          calendarAttachments.length > 0
            ? { message: { attachments: calendarAttachments } }
            : {};

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
          ...calendarMessage,
          template: {
            name: 'registration-confirmation',
            data: {
              customerName: data.customerName,
              className: classEntity.name,
              classDate,
              classDuration,
              classLocation,
              confirmationNumber,
              freeCancellationUntil: cancelDeadline
                ? formatFreeCancellationDeadline(cancelDeadline)
                : undefined,
              cancelUrl: cancelDeadline
                ? cancelPageUrl(confirmationNumber)
                : undefined,
              subtotal: formatCurrency(subtotalCents),
              taxRate: taxRatePercent,
              taxAmount: formatCurrency(taxPaidCents),
              amountPaid: formatCurrency(amountPaidCents),
              // Gift card checkout (#301): last 4 only, never the full number.
              ...(giftCardFields && {
                giftCardLast4: giftCardFields.giftCardLast4,
                giftCardPaid: formatCurrency(giftCardFields.giftCardPaidCents),
                cardPaid:
                  giftCardFields.cardPaidCents > 0
                    ? formatCurrency(giftCardFields.cardPaidCents)
                    : undefined,
                classCertificateCover: giftCardFields.classCertificateCoverCents
                  ? formatCurrency(giftCardFields.classCertificateCoverCents)
                  : undefined,
              }),
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
              ...calendarMessage,
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
