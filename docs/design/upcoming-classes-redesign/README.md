# /upcoming-classes redesign prototype

The approved prototype for the redesigned public **/upcoming-classes** page on the
Webflow site. It is a design reference, not shipping code: the page itself will be
built natively in Webflow (see [Implementation](#implementation)).

## Files

| File | What it is |
|------|------------|
| `Main.dc.html` | Desktop artboard: the date-first class listing |
| `Phone.dc.html` | iPhone 16 artboard (393 x 852): photo rows, featured Studio Series card, bottom-sheet date picker, sticky next-class bar |

Both are Design-canvas artboard sources, copied verbatim. Images are referenced as
`/_blob/<id>` URLs, which resolve **only inside the canvas artifact**. Opened on their
own, the files render without photos.

The live canvas, with images, is the private Design canvas artifact
<https://claude.ai/artifact/9t5zPASCa4j8cSr1gc3vCv> (owner-only).

## Decisions

- **Date-first listing.** Classes are listed chronologically under month headers, each
  row led by a date block (day of week + day number).
- **Filter chips:** All / Stained glass / Jewelry / 6-week series.
- **Full dates stay visible** with a "Join waitlist" action rather than disappearing.
- **Seat counts only when true.** "1 seat left" shows only when it reflects real
  availability; no invented scarcity.
- **Facts strip under the title** (length, level, materials included).
- **Studio Series as a featured photo card**, set apart from the single-session rows.
- **"Made in the studio"** is the Instagram embed already used on /gallery.
- **"Book a private class" card** links to /private-events.
- **Sticky next-class bar on phone and tablet only.** On desktop the first row is
  labelled "Next up" instead.

## Research basis

Patterns were drawn from Apple's Today at Apple, Amazon, class marketplaces
(CourseHorse, ClassBento, Domestika) and event/booking products (Eventbrite, Luma,
DICE, Resy).

Adopted: date-first browsing, category chips, photo-led rows, a short facts strip,
a bottom-sheet date picker on phone, a persistent next-action bar, waitlists on full
dates.

Skipped, deliberately: ratings, badges, fake urgency and dynamic pricing. At roughly
five classes a month they would be noise at best and dishonest at worst.

## Implementation

The page will be a **native Webflow Collection List** bound to the Classes CMS, not a
code component, so it stays crawlable for SEO and editable by Katie in the Designer.

Supporting CMS data: the `session-count` Number field on the Classes collection tells
single-session "Try It" classes (1) from multi-session series such as the Studio
Series (more than 1). It is written by the class sync.

## Open items

- Class **times** are not shown in the prototype yet.
- **Gift cards** ("Gift a class") are not confirmed as an offering.
- All copy is draft and needs Katie's voice.
- Photos of **student work** are still needed; the prototype uses existing class photos.
