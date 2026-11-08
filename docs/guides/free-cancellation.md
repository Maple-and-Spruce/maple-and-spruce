# Free cancellation (class registrations)

The published policy gives a full refund to anyone who tells us **at least two weeks before
their class**. Like Airbnb at checkout, we show that as a date, and only while it is ahead:

> **Free cancellation until Sat, Nov 21 at 10:00 AM**

After the date we say nothing about cancelling. People can still email or call Katie, as
they always could.

Music Together has its own policy ($25 fee) and does not use any of this.

## The rule

- Two weeks before the class's **first session**, or before the **booked hour** for a private
  group, at the same clock time in Eastern (a clock change in between does not move it).
- Code: `libs/ts/domain/src/lib/free-cancellation.ts` (`freeCancellationUntil`,
  `FREE_CANCELLATION_WEEKS`).

## Where it shows

| Place | Before the date | After the date |
|---|---|---|
| Class checkout (by **Payment**) | "Free cancellation until …" | nothing |
| Confirmation screen | the date, a link to the cancel page, Katie's email | nothing |
| Confirmation email | the date and a "request a cancellation" link | nothing |
| Cancel page (`/cancel`) | the class and a **Request cancellation** button | the class and Katie's contact only |

A booking made inside the two weeks never shows the line at all. A sent email cannot hide
itself later, but it names the date, so it promises nothing after it.

The email line comes from the shared confirmation mail
(`registration-confirmation.utility.ts`, option `offerFreeCancellation`). The in-page checkout
and the Square-hosted checkout turn it on. A sale rung up at the register does not: the cancel
page finds web registrations only, so register customers ask Katie as before.

## The cancel page

`https://mapleandsprucefolkarts.com/cancel`, holding the **Cancel Registration** code component
(`apps/webflow-components/src/cancel-registration.webflow.tsx`). The confirmation screen and
email link to it with `?confirmation=MS-XXXXXX` filled in.

1. The customer enters their confirmation number and the email they booked with. Both must
   match a confirmed web registration. Anything else is the same "couldn't find it".
2. Before the date, **Request cancellation** calls `requestRegistrationCancellation`, which:
   - records `cancellationRequestedAt` on the registration (once, in a transaction);
   - emails Katie (`ADMIN_ALERT_EMAIL`, template `registration-cancellation-request-staff`)
     with a link to the class roster;
   - emails the customer that it reached us (`registration-cancellation-requested`).
3. **Nothing is cancelled or refunded.** The request shows on the Home **Inbox** as
   "Cancel request" until Katie cancels the registration on the roster (which refunds it and
   sends the usual cancelled email) or marks the item done.

Both calls require App Check and are throttled (ADR-037). The lookup is a route on the warm
`publicSite` router; the request is its own function.

## Setup after merge

1. **Seed the email templates** in both projects:
   ```bash
   npx tsx tools/seed-email-templates.ts
   npx tsx tools/seed-email-templates.ts --prod
   ```
   Until then the confirmation email keeps the old "contact us at least two weeks before"
   sentence, and the two new emails have no template.
2. **Publish the code component library** and then **publish the site**, so the checkout and
   confirmation screens get the new line (an unpublished site keeps the old widget JS).
3. **Create the `/cancel` page** in Webflow, add the Cancel Registration component (Environment
   `prod`), and publish. Until it exists, the links in the email and confirmation screen 404.
4. **Update the policy page's "How to Cancel"** section to point to `/cancel` as well as email.
