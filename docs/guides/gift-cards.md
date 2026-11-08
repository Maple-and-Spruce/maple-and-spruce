# Selling gift cards on the website (#300)

The Webflow **Gift Card** code component sells Maple & Spruce gift cards from our own page.
Square still owns every card: its balance, its code and its history. The admin Gift Cards
page reads them back, and a card bought online shows a "Bought online" box there with the
buyer, who it was for and the message.

## What a buyer sees

1. Picks **$25, $50, $100, Other amount** (whole dollars, $10 to $500), or **A class** when
   the page names one (see below).
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
| Class ID (optional) | a class to offer as "A class"; usually left empty |

To sell a class as a gift, link from the class page to the gift card page with
`?giftClass=<classId>` (for example a "Give this class as a gift" button). The URL wins over
the prop. A class can be a gift certificate when it is published and open for registration,
has a class type (category) and a price, and is not a private-hours class. Its value is the
class's price at the moment of purchase, and the card remembers the class type so class
checkout (#301) can cover up to 10% extra when it pays for a class of that type.

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

One Square order per purchase, with a single `GIFT_CARD` line and **no tax** (gift cards are
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

## Katie: two things the admin Gift Cards page can do (#310)

Both are admin only, under **Money > Gift Cards**.

### Make a register card a class certificate

For an eGift card sold at the register as a gift for a class.

1. Sell the eGift card at the register as usual. Square takes the money there.
2. On the Gift Cards page, open the card (newest at the top, or search its last 4).
3. Click **Make it a class certificate**. It only shows on an active card that is not
   already recorded (bought online, given free, or already a certificate).
4. Choose the class type. Add To, From and a note if you like.
5. Click **Make it a class certificate**. The card now shows a "Class certificate" box.
6. Click **Show and copy code** and paste it into the Canva certificate.

**What changes:** only our record. The card, its balance and its code stay exactly as
they are in Square. The certificate is worth what was put on the card when it was sold
(read from the card's Square history), not what is left on it. That is the value class
checkout will use for the 10% cushion (#301).

### Give a free card

For a raffle prize, a thank-you or a make-good.

1. Click **Issue a gift card** at the top of the page.
2. Choose **A dollar amount** ($5 to $500, whole dollars) or **A class** (choose the class
   type, then enter what goes on the card, usually the class price).
3. Say why the studio is giving it (required). Add To, From and a note if you like.
4. Click **Give gift card**. The dialog says "Gift card ending 1234 is ready".
5. Click **Show and copy code** for the certificate.

**How the value moves:** no money comes in. Square makes the card and loads it with an
`ACTIVATE` that has no order and no payment (its reference is `comp-…`). The card spends
like any other; when it is spent, the studio is out that amount. It does not show in Square
as a gift card sale.

**Logged:** `gift_card_issued` with the card id, value, who gave it and why, never the
code. The card's record (`giftCardPurchases`, `source: 'issued'`) keeps the reason, so the
card dialog shows "Given free by the studio" with it.

If Square cannot make or load the card, the dialog says nothing was given; trying again
from the same dialog reuses the same card, so it never makes two.
