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

## Webflow implementation

The redesign is built on the live /upcoming-classes page (Webflow page
`69d1284b1476685827c82d33`).

- **Listing:** a native Classes Collection List, sorted by `date-time` ascending and
  filtered to `is-dev-environment` off and `date-time` on or after today. Each item
  (DynamoItem) carries CMS-bound data attributes: `data-date`, `data-category`,
  `data-sessions`, `data-spots`, `data-time`, `data-duration`.
- **Restyle:** the HtmlEmbed `669fad2a-29f5-7aac-40a7-5c949c2d33d5` inside the class
  list section holds the CSS and script in `webflow-embed.html`. At runtime it turns the
  list into date-first rows under month headers, adds the filter chips (craft inferred
  from category/name keywords), promotes the Studio Series to a featured card
  (`session-count` > 1, falling back to duration text containing "each"), labels the
  first row "Next up", and adds the sticky next-class bar below 992px.
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
  native 4-step path cards (classes `msx-path` / `msx-step*`: Open Studio Social, Try
  It, Studio Series, Craft Club), and its "tight budget" paragraph was shortened into
  a lead-in for them. **Prices in those cards are hard-coded** ($40 to $60, $240,
  $30/month) and must be updated by hand when prices change.
- The Designer canvas still shows the old card grid, because the restyle is runtime
  CSS/JS. Check changes on the staging or live site.

**Editing either embed means editing it in Webflow and keeping its file here in
sync.** These files are the source of truth the embeds point to.

## Open items

- Class **times** are not shown in the prototype yet.
- **Gift cards** ("Gift a class") are not confirmed as an offering.
- All copy is draft and needs Katie's voice.
- Photos of **student work** are still needed; the prototype uses existing class photos.
