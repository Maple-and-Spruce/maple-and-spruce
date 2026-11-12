/**
 * Paying for a class with a card, without ever charging twice.
 *
 * A request to Square can fail in a way that says nothing about the payment:
 * a timeout, a dropped connection, a Square server error. The card may have
 * been charged. Telling the family "payment failed" then invites a second
 * charge when they try again.
 *
 * So the payment's idempotency key is fixed per registration, and an unknown
 * outcome is asked again with the same key: Square returns the first result
 * if there was one, and takes the payment only once. A decline is never
 * retried, since it already is an answer.
 */
import {
  isPaymentOutcomeUnknown,
  type CreatePaymentInput,
  type CreatePaymentResult,
  type Square,
} from '@maple/firebase/square';

/** Idempotency keys for one registration's card payment. Square caps them at 45 characters. */
export function cardIdempotencyKeys(registrationId: string): {
  order: string;
  payment: string;
} {
  return {
    order: `order-${registrationId}`,
    payment: `reg-${registrationId}`,
  };
}

/**
 * Take a card payment. When Square does not say whether it went through, ask
 * once more with the same key. If it is still unknown, void whatever may
 * exist under the key and rethrow.
 */
export async function chargeCard(
  square: Pick<Square, 'paymentsService'>,
  input: CreatePaymentInput
): Promise<CreatePaymentResult> {
  try {
    return await square.paymentsService.createPayment(input);
  } catch (error) {
    if (!isPaymentOutcomeUnknown(error)) throw error;
    console.warn(
      JSON.stringify({
        event: 'payment_outcome_unknown_retrying',
        referenceId: input.referenceId ?? null,
      })
    );
  }

  try {
    return await square.paymentsService.createPayment(input);
  } catch (error) {
    if (isPaymentOutcomeUnknown(error)) {
      let voided = true;
      try {
        await square.paymentsService.cancelPaymentByIdempotencyKey(
          input.idempotencyKey
        );
      } catch {
        voided = false;
      }
      // Staff should look at this one in Square: the card may have been
      // charged with no registration to show for it.
      console.error(
        JSON.stringify({
          event: 'payment_outcome_unknown',
          referenceId: input.referenceId ?? null,
          idempotencyKey: input.idempotencyKey,
          voidAccepted: voided,
        })
      );
    }
    throw error;
  }
}
