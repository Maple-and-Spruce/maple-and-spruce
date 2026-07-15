/**
 * Process POS Sale
 *
 * Firestore-triggered worker for `posSaleRequests/{paymentId}` docs enqueued
 * by the lean `squareWebhook` handler on a COMPLETED `payment.created`/
 * `payment.updated` event. Mirrors the `processCatalogSyncRequest`
 * defer-to-worker pattern: the webhook must ack within Square's 10-second
 * timeout and must not pull the Square SDK into its codebase, so the heavy
 * work — fetch payment/order/customer from Square, dedup, create the
 * registration(s), alert the admin on a missing email — happens here.
 *
 * Flow:
 *  1. Skip already-processed docs (the trigger re-fires on our own
 *     markProcessed write).
 *  2. Fetch the payment; skip if it isn't COMPLETED or has no order.
 *  3. Fetch the order.
 *  4. Dedup: skip web-originated orders (referenceId → existing registration)
 *     and orders already turned into a registration (squareOrderId).
 *  5. For each order line item that maps to a class variation, create a
 *     `source:'pos'` registration. When the sale carried no customer email,
 *     queue an admin alert so staff can collect it.
 *
 * Creating the registration fires PR B's `syncClassInventoryToSquare`, which
 * reconciles remaining POS stock — nothing extra to do here for inventory.
 */
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import {
  getDb,
  ClassRepository,
  PosSaleRequestRepository,
  RegistrationRepository,
} from '@maple/firebase/database';
import {
  Square,
  SQUARE_SECRET_NAMES,
  SQUARE_STRING_NAMES,
} from '@maple/firebase/square';
import { calculateTax } from '@maple/ts/domain';

const squareSecretParams = SQUARE_SECRET_NAMES.map((name) => defineSecret(name));
const squareStringParams = SQUARE_STRING_NAMES.map((name) => defineString(name));

/**
 * Where the "POS sale needs an attendee email" alert goes. This is the
 * business owner's inbox — the same address used as the global git identity
 * for the maple-and-spruce projects. There is no dedicated admin-notification
 * env var in this repo yet; if one is added, swap this constant for it.
 */
