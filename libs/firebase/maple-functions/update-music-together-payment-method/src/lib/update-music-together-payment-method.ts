/**
 * Update Music Together Payment Method Cloud Function (public, session-gated, MT Square)
 *
 * Self-service card change for an installment family. Vaults a new card on file
 * from a Web Payments nonce on MT's SEPARATE Square account (MT_SQUARE_KEYS),
 * points the registration's `squareCardId` at it, and disables the old card so
 * it can never be charged again.
 *
 * Overcharge safety is preserved: the Week-5 charge job reads
 * `registration.squareCardId` / `squareCustomerId` fresh at charge time, so
 * repointing the registration automatically retargets every still-pending
 * scheduled charge to the new card. The customer id is unchanged (same Square
 * customer), so scheduled charges stay valid. We never touch a charge that is
 * already `paid`/`charging`.
 *
 * Deployed to us-east4 via CI/CD (maple-square codebase).
 */
import {
  Functions,
  throwInvalidArgument,
  throwFailedPrecondition,
} from '@maple/firebase/functions';
import {
  Square,
  MT_SQUARE_SECRET_NAMES,
  MT_SQUARE_STRING_NAMES,
  MT_SQUARE_KEYS,
} from '@maple/firebase/square';
import {
  MusicTogetherRegistrationRepository,
  MusicTogetherSectionRepository,
  MusicTogetherScheduledChargeRepository,
  MusicTogetherTokenRepository,
} from '@maple/firebase/database';
import { buildMusicTogetherManageView } from './manage-view';
import type {
  UpdateMusicTogetherPaymentMethodRequest,
  UpdateMusicTogetherPaymentMethodResponse,
} from '@maple/ts/firebase/api-types';

export const updateMusicTogetherPaymentMethod = Functions.endpoint
  .usingSecrets(...MT_SQUARE_SECRET_NAMES)
  .usingStrings(...MT_SQUARE_STRING_NAMES)
  .handle<
    UpdateMusicTogetherPaymentMethodRequest,
    UpdateMusicTogetherPaymentMethodResponse
  >(async (data, _context, secrets, strings) => {
    if (!data.paymentNonce) {
      throwInvalidArgument('Payment information is required');
    }
    // Vaulting a new card on file requires the STORE-intent verification token.
    if (!data.cardVerificationToken) {
      throwInvalidArgument('Card verification is required.');
    }

    const registrationId = await MusicTogetherTokenRepository.resolveSession(
      data.sessionToken
    );
    if (!registrationId) {
      throwFailedPrecondition(
        'Your session has expired. Please request a new link.'
      );
    }

    const registration =
      await MusicTogetherRegistrationRepository.findById(registrationId);
    if (!registration) {
      throwFailedPrecondition('Registration not found.');
    }
    if (
      registration.status === 'cancelled' ||
      registration.status === 'refunded'
    ) {
      throwFailedPrecondition('This registration can no longer be managed.');
    }
    if (registration.paymentPlan !== 'installments') {
      throwFailedPrecondition(
        'This registration has no card on file to update.'
      );
    }
    if (!registration.squareCustomerId) {
      throwFailedPrecondition('No card on file to update.');
    }

    const square = new Square(secrets, strings, MT_SQUARE_KEYS);

    // Vault the new card under the SAME Square customer. The nonce is
    // single-use, so include it in the idempotency key to de-dupe retries.
    const card = await square.cardsService.createCardOnFile({
      sourceId: data.paymentNonce,
      customerId: registration.squareCustomerId,
      cardholderName: registration.parentNames[0],
      verificationToken: data.cardVerificationToken,
      idempotencyKey: `mtcard-update-${registration.id}-${data.paymentNonce.slice(-8)}`,
    });

    const previousCardId = registration.squareCardId;

    // Repoint the registration at the new card FIRST so any concurrent charge
    // job picks up the new card; only then disable the old one.
    const updated = await MusicTogetherRegistrationRepository.update({
      id: registration.id,
      squareCardId: card.cardId,
    });

    // Best-effort: detach the old card so it can never be charged again. A
    // failure here must not fail the request — the new card is already vaulted
    // and live, and a lingering disabled-but-not card is harmless.
    if (previousCardId && previousCardId !== card.cardId) {
      try {
        await square.cardsService.disableCard(previousCardId);
      } catch (err) {
        console.warn(
          `[updateMusicTogetherPaymentMethod] failed to disable old card ${previousCardId} for registration ${registration.id}: ${
            err instanceof Error ? err.message : 'unknown error'
          }`
        );
      }
    }

    const [section, charges] = await Promise.all([
      MusicTogetherSectionRepository.findById(updated.sectionId),
      MusicTogetherScheduledChargeRepository.findByRegistrationId(updated.id),
    ]);

    return {
      registration: buildMusicTogetherManageView(updated, section, charges),
      cardLast4: card.last4,
    };
  });
