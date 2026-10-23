# MailerLite revenue attribution

Confirmed class registrations are recorded as **orders** in a MailerLite shop, so each
newsletter campaign shows the registrations and revenue it earned (#262).

## How it works

1. A subscriber clicks a campaign link that has **e-commerce link tracking** turned on.
2. MailerLite's universal script on the Webflow site records the visit.
3. They register and pay. When the registration flips `pending → confirmed`,
   `sendRegistrationConversion` (the same trigger that sends Meta CAPI and GA4) upserts the
   class as a MailerLite product and sends the order. MailerLite matches the order's email to
   the click and sets the order's `attribution` to the campaign.

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

1. ~~Create the prod shop~~ Done 2026-10-22: `189210`, `https://mapleandsprucefolkarts.com`,
   USD, custom platform, pop-ups off.
2. Add MailerLite's universal script (Sites → Integrations → JavaScript snippet, with
   `ml('account', '<account id>')`) to the Webflow site-wide custom code. Check it on the
   staging `webflow.io` site first, then publish. Keep pop-ups disabled.
3. Add "turn on e-commerce link tracking" to the newsletter send checklist.

## Verifying end to end (dev)

Send a test campaign with link tracking to a test inbox, click through to the staging site,
register for a test class in dev, then list orders in the dev shop. The order should be there
with `attribution` naming the campaign.

## Not done yet (#262 Phase 3)

- A refund (`confirmed → refunded`) does not yet update the order, so campaign revenue can
  overstate by the refunded amount.
- Music Together and Craft Club are not sent.
