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

## Katie: two more things the admin Gift Cards page can do (#310)

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

## Printed gift certificates (#314, #332)

A stack of certificates for the shop, printed from the admin page. Each one is a real
Square gift card with **no money on it** until it is sold. The register puts the money on
it at the sale, so a certificate that walks out of the drawer unsold is worth nothing.

### The code

A printed certificate's code is `MAPLE`, the year, and three digits drawn at random, for
example `MAPLE 2026 ###`. It is printed with spaces for reading and as a barcode of the same
12 characters for scanning. The three digits are never in order, so one certificate does not
give away the next. If Square already has a card with the code drawn, another is drawn (up to
10 tries; then the dialog says this year's codes may be nearly used up). That allows up to
1,000 certificates a year. Every other card (online, eGift at the register, free cards,
replacements) keeps Square's own 16-digit number.

**The tradeoff:** 1,000 codes a year are far easier to guess than Square's numbers. That is
fine at the register, where a person reads the certificate and an unsold one holds nothing.
It matters online: see "Before switching on online gift card checkout" below.

### Printing a batch

1. On **Money > Gift Cards**, click **Print gift certificates**.
2. Choose the design (today: stained glass leaves), then **A dollar amount** ($5 to $500,
   whole dollars) or **A class** (only class types with certificates switched on, at their
   certificate price), and **How many** (1 to 50).
3. Click **Make N and print**. Square makes every card (with nothing on it), then the print
   view opens.
4. Click **Print**. Use US Letter paper at 100% scale with background graphics on. One
   certificate per page: the amount (or "One Pottery class"), "Gift Card", the code, the
   barcode, the logo, and a QR code to the upcoming classes page.

If Square makes only some of a batch, the dialog says how many and offers **Try again for
the rest** (the same batch) or **Print the N ready**. A printed batch can be opened again
from any of its cards ("Open this batch to print it again"); each opening reads the codes
from Square and is logged.

### Selling one at the Square iPad

1. Tap **Gift Cards**, then **Check Balance**.
2. Scan the barcode on the certificate, or type the code (`MAPLE`, the year, the three
   digits).
3. Load the amount printed on the certificate.
4. **Add the customer** to the sale: their name, email or phone. This is what lets the admin
   page say who bought it and find it later if it is lost.
5. Charge as usual. Hand over the certificate.

Square books this as a gift card sale (no sales tax: gift cards are taxed when they are
spent), with the customer on the order. Nothing needs doing on the admin page.

> Not yet confirmed against the live register: that the Square iPad will load a card our
> system created with a `MAPLE` code (Katie is testing this). If it will not, nothing is lost:
> the certificates hold no money.

The old **"Gift certificate" item** in the Square item library is not needed any more. The
catalog sync still skips an item with that name, so leaving it there is harmless.

### What the admin page shows, before and after

| | Before the sale | After the register loads it |
|---|---|---|
| Status in the list | **Not sold yet** | Active |
| Balance | $0.00 | What was loaded, then less as it is spent |
| Totals | counted in **Printed, not sold yet** (a number of certificates, no dollars) | its load counts in **Sold this month**, its balance in **Owed to customers** |
| Card dialog | "Printed certificate for $X. It has no money on it until it is sold at the register." | "Sold at the register on <date> to <name> · <email> · <phone>", read live from Square |

The buyer line comes from the card's first activation (or first load) in Square: its order,
and the customer Katie added to that order. If no customer was added it says "No customer was
added at the register." Customers Square links to the card itself are listed too. None of this
is stored in Firestore; it is read from Square each time the dialog opens, admin only.

## Finding a card by its customer (#332)

The search box on the Gift Cards page takes the **last 4 digits** of a card (filtered on the
page, as before) or a customer's **name, email or phone** (searched in Square):

- An email or a phone number uses Square's customer search, which matches part of either.
- Square cannot search customers by name, so a name is matched against the **2,000 most
  recently created** Square customers, word by word ("ash rob" finds a Robin Ashfield). An
  older customer is still found by email or phone.
- At most **10** customers are matched. For each, the page lists every card Square links to
  them, however old, plus every card one of their orders loaded in the **last 2 years** (from
  the gift card activations and loads of those two years).

The search is logged with counts only, never what was typed.

## Replacing a lost card (#332)

1. Find the card: search the customer's name, email or phone, or the last 4 if they have it.
2. Open it and click **Replace lost card** (admin only; shown on an active card with money on
   it).
3. The confirm dialog shows the balance that will move and says the old card will stop
   working for good. Click **Replace card**.
4. The dialog says "New card ending NNNN holds $X". Click **Show and copy code** to put it on
   a fresh certificate (or email it).

**How the money moves.** Square's own balance transfer cannot be made through the API, so the
move is made of activities it can:

1. Make a new digital card (nothing on it).
2. Record it: `giftCardPurchases/{newId}` with `source: 'replacement'`,
   `replacesGiftCardId` and the amount, before any money moves.
3. Take the balance off the lost card (`ADJUST_DECREMENT`, reason `SUPPORT_ISSUE`).
4. Put it on the new card (`ACTIVATE` with the amount and no order, reference `repl-…`).
5. Turn the lost card off (`DEACTIVATE`).

The balance comes off the lost card **before** it goes on the new one, so a failure never
leaves the money on both. What each failure leaves:

| Fails at | Where the money is | What to do |
|---|---|---|
| 1 or 2 | on the lost card | try again |
| 3 | on the lost card (Square refuses to take more than is there) | try again |
| 4 | on neither card for the moment; the amount is in our record and in the lost card's Square history | try again: it finishes and puts it on the new card |
| 5 | on the new card; the lost card holds $0 | try again to turn it off |

Trying again is always safe: it finds the replacement already started for that card and
carries on, and every Square call reuses its key, so nothing is moved twice. A class
certificate's replacement is still a class certificate for the same class type, worth the
balance moved. The move is not a sale: it is left out of "Sold this month".

**Logged:** `gift_card_replaced {oldId, newId, balanceCents, uid}` and
`gift_card_replace_failed {step, …}`. Never a code.

## How it is counted

- **Owed to customers:** every active card's balance. Printed certificates are pending until
  sold, so they are not in it.
- **Sold this month:** money loaded since the 1st, except free cards' first load, replacements,
  and certificates printed pre-loaded under #314 (loaded with no order).
- **Given free this month:** free cards' first load.
- **Printed, not sold yet:** printed certificates still pending (a count).

## Before switching on online gift card checkout

Paying for a class online with a gift card (#301) is built but switched off. Before it is
switched on:

- **Add a lockout after repeated wrong codes.** A printed certificate's code is one of 1,000
  per year, so guessing is cheap without one. Limit wrong tries per visitor and per card, on
  top of the existing App Check and per-IP throttle on `previewGiftCardForClass`. (Not built
  yet.)

## Logs

`gift_certificates_printed` (batch id, count, value, who), `gift_certificate_print_failed`
(batch id, place in batch, step), `gift_certificate_batch_revealed` (batch id, count, who),
`gift_certificate_batch_reveal_failed`, `gift_card_buyer_viewed` (card id, whether a sale and
customer were found, who), `gift_card_customer_search` (how it searched, counts, who),
`gift_card_replaced` and `gift_card_replace_failed`. None contain a code or a customer's
details.
