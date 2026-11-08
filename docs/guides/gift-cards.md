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

## Printed gift certificates (#314)

A stack of certificates for the shop, printed from the admin page. Each one is a real
Square gift card, **made and loaded when it is printed**, so it can be spent from the
moment it comes off the printer. Katie sells one at the register like any other item;
nothing happens on the admin page at the sale.

### Printing a batch

1. On **Money > Gift Cards**, click **Print gift certificates**.
2. Choose the design (today: stained glass leaves), then **A dollar amount** ($5 to $500,
   whole dollars) or **A class** (only class types with certificates switched on, at their
   certificate price), and **How many** (1 to 50).
3. Click **Make N and print**. Square makes and loads every card, then the print view opens.
4. Click **Print**. Use US Letter paper at 100% scale with background graphics on. One
   certificate per page: the amount (or "One Pottery class"), "Gift Card", the code in
   groups of four, a barcode the register can scan, the logo, and a QR code to the
   upcoming classes page.
5. Keep the stack somewhere safe, like cash.

If Square makes only some of a batch, the dialog says how many and offers **Try again for
the rest** (the same batch: it never makes a card twice) or **Print the N ready**. A
printed batch can be opened again from any of its cards on the Gift Cards page ("Open this
batch to print it again"); each opening reads the codes from Square and is logged.

**Theft caveat:** because the cards are loaded before they are sold, a certificate taken
from the stack can be spent without anyone paying for it. If one goes missing, find it on
the Gift Cards page by its last 4 digits and turn it off (block it) in the Square Dashboard.

### Selling one at the register

Ring up the **Gift certificate** item, type the amount printed on the certificate, and leave
tax off. Hand over the certificate. That is all.

### Setting up the "Gift certificate" item in Square (once)

In the Square Dashboard (Maple & Spruce account), **Items & services > Items > Create item**:

1. **Name:** `Gift certificate`. Exactly that, capital letters optional, no other words. The
   catalog sync and the POS sale worker recognise the item by this name.
2. **Price:** leave it **variable** (no price), so the register asks for the amount.
3. **Taxes:** turn **off** WV sales tax for this item. Gift cards are taxed when they are
   spent, not when they are sold.
4. **Category:** whatever Katie likes (for example "Gift cards"). It changes nothing here.
5. Do not link it to an artist or a product in the admin app.
6. Save. It shows on the register like the ad hoc music lesson item.

**In the books** a certificate sale is gift card money: a liability (money owed in goods or
classes), not shop income, and it pays no artist. Record it the same way as Square's own
gift card sales. When the certificate is later spent on a piece, that sale is income and
pays the artist their usual split.

**What our system does with it:** the catalog sync (`process-catalog-sync-request`) skips any
Square item named "Gift certificate", so it never becomes a draft product waiting for an
artist, and the POS sale worker (`process-pos-sale`) ignores the line, so it is never treated
as a lesson or a class registration. If the item was created before this shipped, the sync
may already have made a draft "Gift certificate" product in the admin: delete that draft.

### How the value moves and how it is counted

- Each certificate is a digital card made with `createDigitalGiftCard` and loaded with an
  `ACTIVATE` that has no order and no payment (reference `cert-<batch>-<n>`), the same Square
  calls as a free card. The batch id and every Square key are derived from the dialog's key
  and the certificate's place in the batch, so a retry reuses the same cards.
- Each card's record is `giftCardPurchases/{giftCardId}` with `source: 'stock'`, `batchId`,
  `batchIndex`, `design`, value, kind and class type. Codes are never stored.
- On the Gift Cards page, a printed certificate still holding exactly what was loaded counts
  under **Printed certificates not yet used**, not under "Owed to customers". Loading it is
  not counted as sold. Once it is spent, what is left counts as owed like any card. Free cards
  count under **Given free this month**, not "Sold this month". A certificate sold at the
  register shows in Square's item sales as "Gift certificate", not in "Sold this month".

### Logs

`gift_certificates_printed` (batch id, count, value, who), `gift_certificate_print_failed`
(batch id, place in batch, step), `gift_certificate_batch_revealed` (batch id, count, who)
and `gift_certificate_batch_reveal_failed`. None contain a code.
