# In-Person POS Class Registration — Runbook

When a class is rung up in person on the Square POS, that sale should land in
Firestore as a `source:'pos'` registration so it counts against capacity, shows
up on the roster, and reconciles Square inventory — the same as a web checkout.

## How it works

1. A class published in the admin app is mirrored to a Square catalog item +
   variation by `syncClassToSquare` (PR A), so staff can ring it up on POS.
2. On a completed sale, Square fires a `payment.created` / `payment.updated`
   webhook to `squareWebhook`. For a `COMPLETED` payment the handler stays lean
   (no Square SDK on the webhook path) and enqueues a
   `posSaleRequests/{paymentId}` doc, then acks 200 within Square's 10-second
   delivery timeout.
3. The `processPosSale` Firestore trigger drains the queue: it fetches the
   payment + order + customer from Square, **skips web-originated orders**
   (`referenceId` → existing registration) and **already-processed orders**
   (`squareOrderId` idempotency), then creates a `source:'pos'` registration for
   each order line item that maps to a class variation.
4. Creating the registration fires `syncClassInventoryToSquare` (PR B), which
   reconciles remaining POS stock — nothing extra to do.

## Step 1 — Enable the payment webhook events (REQUIRED)

`squareWebhook` is already registered per environment, but the POS flow only
works once the payment events are turned on.

In **Square Developer Dashboard → your app → Webhooks → Subscriptions**, edit
the existing subscription in **both sandbox and production** and add:

- `payment.created`
- `payment.updated`

No new endpoint URL is needed — these route to the same `squareWebhook` handler.
Without these events enabled, in-person sales never enqueue and no POS
registration is created.

## Step 2 — Missing-email alerts

A POS sale rung up without a customer email still produces a registration
(`customerName: 'POS Sale'`, empty email), but the attendee can't get a
confirmation or reminders. In that case `processPosSale` emails the business
owner (`katie@mapleandsprucefolkarts.com`) via the `mail` collection with the
class name, quantity, amount paid, Square order/payment ids, and receipt link so
staff can collect the email and backfill the registration.

## Step 3 — Verify (sandbox first)

1. Publish a test class in the admin app; confirm it appears in the Square
   sandbox catalog (`syncClassToSquare`).
2. Ring the class up on a sandbox POS / create a sandbox payment against its
   variation.
3. Confirm a `posSaleRequests/{paymentId}` doc appears, then a
   `source:'pos'` registration on the class, and that `processedAt` is set on
   the request doc.
4. Re-deliver the same webhook (or wait for Square's retry) and confirm **no
   duplicate** registration is created (idempotency via `squareOrderId`).
