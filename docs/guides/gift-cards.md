# Selling gift cards on the website (#300)

The Webflow **Gift Card** code component sells Maple & Spruce gift cards from our own page.
Square still owns every card: its balance, its code and its history. The admin Gift Cards
page reads them back, and a card bought online shows a "Bought online" box there with the
buyer, who it was for and the message.

## What Katie controls (#309)

- **Amounts: Admin > Settings > Gift cards.** The one-tap amounts (1 to 4 of them, today
  $25, $50, $100) and the lowest and highest "Other amount" (today $10 and $500). Whole
  dollars only; the lowest can be no less than $5 and the highest no more than $1,000, and
  every one-tap amount must sit between them. Nothing stored means the amounts above. The
  page shows them, and `giftCards/purchaseGiftCard` refuses anything outside them, so a
  change takes effect on the next purchase without touching Webflow.
- **Class gift certificates: Admin > Class Categories.** Edit a class type, switch on
  **Sell as a gift certificate** and set the **Certificate price**. Only switched-on types
  are offered, at that price. Switching one off keeps its price for next time. The type's
  first pool image is shown next to it on the page, if it has one.

## What a buyer sees

1. Picks one of the amounts from Settings or **Other amount**, or **A class**, which lists
   every class type that is switched on with its certificate price. "A class" is hidden
   when no type is on.
2. Enters who it is for (name, email), who it is from (name, email) and an optional message
   (up to 300 characters).
3. Chooses **Send it to: Them, by email** or **Me, so I can print it**.
4. Pays by card (Square card field, same as class registration).
5. Sees "Your gift card is on its way" (or "is ready") with the last 4 digits.

Emails (templates in `tools/seed-email-templates.ts`):

| Template | To | Has the full code |
|---|---|---|
| `gift-card` | whoever "Send it to" names | yes, in groups of four |
| `gift-card-purchase-confirmation` | the buyer, only when it went to the recipient | no, last 4 only |
| `gift-card-refund-needed` | `ADMIN_ALERT_EMAIL`, only if a refund failed | no |

**The templates must be seeded before the page goes live:**
`npx tsx tools/seed-email-templates.ts` (dev) and `npx tsx tools/seed-email-templates.ts --prod`.

## Embedding it in Webflow

Add the **Gift Card** component (from the "Maple & Spruce Components" library) to the gift
card page. Props:

| Prop | Value |
|---|---|
| Square App ID | the Maple & Spruce production app id (same as the Class Registration component) |
| Square Location ID | the Maple & Spruce location id (same as Class Registration) |
| Environment | `prod` (or `dev` on staging) |
| Class ID (optional) | a class whose type to preselect under "A class"; usually left empty |
| Heading | the page's h1; default "Give the gift of making" |
| Intro | the line under the heading |
| Fine print | small text under the form (never expires, not for Music Together) |

Heading, intro and fine print are props so they are in the server-rendered page HTML; the
page itself only needs nav, this component and the footer. After a purchase only the
heading stays.

A certificate is for a **class type**, not a single class. To sell one from a class page,
link to the gift card page with `?giftClass=<classId>` (for example a "Give this class as a
gift" button). The URL wins over the prop. The page opens on "A class" with that class's
type picked when the type is switched on, or on the picker when it is not. If no type is on
at all, it says so and offers dollar amounts. Old links keep working the same way.

The certificate's value is the type's certificate price at the moment of purchase. The card
records the class type (`classCategoryId`, with the type's name as `className`, plus the
`classId` when it came from a class link), so class checkout (#301) can cover up to 10% extra
when it pays for a class of that type. Emails describe it as "One Pottery class at Maple &
Spruce".

After changing the component code, the library has to be re-shared to Webflow and the site
published, or the old widget keeps running.

## What Katie must turn on in Square

- **Gift cards** enabled on the Maple & Spruce Square account (Square Dashboard > Gift Cards).
  This is the M&S account only; Music Together is a separate Square account and is not used.
- **eGift cards**: our page makes the card itself through the API, so Square's own eGift
  storefront does not need to be on, but Square must allow digital cards on the account.
- The gift card terms (#296) should be live on the site, since the email says the card never
  expires.

## How money moves

One Square order per purchase, with a single `GIFT_CARD` line ("Gift card", or "Gift
certificate: Pottery class") and **no tax** (gift cards are
taxed when spent, not when sold). The buyer's card pays that order; then the card is created
and activated against the order line, so Square records the sale as a gift card sale and the
balance appears on the card. The order's `referenceId` starts with `giftcard-`. The POS
capture worker ignores it because the line has no catalog item.

If the payment succeeds but Square cannot create or activate the card, the payment is
refunded in full and the buyer is told so. If that refund also fails, Katie gets the
`gift-card-refund-needed` email and must refund in the Square Dashboard.

## Logs

`gift_card_purchased`, `gift_card_payment_failed`, `gift_card_purchase_refunded`,
`gift_card_refund_failed`, `gift_card_purchase_record_failed`, `gift_card_email_failed`.
None of them contain the card code.
