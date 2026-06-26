/**
 * Create Craft Club Subscription Cloud Function (public, Square)
 *
 * The signup widget's payment step. Validates the payload, re-checks the
 * approval gate server-side (never trusts the client), then in Square:
 * upserts the customer → stores the card on file → enrolls the card in the
 * $30/mo subscription plan. Finally mirrors the resulting state onto the
 * member record.
 *
 * Validation runs BEFORE any Square write so invalid data never reaches the
 * payment API and fails halfway through.
 *
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  Functions,
  throwInvalidArgument,
  throwValidationError,
  throwFailedPrecondition,
} from '@maple/firebase/functions';
import { Square, SQUARE_SECRET_NAMES, SQUARE_STRING_NAMES } from '@maple/firebase/square';
import { CraftClubMemberRepository } from '@maple/firebase/database';
import {
  isCraftClubMemberActive,
  canSubscribeToCraftClub,
} from '@maple/ts/domain';
import { craftClubMemberValidation } from '@maple/ts/validation';
import type {
  CreateCraftClubSubscriptionRequest,
  CreateCraftClubSubscriptionResponse,
} from '@maple/ts/firebase/api-types';

export const createCraftClubSubscription = Functions.endpoint
  .usingSecrets(...SQUARE_SECRET_NAMES)
  .usingStrings(...SQUARE_STRING_NAMES, 'CRAFT_CLUB_PLAN_VARIATION_ID')
  .handle<
    CreateCraftClubSubscriptionRequest,
    CreateCraftClubSubscriptionResponse
  >(async (data, _context, secrets, strings) => {
    // 1. Validate input before touching Square.
    const result = craftClubMemberValidation({
      email: data.email,
      name: data.name,
      phone: data.phone,
    });
    if (result.hasErrors()) {
      throwValidationError(result.getErrors());
    }
    if (!data.paymentNonce) {
      throwInvalidArgument('Payment information is required');
    }

    // 2. Server-side approval gate — never trust the client's eligibility check.
    const member = await CraftClubMemberRepository.findByEmail(data.email);
    if (!member) {
      throwFailedPrecondition(
        'This email is not approved for the Craft Club.'
      );
    }
    if (isCraftClubMemberActive(member)) {
      throwFailedPrecondition(
        'You already have an active Craft Club membership.'
      );
    }
    if (!canSubscribeToCraftClub(member)) {
      throwFailedPrecondition(
        'This email is not approved for the Craft Club.'
      );
    }

    const planVariationId = strings.CRAFT_CLUB_PLAN_VARIATION_ID;
    if (!planVariationId) {
      throw new Error(
        'Craft Club plan is not configured (CRAFT_CLUB_PLAN_VARIATION_ID).'
      );
    }

    const square = new Square(secrets, strings);

    // 3. Square: customer → card on file → subscription.
    const customerId =
      member.squareCustomerId ??
      (await square.customersService.upsertByEmail({
        email: data.email,
        name: data.name,
        phone: data.phone,
      }));

    const card = await square.cardsService.createCardOnFile({
      sourceId: data.paymentNonce,
      customerId,
      cardholderName: data.name,
      // Nonce is unique per tokenization, so this is unique per attempt.
      idempotencyKey: `cccard-${member.id}-${data.paymentNonce.slice(-8)}`,
    });

    const subscription = await square.subscriptionsService.create({
      planVariationId,
      customerId,
      cardId: card.cardId,
      locationId: square.locationId,
      // Keyed on the card so a re-subscribe (new card) is not de-duped to an
      // old cancelled subscription.
      idempotencyKey: `ccsub-${card.cardId}`,
    });

    // 4. Mirror Square state onto the member record.
    const updated = await CraftClubMemberRepository.update({
      id: member.id,
      status: 'active',
      squareCustomerId: customerId,
      squareCardId: card.cardId,
      squareSubscriptionId: subscription.subscriptionId,
      subscribedAt: new Date(),
      currentPeriodEndsAt: subscription.chargedThroughDate
        ? new Date(subscription.chargedThroughDate)
        : undefined,
    });

    return { member: updated, cardLast4: card.last4 };
  });
