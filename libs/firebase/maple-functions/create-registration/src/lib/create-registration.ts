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
 * 9. Write to `mail` collection for confirmation email
 * 10. Return registration + confirmation number
 *
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { Functions } from '@maple/firebase/functions';
import {
  ClassRepository,
  DiscountRepository,
  RegistrationRepository,
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
} from '@maple/ts/firebase/api-types';
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

export const createRegistration = Functions.endpoint
  .usingSecrets(...SQUARE_SECRET_NAMES)
  .usingStrings(...SQUARE_STRING_NAMES)
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

      // 2. Verify class exists and is open for registration
      const classEntity = await ClassRepository.findById(data.classId);
      if (!classEntity) {
        throw new Error(`Class not found: ${data.classId}`);
      }

      if (!isClassRegistrationOpen(classEntity)) {
        throw new Error('This class is not currently open for registration');
      }

      // 3. Calculate cost (with optional discount)
      const originalCostCents = classEntity.priceCents * data.quantity;
      let discountAmountCents = 0;
      let discountCode: string | undefined;

      if (data.discountCode) {
        const discount = await DiscountRepository.findByCode(data.discountCode);
        if (discount && isDiscountValid(discount)) {
          const result = applyDiscount(discount, originalCostCents);
          discountAmountCents = result.discountAmountCents;
          discountCode = data.discountCode.toUpperCase();
        }
        // Silently ignore invalid discount codes (UI already validated)
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
        // Count existing registrations for this class (pending + confirmed)
        const existingSnapshot = await transaction.get(
          db
            .collection('registrations')
            .where('classId', '==', data.classId)
            .where('status', 'in', ['pending', 'confirmed'])
        );

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

        // Reserve the spot by creating the registration with 'pending' status
        // inside the transaction so it's atomic with the capacity check
        const now = new Date();
        transaction.set(registrationDocRef, {
          classId: data.classId,
          customerEmail: data.customerEmail,
          customerName: data.customerName,
          customerPhone: data.customerPhone || null,
          quantity: data.quantity,
          pricePaidCents,
          subtotalCents,
          taxAmountCents,
          taxRatePercent,
          discountCode: discountCode || null,
          discountAmountCents: discountAmountCents || null,
          status: 'pending',
          notes: data.notes || null,
          confirmationNumber,
          createdAt: now,
          updatedAt: now,
        });
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

      // 8. Write to mail collection for confirmation email
      try {
        const formatCurrency = (cents: number): string =>
          `$${(cents / 100).toFixed(2)}`;

        await db.collection('mail').add({
          to: data.customerEmail,
          template: {
            name: 'registration-confirmation',
            data: {
              customerName: data.customerName,
              className: classEntity.name,
              classDate: (() => {
                const { dateDisplay, timeDisplay } = formatSessions(
                  classEntity.sessions,
                  'America/New_York'
                );
                return timeDisplay && timeDisplay !== 'Varies'
                  ? `${dateDisplay} \u00B7 ${timeDisplay}`
                  : dateDisplay;
              })(),
              classDuration:
                classEntity.durationMinutes >= 60
                  ? `${Math.floor(classEntity.durationMinutes / 60)} hour${Math.floor(classEntity.durationMinutes / 60) > 1 ? 's' : ''}${classEntity.durationMinutes % 60 ? ` ${classEntity.durationMinutes % 60} min` : ''}`
                  : `${classEntity.durationMinutes} minutes`,
              classLocation: classEntity.location || 'Maple & Spruce',
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
            },
          },
        });
      } catch (emailError) {
        // Don't fail the registration if email fails
        console.error('Failed to queue confirmation email:', emailError);
      }

      // 9. Fetch and return the final registration
      const registration = await RegistrationRepository.findById(
        registrationDocRef.id
      );

      if (!registration) {
        throw new Error('Registration created but could not be retrieved');
      }

      return {
        registration,
        confirmationNumber,
      };
    }
  );
