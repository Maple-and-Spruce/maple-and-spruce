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
 *     queue an admin alert so staff can collect it. A line item that matches a
 *     configured lesson catalog item is instead attributed to a student —
 *     automatically when the customer email maps to exactly one student, else
 *     captured in the POS-lesson review queue for a human (#628).
 *
 * Creating the registration fires PR B's `syncClassInventoryToSquare`, which
 * reconciles remaining POS stock — nothing extra to do here for inventory.
 */
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import {
  getDb,
  ClassRepository,
  InvoiceRepository,
  PosLessonAttributionRepository,
  PosLessonConfigRepository,
  PosSaleRequestRepository,
  RegistrationRepository,
  StudentRepository,
  posLessonAttributionId,
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
 * Where the "POS sale needs an attendee email" alert goes — configured per
 * environment so lower environments never email the production inbox. Set in
 * `.env.prod` (katie@…) and `.env.dev` (katie+dev@…, filterable). Defaults to
 * the prod inbox as a fail-safe if the value is ever missing.
 */
const adminAlertEmail = defineString('ADMIN_ALERT_EMAIL', {
  default: 'katie@mapleandsprucefolkarts.com',
});

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

      // 3a. Web-order reconciliation. Web checkouts set the order's referenceId
      // to the Firestore registration id (see create-registration /
      // createRegistrationCheckoutLink). Two web sub-cases:
      //   - Inline card flow: the registration is already `confirmed` (payment
      //     happened synchronously in create-registration) → nothing to do.
      //   - Hosted-checkout fallback: the registration is still `pending` and
      //     THIS payment is what confirms it → flip it to `confirmed` with the
      //     Square payment ids. (A `cancelled` hold that the buyer paid anyway —
      //     e.g. the reaper released it just before a late completion — is also
      //     honored rather than dropping a paid registration.)
      if (order.referenceId) {
        const webReg = await RegistrationRepository.findById(order.referenceId);
        if (webReg) {
          if (webReg.status === 'pending' || webReg.status === 'cancelled') {
            await RegistrationRepository.getDocRef(webReg.id).update({
              status: 'confirmed',
              squarePaymentId: paymentId,
              squareOrderId: orderId,
              squareReceiptUrl: payment.receiptUrl ?? null,
              updatedAt: new Date(),
            });
            console.log(
              `[process-pos-sale] hosted-checkout payment=${paymentId} ` +
                `confirmed registration ${webReg.id} (was ${webReg.status})`
            );
            // TODO(hosted-checkout PR2): queue the rich confirmation email +
            // process inline agreements here for full parity with the inline
            // card flow. Square already emails the buyer its own payment
            // receipt from the hosted page in the meantime.
          }
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

      // Configured lesson catalog items (e.g. a "Guitar Lesson" POS button).
      // Lessons aren't sold as a per-student catalog item, so a lesson line
      // needs human/auto attribution rather than a class registration (#628).
      const lessonCatalogIds = new Set(
        await PosLessonConfigRepository.getLessonCatalogObjectIds()
      );

      // 5. Walk the line items. A class variation → a `source:'pos'`
      // registration. A configured lesson item → attribute to a student
      // (auto by customer email, else a review-queue entry). Everything else
      // (retail products, misc POS items) is ignored.
      let created = 0;
      let lessonsAttributed = 0;
      let lessonsPending = 0;
      for (const lineItem of order.lineItems) {
        if (!lineItem.catalogObjectId) continue;

        const classEntity = await ClassRepository.findBySquareVariationId(
          lineItem.catalogObjectId
        );
        if (!classEntity) {
          // Not a class. If it's a configured lesson item, capture/attribute
          // it; otherwise it's retail/misc and we ignore it.
          if (!lessonCatalogIds.has(lineItem.catalogObjectId)) continue;

          const attrId = posLessonAttributionId(
            paymentId,
            lineItem.catalogObjectId
          );
          if (await PosLessonAttributionRepository.findById(attrId)) {
            // Already captured on a prior run — idempotent.
            continue;
          }

          const lessonQty =
            Number.isFinite(lineItem.quantity) && lineItem.quantity > 0
              ? Math.round(lineItem.quantity)
              : 1;
          const lessonSubtotalCents =
            lineItem.grossSalesCents ??
            (lineItem.basePriceCents ?? 0) * lessonQty;
          const lessonAmountPaidCents =
            lineItem.totalCents ??
            lessonSubtotalCents + (lineItem.totalTaxCents ?? 0);
          const itemName = lineItem.name ?? 'Music lesson';
          const occurredAt = payment.createdAt
            ? new Date(payment.createdAt)
            : new Date();

          const captureInput = {
            squarePaymentId: paymentId,
            squareOrderId: orderId,
            catalogObjectId: lineItem.catalogObjectId,
            itemName,
            quantity: lessonQty,
            subtotalCents: lessonSubtotalCents,
            amountPaidCents: lessonAmountPaidCents,
            occurredAt,
            squareReceiptUrl: payment.receiptUrl,
            squareCustomerId: customerId,
            customerEmail,
            customerName,
          };

          // Auto-attribute only when the customer email maps to EXACTLY one
          // student — siblings share a parent email, so 0 or >1 matches are
          // ambiguous and go to human review.
          let didAttribute = false;
          if (customerEmail) {
            const matches =
              await StudentRepository.findByPrimaryContactEmail(customerEmail);
            if (matches.length === 1) {
              const { invoice } =
                await InvoiceRepository.settleOrCreatePosLessonInvoice({
                  studentId: matches[0].id,
                  subtotalCents: lessonSubtotalCents,
                  description: `In-person lesson — ${itemName}`,
                  squarePaymentId: paymentId,
                  squareOrderId: orderId,
                  // Auto path — no human uid.
                });
              await PosLessonAttributionRepository.capture(captureInput, {
                status: 'attributed',
                studentId: matches[0].id,
                invoiceId: invoice.id,
                attributedBy: 'auto',
              });
              didAttribute = true;
              lessonsAttributed++;
            }
          }

          if (!didAttribute) {
            await PosLessonAttributionRepository.capture(captureInput);
            lessonsPending++;
            // Alert staff that an in-person lesson sale needs a student.
            await db.collection('mail').add({
              to: adminAlertEmail.value(),
              message: {
                subject: `POS lesson sale needs attribution — ${itemName}`,
                text: [
                  'An in-person POS lesson sale could not be matched to a student automatically.',
                  '',
                  `Item: ${itemName}`,
                  `Amount paid: ${formatCurrency(lessonAmountPaidCents)}`,
                  customerEmail ? `Customer email: ${customerEmail}` : 'No customer email on the sale',
                  `Square order: ${orderId}`,
                  `Square payment: ${paymentId}`,
                  payment.receiptUrl ? `Receipt: ${payment.receiptUrl}` : '',
                  '',
                  'Open the POS lesson review queue in the admin app to pick the student.',
                ]
                  .filter((line) => line !== '')
                  .join('\n'),
              },
            });
          }
          continue;
        }

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
            to: adminAlertEmail.value(),
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
        `[process-pos-sale] payment=${paymentId} order=${orderId} ` +
          `created=${created} registration(s) ` +
          `lessons(attributed=${lessonsAttributed}, pending=${lessonsPending})`
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
