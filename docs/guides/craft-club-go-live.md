# Craft Club — Go-Live Runbook

All four build phases (#507, #509, #521, #522) are merged, so the **code** is
deployed. This runbook covers the **one-time configuration** that can't live in
code: creating the Square subscription plan, seeding email templates,
subscribing to webhook events, and publishing the Webflow pages.

Do the **sandbox** column first, verify end to end, then repeat for
**production**.

> ⚠️ Until step 1 is done, `createCraftClubSubscription` will fail in that
> environment — `.env.dev` / `.env.prod` ship a placeholder
> `CRAFT_CLUB_PLAN_VARIATION_ID`. That's expected pre-launch; step 1 fixes it.

---

## Step 1 — Create the Square subscription plan

`tools/create-craft-club-plan.ts` creates a `SUBSCRIPTION_PLAN` ("Craft Club
Membership") with one `SUBSCRIPTION_PLAN_VARIATION` ("Monthly", $30.00 STATIC,
MONTHLY cadence) and prints the **variation ID** — the value
`subscriptions.create()` enrolls members in. The catalog is per-environment, so
you run it once for sandbox and once for production and get two different IDs.

It only needs a Square access token (no Firebase). **Never commit the token.**

**Sandbox** (token from Square Developer Dashboard → your app → *Sandbox* →
Credentials, or reuse the existing `SQUARE_SANDBOX_ACCESS_TOKEN`):

```bash
export SQUARE_ACCESS_TOKEN=EAAA…sandbox…
npx tsx tools/create-craft-club-plan.ts
```

**Production** (token from the app's *Production* credentials — this creates a
real catalog plan):

```bash
export SQUARE_ACCESS_TOKEN=EAAA…production…
npx tsx tools/create-craft-club-plan.ts --prod
```

Each run prints:

```
✓ Craft Club subscription plan created.
  Plan ID:      <…>
  Variation ID: <THIS ONE>
```

Copy the **Variation ID** into the matching env file, replacing the placeholder:

- sandbox → `.env.dev`  → `CRAFT_CLUB_PLAN_VARIATION_ID=<sandbox variation id>`
- production → `.env.prod` → `CRAFT_CLUB_PLAN_VARIATION_ID=<prod variation id>`

`.env.dev` / `.env.prod` are committed config, so this is a small PR. On merge,
CI redeploys the functions with the real value.

---

## Step 2 — Seed email templates

`tools/seed-email-templates.ts` writes the Handlebars templates (including
`craft-club-welcome`, `craft-club-cancelled`, `craft-club-manage-link`) to the
`email-templates` Firestore collection that the Trigger Email extension reads.
It uses Application Default Credentials.

```bash
gcloud auth application-default login    # once, if not already authed
npx tsx tools/seed-email-templates.ts            # dev project
npx tsx tools/seed-email-templates.ts --prod     # production project
```

Re-running is safe — it overwrites each template doc by ID.

---

## Step 3 — Subscribe the webhook to subscription events

`squareWebhook` is already registered per environment. It needs the new event
types turned on so member status stays in sync with Square.

In **Square Developer Dashboard → your app → Webhooks → Subscriptions**, edit
the existing subscription (sandbox and production each) and add:

- `subscription.created`
- `subscription.updated`

(`invoice.payment_made` is already handled. No new endpoint URL is needed.)

---

## Step 4 — Publish the Webflow pages

Two Code Components ship in `apps/webflow-components` and auto-publish to the
Designer:

| Component | Page | Visibility |
|-----------|------|------------|
| **Craft Club Signup** | e.g. `/craft-club/join` | private / link- or QR-shared |
| **Craft Club Manage** | e.g. `/craft-club/manage` | public |

The server enforces the approval gate regardless of where the signup component
is embedded, so "private" is about discoverability, not security.

**Component props** (set in the Designer):

| Prop | Sandbox (dev) | Production |
|------|---------------|------------|
| Square App ID | `sandbox-sq0idb-gAg2gnLYZ-5b2uXajUfZLA` | _(prod Web Payments app id)_ |
| Square Location ID | `LW0MMBZ5721QY` | `LEJBNPRGM99NV` |
| Environment | `dev` | `prod` |
| Manage Membership URL _(signup only)_ | the manage page URL | the manage page URL |

Then set the backend `CRAFT_CLUB_MANAGE_URL` env to the **manage page URL** so
the magic-link emails point at it. It currently defaults to
`https://mapleandsprucewv.com/craft-club/manage` in `.env.dev` / `.env.prod` —
update if your path differs (small PR; redeploys on merge).

---

## Step 5 — Verify (sandbox first)

1. In the admin app `/craft-club`, **pre-approve** a test email.
2. On the signup page, enter that email → it should show the payment form; pay
   with a [Square sandbox test card](https://developer.squareup.com/docs/devtools/sandbox/payments)
   (`4111 1111 1111 1111`, any future expiry/CVV/ZIP).
3. Confirm in the **Square sandbox dashboard** that a subscription was created,
   and that the member flips to **Active** in `/craft-club`.
4. On the manage page, request a link → check the email arrives (or inspect the
   `mail` collection in the dev Firestore) → open it → cancel / change card.
5. In `/craft-club`, exercise the admin **pause / resume / cancel** buttons.

Once sandbox is clean, repeat steps 1–4 for production and you're live.

---

## Quick reference — what reads what

- `CRAFT_CLUB_PLAN_VARIATION_ID` → `createCraftClubSubscription` (which $30/mo
  variation to enroll members in)
- `CRAFT_CLUB_MANAGE_URL` → `requestCraftClubManageLink` (base URL of the
  emailed magic link)
- `subscription.created` / `subscription.updated` webhooks → `squareWebhook`
  (reconcile member status + paid-through date)
- Email template docs → Firebase Trigger Email extension (renders + sends)
