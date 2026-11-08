# Gift cards at class checkout (#301)

Families can pay for a Maple & Spruce class with a Square gift card, alone or
together with a card. It ships **off**. Nothing changes on the site until the
`Gift Cards` prop on the Class Registration component is set to `show`.

## Before turning it on

These come from Katie's decisions in #296:

1. **Gift cards are on in Square** for the Maple & Spruce account (not Music
   Together's). The checkout reads cards with the same Square app as card payments.
2. **Who pays the class-certificate cushion is decided.** Today the instructor is paid on
   the full class price and the studio absorbs the cover (see "Money" below). If the
   decision is to share it like a discount code, payouts need a change first.
3. **The confirmation email template is re-seeded** (`npx tsx tools/seed-email-templates.ts`
   for dev, `--prod` for prod). The template has new rows for the gift card. Until it is
   re-seeded, a gift card buyer's email shows the total paid without the split.
4. **Try it on dev with a Square sandbox gift card.** Square's sandbox test gift card
   numbers are listed under "Sandbox payments" in Square's developer docs. Test a full
   gift card payment, a split with a test card, a declined test card (the gift card's
   balance must come back), and a refund from the admin.

## Turning it on in Webflow

1. Open the page with the **Class Registration** component (the class template page).
2. Select the component and set **Gift Cards** to `show`. Leave **Digital Wallets** as it is.
3. Publish the **whole site**, not just the page, so the new widget code goes out.
4. On the live class page, a "Have a gift card?" link appears under the card field.

To turn it off, set **Gift Cards** back to `hide` and publish. Nothing is stored that needs
cleaning up.

Music Together checkout never offers gift cards, and neither does the "Continue to secure
checkout" fallback (used when Square's card field cannot load, mostly Safari).

## What a family sees

- "Have a gift card?" opens Square's gift card field. **Apply** checks the card and shows
  "Gift card ending 4821: −$60.00", any "Class certificate covers: −$6.00", and "Left to pay".
- If the gift card covers everything, the card field disappears and the button reads
  "Register — paid by gift card".
- Otherwise they enter a card for the rest. The success screen and the confirmation email
  show the gift card part (last 4 only), the card part, and any certificate cover.

## Money

- **One Square order per registration.** A class certificate's cover is a discount on that
  order named "Class certificate", taken off before tax, like a discount code.
- **The gift card is charged first, for as much as it holds**, then a card for the rest. Both
  payments are only authorized until Square completes them together. If the card is declined,
  the gift card authorization is cancelled and its balance is back right away.
- **On the registration:** `giftCardPaidCents`, `cardPaidCents`, `giftCardLast4`,
  `classCertificateCoverCents`, `squareGiftCardPaymentId`. `pricePaidCents` is what the
  family paid in all. `subtotalCents` is the class price after any discount code and
  **before** the certificate cover.
- **Payouts read `subtotalCents`,** so an instructor is paid as if the family paid the full
  price, and the studio absorbs the cover. Changing that is a payout change, not a checkout one.
- **Cancelling with a refund** sends the card's part back to the card and the gift card's
  part back onto the gift card. The cover is never refunded, because nobody paid it. If one
  refund fails, the admin is told what went back and what is left to refund in Square.
