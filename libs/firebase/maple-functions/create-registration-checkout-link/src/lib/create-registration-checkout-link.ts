/**
 * Create Registration Checkout Link Cloud Function
 *
 * Public endpoint. The Safari/ITP fallback for class registration: when the
 * embedded Square Web Payments SDK can't initialize in the buyer's browser,
 * the widget calls this instead of tokenizing a card. It:
 *  1. validates + prices + atomically reserves a `pending` spot (shared
 *     reserveClassRegistration helper — identical to the inline card flow), then
 *  2. creates a Square-hosted Payment Link for that order and returns its URL.
 *
 * The buyer pays on Square's own top-level hosted page (no cross-origin iframe,
 * so ITP is irrelevant). Payment completion is reconciled by the
 * `payment.updated` webhook, which flips the `pending` registration to
 * `confirmed`. Abandoned holds are released by the stale-pending reaper.
 *
 * Deployed to us-east4 (maple-square codebase) via CI/CD.
 */
import {
  Functions,
  reserveClassRegistration,
  processInlineAgreements,
} from '@maple/firebase/functions';
import { RegistrationRepository } from '@maple/firebase/database';
import {
  Square,
  SQUARE_SECRET_NAMES,
  SQUARE_STRING_NAMES,
} from '@maple/firebase/square';
import type {
  CreateRegistrationCheckoutLinkRequest,
  CreateRegistrationCheckoutLinkResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Build the buyer's post-payment return URL. Honors the client's `returnUrl`
 * only when its origin is in the CORS allowlist (open-redirect guard), and
 * appends `?reg=<registrationId>` so the class page can look the registration
 * up and show a confirmed state. Returns undefined (Square's default
 * confirmation page) when there's no valid return URL.
 */
function buildRedirectUrl(
  returnUrl: string | undefined,
  allowedOrigins: string,
  registrationId: string
): string | undefined {
  if (!returnUrl) return undefined;
  let url: URL;
  try {
    url = new URL(returnUrl);
  } catch {
    return undefined;
  }
  const origins = allowedOrigins.split(',').map((o) => o.trim());
  if (!origins.includes(url.origin)) return undefined;
  url.searchParams.set('reg', registrationId);
  return url.toString();
}

/**
 * Release a reserved spot (flip pending -> cancelled) when we reserved but
 * couldn't hand the buyer a working checkout link, so a failed fallback attempt
 * doesn't silently hold a spot until the reaper sweeps it.
 */
async function releaseHold(
  registrationId: string,
  reason: string
): Promise<void> {
  try {
    await RegistrationRepository.getDocRef(registrationId).update({
      status: 'cancelled',
      notes: reason,
      updatedAt: new Date(),
    });
  } catch (releaseError) {
    console.error(
      `Failed to release hold for registration ${registrationId}:`,
      releaseError
    );
  }
}

export const createRegistrationCheckoutLink = Functions.endpoint
  .usingSecrets(...SQUARE_SECRET_NAMES)
  .usingStrings(...SQUARE_STRING_NAMES, 'ALLOWED_ORIGINS')
  .handle<
    CreateRegistrationCheckoutLinkRequest,
    CreateRegistrationCheckoutLinkResponse
  >(async (data, _context, secrets, strings) => {
    const square = new Square(
      secrets as typeof secrets &
        Record<(typeof SQUARE_SECRET_NAMES)[number], string>,
      strings as typeof strings &
        Record<(typeof SQUARE_STRING_NAMES)[number], string>
    );

    // Validate, price, and atomically reserve a `pending` spot (shared with the
    // inline card flow so both paths reserve identically).
    const {
      registrationId,
      classEntity,
      requiredTemplates,
      confirmationNumber,
      subtotalCents,
      taxRatePercent,
      discountCode,
      discountAmountCents,
    } = await reserveClassRegistration(data, square.taxRatePercent);

    // Persist signed agreements now — the signatures were captured in the
    // widget before this call, and the buyer is about to leave for Square's
    // hosted page (processPosSale, which confirms the payment later, has no
    // access to them). Shared with the card flow so records are identical.
    // Best-effort: a failure here must not block a buyer who already signed.
    try {
      await processInlineAgreements({
        registrationId,
        classId: data.classId,
        requiredTemplates,
        agreements: data.agreements,
        signer: {
          email: data.customerEmail,
          name: data.customerName,
          phone: data.customerPhone,
        },
      });
    } catch (agreementError) {
      console.error(
        `Failed to process agreements for hosted checkout ${registrationId}:`,
        agreementError
      );
    }

    // A free class has nothing to charge — it should never reach the hosted
    // checkout fallback (there's no card form to fail). Guard defensively and
    // release the hold rather than create a $0 payment link.
    if (subtotalCents <= 0) {
      await releaseHold(
        registrationId,
        'Hosted checkout requested for a $0 registration'
      );
      throw new Error(
        'This registration has no balance due and does not require checkout.'
      );
    }

    const redirectUrl = buildRedirectUrl(
      data.returnUrl,
      strings.ALLOWED_ORIGINS,
      registrationId
    );

    try {
      const link = await square.checkoutService.createPaymentLink({
        locationId: square.locationId,
        idempotencyKey: `checkout-${registrationId}`,
        referenceId: registrationId,
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
        buyerEmail: data.customerEmail,
        redirectUrl,
        description: `Registration for ${classEntity.name} — ${confirmationNumber}`,
      });

      return {
        checkoutUrl: link.url,
        registrationId,
        confirmationNumber,
      };
    } catch (linkError) {
      // Reserved the spot but couldn't create the link — release the hold.
      await releaseHold(
        registrationId,
        `Checkout link creation failed: ${
          linkError instanceof Error ? linkError.message : 'Unknown error'
        }`
      );
      throw linkError;
    }
  });
