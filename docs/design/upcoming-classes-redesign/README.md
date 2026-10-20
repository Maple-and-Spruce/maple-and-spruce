# /upcoming-classes redesign prototype

The approved prototype for the redesigned public **/upcoming-classes** page on the
Webflow site. It is a design reference, not shipping code: the page itself will be
built natively in Webflow (see [Implementation](#implementation)).

## Files

| File | What it is |
|------|------------|
| `Main.dc.html` | Desktop artboard: the date-first class listing |
| `Phone.dc.html` | iPhone 16 artboard (393 x 852): photo rows, featured Studio Series card, bottom-sheet date picker, sticky next-class bar |
| `webflow-embed.html` | The CSS + script live on the Webflow page (see [Webflow implementation](#webflow-implementation)) |
| `webflow-sections-embed.html` | Page-scoped CSS for the header, self-care and Policies sections |

The two `.dc.html` files are Design-canvas artboard sources, copied verbatim. Images
are referenced as `/_blob/<id>` URLs, which resolve **only inside the canvas
artifact**. Opened on their own, the files render without photos.

The artboards are historical: they predate Katie's correction that the studio does not
run Open Studio Socials and that Workshops sit between Try It and the Studio Series
(see [Webflow implementation](#webflow-implementation) for the current path).

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
- **One featured photo card**, set apart from the normal rows. Staff pick it in the admin
  portal (see [Featured card](#featured-card)); it started out as the Studio Series.
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

Supporting CMS data: the `session-count` Number field on the Classes collection, written
by the class sync, tells single-session "Try It" classes from multi-session Workshops
and Studio Series (see the rules below).

## Webflow implementation

The redesign is built on the live /upcoming-classes page (Webflow page
`69d1284b1476685827c82d33`).

- **Listing:** a native Classes Collection List, sorted by `date-time` ascending and
  filtered to `is-dev-environment` off and `date-time` on or after today. Each item
  (DynamoItem) carries CMS-bound data attributes: `data-date`, `data-category`,
  `data-sessions`, `data-spots`, `data-time`, `data-duration`. It also holds an empty
  `[data-msx-featured]` marker div whose visibility is bound to `is-featured`.
- **Restyle:** the HtmlEmbed `669fad2a-29f5-7aac-40a7-5c949c2d33d5` inside the class
  list section holds the CSS and script in `webflow-embed.html`. At runtime it turns the
  list into date-first rows under month headers, adds the filter chips (craft inferred
  from category/name keywords), labels the first row "Next up", and adds the sticky
  next-class bar below 992px. The filter bar also has an "Open seats" toggle (after a
  divider) that combines with the craft/format chips to hide full classes; it only
  appears when at least one listed class is full. On phones the chips wrap onto rows
  instead of scrolling sideways, and the divider is hidden. It classifies multi-session classes:
  - **Studio Series:** name or category contains "Studio Series", or `session-count`
    is 3 or more. They get the "Studio Series" tag and filter chip.
  - **Workshop:** 2 sessions, "workshop" in the name or category, or duration text
    containing "each". Workshops get their own tag, a "Sessions: ..." fact and a
    "Workshops" filter chip, and stay in the normal rows.
- **Featured card:** see below. The layout CSS is scoped to `.msx-feature`.
- **Made in the studio:** a separate small HtmlEmbed with the Instagram profile embed
  copied from /gallery. It tags its section `.msx-made` and sets `position: relative` +
  `overflow: hidden`, so a blocked Instagram frame cannot cause sideways scroll on
  phones.
- **Book a private class:** a native `cls-cta-container` card linking to
  /private-events.
- **Other sections:** a second HtmlEmbed (`515555fd-21ec-4453-5c30-abf25dd7bd19`,
  inside the hero section) holds the page-scoped CSS in `webflow-sections-embed.html`
  for the header, "Crafting for self-care" and "Policies" sections, aligning them to
  the 960px class-list column. Those sections are targeted by `data-msx` attributes
  (`hero`, `about-head`, `about`, `policies`), so shared site classes (`section`,
  `container-13`, `paragraph3`, ...) are untouched. The self-care section gained
  native 4-step learning-path cards (classes `msx-path` / `msx-step*`):
  1. **Try It** ($40 to $60)
  2. **Workshop** (2 sessions, price not shown)
  3. **Studio Series** ($240, 6 weeks)
  4. **Craft Club** ($30/month, open only after finishing a Studio Series)

  Its lead-in paragraph was rewritten to describe that path. The studio does not run
  Open Studio Socials. **Prices in those cards are hard-coded** and must be updated by
  hand when prices change.
- The Designer canvas still shows the old card grid, because the restyle is runtime
  CSS/JS. Check changes on the staging or live site.

**Editing either embed means editing it in Webflow and keeping its file here in
sync.** These files are the source of truth the embeds point to.

## Featured card

Staff choose the class that gets the large photo card. In the admin portal, the class form has a
**Feature on Upcoming Classes** switch, and the class list shows a "Featured" chip on those
classes. The flag is `Class.isFeatured`, synced to the Classes CMS Switch `is-featured`.

Webflow cannot bind a Switch to a custom attribute (the API refuses it), so each list item holds an
empty `<div class="msx-feat-flag" data-msx-featured="1">` whose **visibility** is bound to
`is-featured`. The script treats an item as featured when that marker is present and not
`w-condition-invisible`. A second, unbound `msx-feat-flag` div (Navigator name "UNUSED - safe to
delete") sits in the item too: the API would not let it be bound, hidden or removed. It has no
`data-msx-featured`, so the script ignores it. Delete it in the Designer when convenient.

- The card shows only while the class **has seats**. A featured class that fills up drops back to
  a normal row with "Join waitlist", and comes back if a seat opens. A full class should not take
  the most prominent spot on the page.
- Nothing is featured unless staff choose it. There is no automatic fallback.
- More than one class can be featured, and each one gets a large card. One or two is the intent.
- Duplicating a class does not copy the flag.

## Open items

- Class **times** are not shown in the prototype yet.
- **Gift cards** ("Gift a class") are not confirmed as an offering.
- All copy is draft and needs Katie's voice.
- Photos of **student work** are still needed; the prototype uses existing class photos.
