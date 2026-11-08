/**
 * `giftCards/previewGiftCardForClass` (#301): what a gift card would pay
 * toward a class, shown when a family presses Apply at checkout.
 *
 * Public (the family is not signed in). Prices the order with the same
 * function the checkout reserves with (`priceClassOrder`) and the same
 * certificate rule `createRegistration` charges with, so the preview and the
 * charge agree. Nothing is charged or held here.
 */
import {
  type FunctionContext,
  priceClassOrder,
  throwInvalidArgument,
} from '@maple/firebase/functions';
import { ClassRepository } from '@maple/firebase/database';
import {
  Square,
  type SquareSecrets,
  type SquareStrings,
} from '@maple/firebase/square';
import {
  classCertificateCoverCents,
  readUsableGiftCard,
} from '@maple/firebase/maple-functions/create-registration';
import {
  isClassRegistrationOpen,
  splitGiftCardPayment,
} from '@maple/ts/domain';
import type {
  PreviewGiftCardForClassRequest,
  PreviewGiftCardForClassResponse,
} from '@maple/ts/firebase/api-types';

export async function previewGiftCardForClass(
  data: PreviewGiftCardForClassRequest,
  _context: FunctionContext,
  secrets: SquareSecrets,
  strings: SquareStrings
): Promise<PreviewGiftCardForClassResponse> {
  if (!data?.giftCardNonce) throwInvalidArgument('Gift card is required');
  if (!data.classId) throwInvalidArgument('Class ID is required');
  if (!Number.isInteger(data.quantity) || data.quantity < 1) {
    throwInvalidArgument('Quantity must be at least 1');
  }

  const classEntity = await ClassRepository.findById(data.classId);
  if (!classEntity) throw new Error(`Class not found: ${data.classId}`);
  if (!isClassRegistrationOpen(classEntity)) {
    throw new Error('This class is not open for registration');
  }

  const square = new Square(secrets, strings);
  const giftCard = await readUsableGiftCard(square, data.giftCardNonce);

  // An unknown code is left off, as the cost summary does; the checkout
  // itself refuses it.
  const price = await priceClassOrder(
    classEntity,
    { quantity: data.quantity, discountCode: data.discountCode },
    square.taxRatePercent,
    { onInvalidDiscount: 'ignore' }
  );

  const split = splitGiftCardPayment({
    subtotalCents: price.subtotalCents,
    taxRatePercent: square.taxRatePercent,
    balanceCents: giftCard.card.balanceCents,
    classCertificateCoverCents: classCertificateCoverCents({
      giftCard,
      classEntity,
      subtotalCents: price.subtotalCents,
    }),
  });

  return {
    last4: giftCard.card.last4,
    balanceCents: giftCard.card.balanceCents,
    classCertificateCoverCents: split.classCertificateCoverCents,
    subtotalCents: price.subtotalCents,
    taxAmountCents: split.taxAmountCents,
    totalCents: split.totalCents,
    giftCardAmountCents: split.giftCardAmountCents,
    leftToPayCents: split.leftToPayCents,
  };
}
