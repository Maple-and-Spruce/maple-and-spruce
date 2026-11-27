# Webflow Page Design Principles

The design rules the public site carries forward, drawn from the four pages redesigned in
2026: `/suzuki` and the `/music` + `/music-lessons` restyle (the `suz-*` layer, Aug–Sep), and
the `/upcoming-classes` + class-page prototypes (Oct). Every remaining page gets prototyped
against these before anything changes in Webflow.

Tokens and class names live in `webflow-design-system.md`. The approved prototypes live
in the private Design canvas **Upcoming Classes Redesign**
(`https://claude.ai/artifact/9t5zPASCa4j8cSr1gc3vCv`, artboards `Main`, `Phone`, `ClassPage`,
`ClassPhone`).

---

## 1. Register: unhurried, warm, domestic, plain-spoken

The studio is a family arts collective in a converted church, not a conservatory and not a
kids' activity centre. Two postures to avoid everywhere (they came out of the rejected ochre
`/suzuki` hero):

- **Prestige**: dark luxury, audition language, "world-class". It contradicts "every child can"
  and "no experience needed".
- **Merchandising**: saturated craft-fair colour, badges, starbursts, "SALE". It reads like a
  market stall and undercuts trust.

**Whitespace is the main expressive device.** Calm comes from room, not decoration.

## 1a. But it has to feel like Maple & Spruce

Calm must not mean generic. The studio's Instagram (`@mapleandsprucefolkarts`) is the
reference for its personality, and the site should feel like the same place:

- **Hands at work.** Close-ups of hands scoring glass, soldering, twisting copper wire,
  spinning wool, restringing a fiddle. Process, not just finished products.
- **Katie and the teachers on camera.** Smiling, holding up what they made, talking straight
  to you. A person, not a brand.
- **The work brings the colour.** Amber and green stained glass, rainbow yarn, glazed pots
  against warm wood tables and the church's light. The page chrome stays quiet so the
  photographs can be loud.
- **Seasonal and current.** Glass pumpkins in the fall, "have plans this November?", festival
  weekends. Pages should have a slot that changes with the season (a featured class, the next
  Big Jam, a festival) so the site never looks frozen.
- **Rooted in the community.** WV Fiber Festival, Blackberry Fest, Best of Morgantown
  voting, local makers in the gallery shop. Show the studio out in Morgantown, not only inside.
- **A little playful in the voice.** "My new favorite hobby", "if you've been to Maple &
  Spruce lately", "learn how to make this bracelet!". Warm, first-person, an exclamation mark
  is allowed. Never cute for its own sake, never salesy.
- **Many crafts under one roof.** Glass, jewelry, macrame, fiber, pottery, music, repair. The
  variety is the point of a folk arts collective; let it show, but only promise classes the
  studio actually runs.

In practice: real photos and short video over illustration, captions in Katie's voice, and
UI that frames the work (white cards, generous margins) rather than competing with it.
Customer faces, children above all, appear only with permission; prototypes use placeholder
frames or staff/process shots.

## 2. Lead with what someone came to do

Each page answers its visitor's question in the first screen, then gets out of the way.

- Listing pages sort by **date**, not category, at the studio's volume (~5 classes a month).
- Detail pages are **book-first**: title, a facts strip (dates, time, instructor, location),
  the price, true seat count, one primary action. Story and detail come after.
- One primary action per screen. Secondary actions are outline buttons or text links.
- On phones, the primary action follows the reader: the sticky "Next class · date · seats ·
  Reserve" bar is the pattern.

## 3. Only say what is true

- Seat counts only when real; full classes say **Join waitlist** and keep their dates visible
  (keyed on `spotsRemaining <= 0`).
- No ratings, review stars, "selling fast", countdowns or invented stats.
- "The price you see is the price": state what is included (tools, materials, safety gear).
- Never present things the studio does not run: **no Open Studio Socials**, no free lesson
  of any kind (the Suzuki no-cost *interview* is Suzuki-only), no recurrence rule for the Big
  Jam ("select Saturdays", next date on the Calendar). Prototypes must check offerings against
  current memory/docs before copy goes on an artboard.

## 4. Show the ladder

Visitors should always see where they are and what comes next.

- **Craft**: Try It (1 session) → Workshop (2) → Studio Series (6 weeks) → Craft Club
  ($30/month, requires a finished Studio Series).
