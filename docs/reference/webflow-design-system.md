# Webflow Design System

Reference for the design tokens and styles configured in the Webflow Designer for the Maple & Spruce Folk Arts Collective site.

**Site ID:** `691a5d6c07ba1bf4714e826f`

---

## Variable Collections

Variables are organized into collections. Typography and Sizes collections have responsive modes (Tablet, Mobile L, Mobile).

### Colors

Collection ID: `collection-fffbab3a-99a9-a255-806c-41e9398c9c76`

| Token | Variable ID | Value | Purpose |
|-------|-------------|-------|---------|
| `color-cream` | `variable-3d8c32ae-94cb-a01c-66f9-832a2be0e80a` | `#D5D6C8` | Backgrounds |
| `color-dark-brown` | `variable-a171d952-bb53-afe2-08f4-871c5e013f2e` | `#4A3728` | Headings |
| `color-sage-green` | `variable-6dfce056-483c-b806-d4bf-e6a5aa7a4bf3` | `#6B7B5E` | Primary / buttons |
| `color-warm-gray` | `variable-8d5505bc-d875-69d0-6260-5580a3ec8ee5` | `#7A7A6E` | Body text |
| `color-white` | `variable-79149ef6-3604-51c8-cd18-47b070bc5bd3` | `#FFFFFF` | Light backgrounds |
| `color-off-black` | `variable-11cd70fb-cdbd-a50d-2664-e26225f19f6f` | `#1A1A1A` | Dark text fallback |

### Typography

Collection ID: `collection-c11ec280-12eb-0d4b-26b2-2d2a606fa16d`

Modes:
- Tablet: `mode-dcfd1db1-7409-bcc7-6d58-de50ec2b02d3`
- Mobile (L): `mode-4275a80c-b639-3705-1310-d01fd3f133a7`
- Mobile: `mode-cda26757-2ce7-4b67-954f-30f4628740e3`

| Token | Variable ID | Desktop | Tablet | Mobile L | Mobile |
|-------|-------------|---------|--------|----------|--------|
| `font-size-h1` | `variable-546f60df-37a8-238c-62a7-46ee8fbd5251` | 48px | 40px | 36px | 32px |
| `font-size-h2` | `variable-32660088-7d65-135a-725b-55677eda5aad` | 36px | 32px | 28px | 24px |
| `font-size-h3` | `variable-a16595ff-8d62-338b-939a-cc17ce324663` | 28px | 24px | 22px | 20px |
| `font-size-subtitle` | `variable-cbe75c9a-66ed-40c9-f7cd-83928634fd3a` | 20px | 18px | 18px | 16px |
| `font-size-body` | `variable-fca0c8af-8495-2ac9-afb3-adb425c4f25b` | 16px | 16px | 16px | 15px |
| `font-size-caption` | `variable-10ba276e-ed81-3c5d-bd0d-082afbb166c9` | 14px | 14px | 13px | 13px |

#### Font Families — TO ADD

The React MUI theme now uses **Lora** for headings and **Archivo** for body
(see `libs/react/theme/src/lib/theme.ts`). Webflow does NOT yet have matching
`font-family-*` variables, so the published site falls back to the template's
default fonts — meaning Webflow and the admin app are currently **inconsistent**.

To bring them into parity, add these variables to the Typography collection:

| Token | Value | Used by |
|-------|-------|---------|
| `font-family-heading` | `"Lora", Georgia, "Times New Roman", serif` | `heading-1`, `heading-2`, `heading-3` |
| `font-family-body` | `"Archivo", system-ui, -apple-system, sans-serif` | `subtitle-text`, `body-text`, `caption-text`, button styles |

After creating the variables:
1. Apply `font-family-heading` to `heading-1`, `heading-2`, `heading-3` styles.
2. Apply `font-family-body` to `body-text` (and inherit through `subtitle-text`, `caption-text`, button styles).
3. In Webflow Project Settings → Custom Code (Head), add the same Google Fonts link served by the admin app:
   ```html
   <link rel="preconnect" href="https://fonts.googleapis.com" />
   <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
   <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Lora:wght@400;500;700&display=swap" />
   ```
4. Republish the site.

Required weights (must match the admin app): **Lora 400/500/700**, **Archivo 400/500/600/700**.

### Sizes

Collection ID: `collection-07974992-4727-b048-2eda-34e778530074`

