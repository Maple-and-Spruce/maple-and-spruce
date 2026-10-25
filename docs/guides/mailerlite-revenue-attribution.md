# MailerLite revenue attribution

Confirmed class registrations are recorded as **orders** in a MailerLite shop, so each
newsletter campaign shows the registrations and revenue it earned (#262).

## How it works

1. A campaign goes out with **"Track links"** turned on (MailerLite's e-commerce tracking; the
   API calls it `settings.ecommerce_tracking`).
2. A subscriber registers and pays. When the registration flips `pending → confirmed`,
   `sendRegistrationConversion` (the same trigger that sends Meta CAPI and GA4) upserts the
   class as a MailerLite product and sends the order.
3. MailerLite matches the order's email to a subscriber who received and clicked the campaign,
   sets the order's `attribution` to `{ type: "campaign", email_id }`, and adds the sale to the
   campaign report.

Verified end to end on 2026-10-23 (see below). Two things the test showed:

- **The credit comes from the email address, not the browser.** The tracked link redirects to
  the plain page URL with no subscriber id, and the test order was credited even though it was
  placed on a different site from the one the link opened. Ordinary links in a campaign are
  enough; product blocks are not required.
- **Treat campaign revenue as an upper bound.** Any registration from a recent recipient of a
  tracked campaign gets credited to it, including ones that would have happened anyway.

The universal script is still on the site (site-wide head code), since MailerLite documents it
as part of the setup.

Same rule as Meta and GA4: paid **web** registrations only, once per confirmation. POS sales and
$0 registrations are skipped.

## Guarantees

| | How |
|---|---|
| An order never adds anyone to the mailing list | `create_subscriber: false`, `accepts_marketing` omitted. Checked against the live API: an order for a non-subscriber leaves them a non-subscriber. |
| A retry never counts one sale twice | Order `resource_id` = confirmation number. MailerLite rejects a repeat create (422 "already exists"), and the client then updates that order. |
| MailerLite being down never affects the registration, Meta or GA4 | Its own branch of the `Promise.all`; every error is logged and swallowed; 5s timeout. |

## Configuration

| Name | Kind | Dev | Prod |
|---|---|---|---|
| `MAILERLITE_API_KEY` | `defineSecret` (Secret Manager, **both** projects) | MailerLite → Integrations → API | same account |
| `MAILERLITE_SHOP_ID` | `.env.dev` / `.env.prod` | `189112` ("Maple & Spruce (dev)") | `189210` ("Maple & Spruce"); empty turns it off |
| `MAILERLITE_BASE_URL` | `.env.*` | `https://connect.mailerlite.com` | same |

Dev and prod share **one** MailerLite account, so each environment has its own shop. Test orders
from dev land in the dev shop and never in real campaign reports.

The secret must exist in each project before the PR that adds it merges, or the maple-core deploy
fails. One key works for both, since it is one account:

```bash
firebase functions:secrets:set MAILERLITE_API_KEY --project maple-and-spruce-dev
firebase functions:secrets:set MAILERLITE_API_KEY --project maple-and-spruce
```

## Turning it on in prod

All done:

1. Prod shop `189210` (`https://mapleandsprucefolkarts.com`, USD, custom platform, pop-ups off),
   created 2026-10-22.
2. MailerLite's universal script (account `2209619`) at the end of the Webflow site-wide head
   code, published 2026-10-23. Loads on staging and the live site with no pop-ups.
3. "Turn on Track links" is step 6 of the drafting workflow in the newsletter playbook. It is
   **off by default on every new campaign** and can only be switched in the dashboard (bottom of
   the campaign's Details step), not through the API.

## Verifying end to end (dev)

Done 2026-10-23, and repeatable the same way:

1. Put a staff inbox in a new one-person group, create a campaign to that group with one link,
   turn on Track links, and send it.
2. Click the link in the email.
3. Seed a **future-dated** priced class in dev Firestore and register for it with the same email
   on the registration test site, `https://maple-spruce-registration-test.web.app/?classId=<id>`
   (backend: dev), paying with a Square sandbox card.
   **Do not register on the staging `webflow.io` site:** it runs the prod widgets, so that would
   be a real sale.
4. List orders in the dev shop (`189112`): the order has `attribution.type: "campaign"` and the
   test campaign's `email_id`, and the campaign report shows the order and total.
5. Delete the class, registration, test order and product, group and campaign.

Result on 2026-10-23: one order of $47.70 credited to the test campaign; the subscriber's status
and groups were unchanged by the order.

Gotchas from that run:

- Gmail's link scanner registers a click seconds after the send (it showed on the Unsubscribe
  row). It did not unsubscribe anyone. Per-link click counts were unreliable.
- The automated registration E2E tests also create orders in the dev shop (`@maplespruce.test`
  buyers). That is expected and stays out of prod reports.

## What is sent, by program (#262 Phase 3)

All three programs share one shop per environment, so campaign reports add them up.

| Program | Sent when | Order id | Value | On refund |
|---|---|---|---|---|
| Craft classes (`sendRegistrationConversion`) | a paid **web** registration becomes `confirmed` | confirmation number (`MS-…`) | price paid, tax included | total drops to what was kept when `refundedAmountCents` grows; the order is deleted when the status becomes `refunded` |
| Music Together (`sendMusicTogetherConversion`) | an MT registration becomes `confirmed` | `mt-<registration id>` | full committed tuition, same as Meta | deleted on `confirmed → refunded`. A `cancelled` enrollment that refunded nothing keeps its order. The $25 fee kept on a pre-class refund is not counted. |
| Craft Club (`createCraftClubSubscription`) | a member subscribes | `craftclub-<Square subscription id>` | first month ($30) | not applicable. Renewals are not sent, and a re-subscribe is a new subscription, so a new sale. |

Products are upserted per order: the class id, `mt-section-<section id>`, or
`craft-club-membership`. The Craft Club call runs inside the signup callable, capped at
3 seconds, and never fails the signup. A refund on an order that was never sent (shop off at the
time, or a failed send) is a 404 and is ignored.

Not covered: refunds on the Music Together Square account made in the Square dashboard (the
webhook does not handle that account), and Music Together installments 2..N (already inside the
committed value).