const ADMIN_EMAIL = 'katie@mapleandsprucefolkarts.com';

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export const processPosSale = onDocumentWritten(
  {
    document: 'posSaleRequests/{paymentId}',
    region: 'us-east4',
    memory: '512MiB',
    secrets: squareSecretParams,
  },
  async (event) => {
    const after = event.data?.after.data();
    if (!after) {
      // Doc deleted — nothing to do.
      return;
    }

    // Idempotency: the markProcessed write below re-fires this trigger. If the
    // doc is already processed, exit before doing any Square work.
    if (after.processedAt) {
      return;
    }

    const paymentId = event.params.paymentId;

    const secrets = Object.fromEntries(
      squareSecretParams.map((s) => [s.name, s.value()])
    ) as Record<(typeof SQUARE_SECRET_NAMES)[number], string>;
    const strings = Object.fromEntries(
      squareStringParams.map((s) => [s.name, s.value()])
    ) as Record<(typeof SQUARE_STRING_NAMES)[number], string>;

    const square = new Square(secrets, strings);
    const db = getDb();

    try {
      // 1. Fetch the payment. Only COMPLETED payments represent a settled sale.
      const payment = await square.paymentsService.getPayment(paymentId);
      if (payment.status !== 'COMPLETED') {
        await PosSaleRequestRepository.markProcessed(paymentId);
        return;
      }

      const orderId = payment.orderId ?? (after.orderId as string | undefined);
      if (!orderId) {
        // No order attached (e.g. a bare payment) — nothing to register.
        await PosSaleRequestRepository.markProcessed(paymentId);
        return;
      }

      // 2. Fetch the order (line items, referenceId, customer).
      const order = await square.ordersService.getOrder(orderId);

      // 3a. Web-order dedup. Web checkouts set the order's referenceId to the
      // Firestore registration id (see create-registration). If that
      // registration exists, this order was born on the web — the registration
      // already exists, so do NOT create a duplicate here.
      if (order.referenceId) {
        const webReg = await RegistrationRepository.findById(order.referenceId);
        if (webReg) {
          await PosSaleRequestRepository.markProcessed(paymentId);
          return;
        }
      }

      // 3b. Idempotency dedup. If any registration already carries this
      // squareOrderId, this order was already processed (a prior worker run) —
      // skip.
      const existing = await RegistrationRepository.findBySquareOrderId(orderId);
      if (existing) {
        await PosSaleRequestRepository.markProcessed(paymentId);
        return;
      }

      // 4. Resolve the buyer once (payment/order may share a customer id).
      const customerId = payment.customerId ?? order.customerId;
      let customerEmail: string | undefined;
      let customerName: string | undefined;
      if (customerId) {
        const cust = await square.customersService.get(customerId);
        if (cust) {
          customerEmail = cust.emailAddress;
          const name = [cust.givenName, cust.familyName]
            .filter((p) => p && p.trim().length > 0)
            .join(' ')
            .trim();
          customerName = name.length > 0 ? name : undefined;
        }
      }

      const taxRatePercent = square.taxRatePercent;

      // 5. Create one registration per line item that maps to a class. Line
      // items that don't map (retail products, misc POS items) are ignored.
      let created = 0;
      for (const lineItem of order.lineItems) {
        if (!lineItem.catalogObjectId) continue;

        const classEntity = await ClassRepository.findBySquareVariationId(
          lineItem.catalogObjectId
        );
        if (!classEntity) continue;

        const quantity =
          Number.isFinite(lineItem.quantity) && lineItem.quantity > 0
            ? Math.round(lineItem.quantity)
            : 1;

        // Prefer the ACTUAL amounts Square charged for this line item when
        // present (grossSales/tax/total money) — Square is the source of truth
        // for a POS sale, so a cashier's discount or price override is reflected
        // faithfully. Fall back to reconstructing the subtotal from the class
        // price (or the line item's base price) times quantity and applying the
        // configured tax rate — the same subtotal → calculateTax → pricePaid
        // pipeline create-registration uses — only when Square omits the money
        // fields. `taxRatePercent` stays the configured rate for reporting.
        const unitPriceCents =
          classEntity.priceCents || lineItem.basePriceCents || 0;
        const subtotalCents = lineItem.grossSalesCents ?? unitPriceCents * quantity;
        const taxAmountCents =
          lineItem.totalTaxCents ??
          calculateTax(subtotalCents, taxRatePercent).taxAmountCents;
        const pricePaidCents =
          lineItem.totalCents ?? subtotalCents + taxAmountCents;

        await RegistrationRepository.create({
          classId: classEntity.id,
          customerEmail: customerEmail ?? '',
          customerName: customerName ?? 'POS Sale',
          quantity,
          pricePaidCents,
          subtotalCents,
          taxAmountCents,
          taxRatePercent,
          status: 'confirmed',
          source: 'pos',
          squareOrderId: orderId,
          squarePaymentId: paymentId,
          squareReceiptUrl: payment.receiptUrl,
        });
        created++;

        // No email on the sale → the attendee can't get a confirmation or
        // reminders. Alert the admin so they can collect it in person / by
        // phone and backfill the registration.
        if (!customerEmail) {
          await db.collection('mail').add({
            to: ADMIN_EMAIL,
            message: {
              subject: `POS class sale needs an attendee email — ${classEntity.name}`,
              text: [
                'An in-person POS class sale was registered without a customer email.',
                '',
                `Class: ${classEntity.name}`,
                `Quantity: ${quantity}`,
                `Amount paid: ${formatCurrency(pricePaidCents)}`,
                `Square order: ${orderId}`,
                `Square payment: ${paymentId}`,
                payment.receiptUrl ? `Receipt: ${payment.receiptUrl}` : '',
                '',
                'Collect the attendee email and add it to the registration so they receive confirmations and reminders.',
              ]
                .filter((line) => line !== '')
                .join('\n'),
              html: [
                '<p>An in-person POS class sale was registered without a customer email.</p>',
                '<ul>',
                `<li><strong>Class:</strong> ${classEntity.name}</li>`,
                `<li><strong>Quantity:</strong> ${quantity}</li>`,
                `<li><strong>Amount paid:</strong> ${formatCurrency(pricePaidCents)}</li>`,
                `<li><strong>Square order:</strong> ${orderId}</li>`,
                `<li><strong>Square payment:</strong> ${paymentId}</li>`,
                payment.receiptUrl
                  ? `<li><strong>Receipt:</strong> <a href="${payment.receiptUrl}">${payment.receiptUrl}</a></li>`
                  : '',
                '</ul>',
                '<p>Collect the attendee email and add it to the registration so they receive confirmations and reminders.</p>',
              ]
                .filter((line) => line !== '')
                .join('\n'),
            },
          });
        }
      }

      console.log(
        `[process-pos-sale] payment=${paymentId} order=${orderId} created=${created} registration(s)`
      );

      await PosSaleRequestRepository.markProcessed(paymentId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[process-pos-sale] failed for payment ${paymentId}:`,
        message
      );
      // Record the failure (does NOT set processedAt) and re-throw so the
      // trigger retries, mirroring processCatalogSyncRequest's error handling.
      await PosSaleRequestRepository.markFailed(paymentId, message);
      throw err;
    }
  }
);