- **Music**: Big Jam (free, open) → lessons (Suzuki interview for Suzuki families) → group
  class/recitals ($130 → $165/mo tuition step). Music Together is its own track.
- Every page ends with the logical next step, not a generic "Contact us".

## 5. Specific beats generic

Use the true, uncopyable details: the converted church on Beulah Rd, a violin being spruce on
top and maple on the back (the shop's name), Katie as a luthier, "Katie's mom, Stephanie
Zucker", what you take home from a class. Real photography over stock; where a photo does not
exist yet, build the frame and hide it (`visibility:false`) rather than fill it with stock.

## 6. Visual system

| Element | Rule |
|---|---|
| Type | Georgia for headings and body; Archivo only for buttons, eyebrows, small labels. Never Lora/Inter/system-ui. |
| Eyebrows | Archivo, uppercase, `letter-spacing: .16em`, small; sage on light grounds, `#C7D2BB` on spruce. |
| Grounds | Warm off-white (`#F6F4EE` / `#FAF8F2`) alternating with brand cream `#D5D6C8`; white for cards and booking surfaces. |
| Feature bands | Deep spruce `#3D4A38` (or maple brown `#4A3728`) with `#F5F2E8` text, for a hero or a closing call to action, at most two per page. |
| Ink | Headings `#4A3728`. Body `#55524A`, not the token's `#7A7A6E`, which fails 4.5:1 on white. |
| Primary button | Darkened sage (`#56664A`) so white text passes contrast; cream button on spruce bands. |
| Lines & radius | Hairlines `#E4E1D6`/`#D3CFC2`; cards 12–18px radius; chips and status pills fully rounded. |
| Rhythm | Sections are `96px` (64px on mobile) bands with a `1120px` inner and `clamp(20px,5vw,40px)` gutter. Do **not** reuse the legacy `.section` / `.section-6` / `.container.is-small` classes (uneven padding, hidden centring). |
| Copy | No em dashes (en dashes in ranges are fine), at most one bold phrase per section, "would Katie say this out loud?" |
| Accessibility | 4.5:1 text, 44px touch targets, real buttons and links, every page works at 393px. |

## 7. Shared shell

All prototypes reuse the header (Home · Music · Craft · About, plus Upcoming classes) and footer
("Open Wed & Sat, 12 to 6pm") drawn in the `ClassPage` artboard, so pages look like one site.
Shell changes are proposed in the Home prototype only.

## 8. Build constraints to design within

- Registration widgets, the Craft Club signup/manage components and payment pages are **React
  code components**: prototypes restyle the page around them, never redesign their flow.
- CMS-driven pages (Classes, Artists, Instructors, Blog Posts) can only show fields that exist.
  Name any new field a design needs, rather than drawing data the CMS cannot supply.
- Music Together pages follow MT Worldwide's brand (purple, licensed lockup) and stay out of
  this pass.

---

## Prototype plan (2026-10-15)

Each family gets its own Design canvas with desktop (1440) and iPhone 16 (393×852) artboards
per page. Prototypes only: nothing changes in Webflow until David approves a canvas, and then
implementation is a separate piece of work per family.

| # | Family | Pages | Notes |
|---|---|---|---|
| 1 | Front door | `/` (Home) | Highest traffic. Routes to the craft, music and visit tracks; owns any shell changes. |
| 2 | Craft | `/classes` (Craft Classes), `/craft-club`, `/craft-club-join`, `/craft-club-manage`, `/private-events`, `/gallery` | Must match the approved Upcoming Classes language and the ladder. Join/manage pages wrap code components. |
| 3 | Visit & services | `/our-story`, `/contact` (FAQ), `/fiddle-repair`, `/calendar`, `/signup`, plus one shared template for `/cancellation-policy`, `/privacy-policy`, `/404`, `/pattern-scaling-tool` | FAQ JSON-LD must keep matching visible question text. |
| 4 | Makers & stories | `/shop`, `/our-artists`, Artists template, Instructors template, `/blog`, Blog Posts template | CMS templates: design within existing fields. |

Already done: `/suzuki`, `/music`, `/music-lessons` (live), `/upcoming-classes` and the Classes
template (approved prototype). Out of scope: Music Together pages, drafts
(`/test-class-enrollment`, `/music-together-archived`, Class Categories template).

**Known fix in the approved canvas:** the Upcoming Classes `Main` artboard's ladder still lists
"Open Studio Social · Free" as step 1. Replace it with Try It → Workshop → Studio Series →
Craft Club before implementation.
