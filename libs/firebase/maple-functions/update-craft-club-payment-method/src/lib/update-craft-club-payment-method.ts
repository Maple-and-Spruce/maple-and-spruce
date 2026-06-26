/**
 * Update Craft Club Payment Method Cloud Function (public, session-gated, Square)
 *
 * Self-service card change. Stores the new card on file from a Web Payments
 * nonce, points the subscription at it, and mirrors the new card onto the
 * member record.
 *
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  Functions,
  throwInvalidArgument,
  throwFailedPrecondition,
} from '@maple/firebase/functions';
import { Square, SQUARE_SECRET_NAMES, SQUARE_STRING_NAMES } from '@maple/firebase/square';
import {
  CraftClubMemberRepository,
  CraftClubTokenRepository,
} from '@maple/firebase/database';
import { toCraftClubMemberPublicView } from '@maple/ts/domain';
import type {
  UpdateCraftClubPaymentMethodRequest,
  UpdateCraftClubPaymentMethodResponse,
} from '@maple/ts/firebase/api-types';

export const updateCraftClubPaymentMethod = Functions.endpoint
  .usingSecrets(...SQUARE_SECRET_NAMES)
  .usingStrings(...SQUARE_STRING_NAMES)
  .handle<
    UpdateCraftClubPaymentMethodRequest,
    UpdateCraftClubPaymentMethodResponse
  >(async (data, _context, secrets, strings) => {
    if (!data.paymentNonce) {
      throwInvalidArgument('Payment information is required');
    }

    const memberId = await CraftClubTokenRepository.resolveSession(
      data.sessionToken
    );
    if (!memberId) {
      throwFailedPrecondition(
        'Your session has expired. Please request a new link.'
      );
    }

    const member = await CraftClubMemberRepository.findById(memberId);
    if (!member) {
      throwFailedPrecondition('Membership not found.');
    }
    if (!member.squareSubscriptionId || !member.squareCustomerId) {
      throwFailedPrecondition('No active subscription to update.');
    }

    const square = new Square(secrets, strings);
    const card = await square.cardsService.createCardOnFile({
      sourceId: data.paymentNonce,
      customerId: member.squareCustomerId,
      cardholderName: member.name,
      idempotencyKey: `cccard-update-${member.id}-${data.paymentNonce.slice(-8)}`,
    });

    await square.subscriptionsService.updateCard(
      member.squareSubscriptionId,
      card.cardId
    );

    const updated = await CraftClubMemberRepository.update({
      id: member.id,
      squareCardId: card.cardId,
    });

    return {
      member: toCraftClubMemberPublicView(updated),
      cardLast4: card.last4,
    };
  });