Modes:
- Tablet: `mode-cc41dd36-2dc8-2002-00f3-cd107a951830`
- Mobile (L): `mode-e52db4ec-ac93-69e5-6a28-aa4ee8165f69`
- Mobile: `mode-4c07d597-e4a4-be34-60b5-caedbcdcb5dc`

| Token | Variable ID | Desktop | Mobile L / Mobile |
|-------|-------------|---------|-------------------|
| `radius-sm` | `variable-922d5ca4-b388-fd53-4f3e-8391ad7740ed` | 4px | 4px |
| `radius-md` | `variable-32267c5a-7528-bb72-1edc-e6ba45ad8613` | 8px | 8px |
| `radius-lg` | `variable-ec591853-73f2-b4d5-efb4-c0f5ab003757` | 16px | 12px |

### Other Collections

| Collection | ID | Status |
|------------|----|--------|
| Base collection | `collection-d8f3e36b-9dd1-1226-a2c6-daa7d263dfaf` | Empty (template default) |
| Interactions | `collection-2c5b0971-9758-44ae-aafc-e847257a9da5` | Empty (template default) |

---

## Styles (Classes)

### Typography Styles

All typography styles use color and font-size variables so they respond automatically to breakpoint modes.

| Style | ID | Font Size Token | Color Token | Weight | Line Height |
|-------|----|-----------------|-------------|--------|-------------|
| `heading-1` | `dbd08838-4bd7-4e0b-752b-07fc550cb0b5` | `font-size-h1` | `color-dark-brown` | 700 | 1.2 |
| `heading-2` | `5a72953d-737c-feda-8f46-8d8faef1ca24` | `font-size-h2` | `color-dark-brown` | 700 | 1.25 |
| `heading-3` | `88a63830-2d0e-f091-463b-2343f46c4362` | `font-size-h3` | `color-dark-brown` | 600 | 1.3 |
| `subtitle-text` | `8535bd1b-d82d-460b-d041-20b111489f64` | `font-size-subtitle` | `color-warm-gray` | 500 | 1.4 |
| `body-text` | `99027d30-42c2-fbac-f79e-9263c34c96e8` | `font-size-body` | `color-warm-gray` | 400 | 1.6 |
| `caption-text` | `44cf4ff2-350d-ee58-e6ca-c8de28d27727` | `font-size-caption` | `color-warm-gray` | 400 | 1.5 |

### Button Styles

All button styles use `font-size-body` for text, `radius-md` for corners, and include hover states.

| Style | ID | Background | Text Color | Border | Hover |
|-------|----|------------|------------|--------|-------|
| `btn-primary` | `085dab51-84c8-7b27-c0a3-01762e18713d` | `color-sage-green` | `color-white` | None | opacity 0.85 |
| `btn-secondary` | `b11c3d8d-7ada-e5ad-d749-9c3ed7b8d228` | `color-dark-brown` | `color-cream` | None | opacity 0.85 |
| `btn-outline` | `82d963ab-c4bd-3d16-f55c-4d59127600a5` | Transparent | `color-sage-green` | 1px solid sage | Fill sage, text white |

Button padding: 12px top/bottom, 24px left/right (outline: 11px/23px to account for border).

---

## Follow-Up: Applying Across the Site

The tokens and styles are created but not yet applied to existing page elements. Next steps:

1. **Audit existing pages** — Identify elements using hardcoded colors/sizes instead of the new tokens
2. **Replace inline styles** — Swap hardcoded values for the new design token variables
3. **Apply typography classes** — Set `heading-1`, `heading-2`, `heading-3`, `subtitle-text`, `body-text`, `caption-text` on text elements
4. **Apply button classes** — Set `btn-primary`, `btn-secondary`, `btn-outline` on buttons/links
5. **Add font family tokens** — Add `font-family-heading` (Lora) and `font-family-body` (Archivo) variables to the Typography collection (see "Font Families — TO ADD" above for exact values)
6. **Review at all breakpoints** — Verify responsive scaling looks correct on tablet and mobile

### Notes

- The site has ~1050 existing styles from a template. Many may use hardcoded values that should migrate to tokens.
- Font family variables are NOT yet defined in Webflow. The React MUI theme uses Lora (headings) and Archivo (body) as of the typography font PR — Webflow needs matching variables and a Google Fonts link in the site head to stay in sync.
- The MUI theme in the React app uses the same brand colors (see `.claude/rules/react-components.md`).
