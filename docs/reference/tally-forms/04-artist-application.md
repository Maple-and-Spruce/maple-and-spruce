# Artist Application — Tally Form Blueprint

> Build this form in Tally by working top to bottom.
> - Plain text → just type it
> - `/ block-type` → type `/` and select that block from the menu
> - **BULK PASTE** sections → copy the line-separated list and paste into the block's bulk-insert

---

## Form content (type / paste in order)

```
Artist Application
```
_(Form title)_

```
Interested in consigning your work at Maple & Spruce? Tell us about yourself and your craft. We look for local artisans who practice traditional or folk arts and share our values of inclusion and community.
```

/ divider

---

### Your Name
`/ short answer` → required

### Email
`/ email` → required

### Phone Number
`/ phone number`

### Where are you located? (city/town)
`/ short answer` → required

---

### Website or Social Media Links
`/ long answer`

```
Instagram, Etsy, personal site, etc.
```
_(Type this as placeholder/description text below the field)_

---

### What do you make? (select all that apply)
`/ checkboxes`

**BULK PASTE options:**
```
Pottery / Ceramics
Jewelry
Fiber Arts (weaving, knitting, etc.)
Woodwork
Stained Glass
Leather
Candles / Soap
Other
```

---

### If "Other," please describe
`/ short answer`

> 💡 Tip: Use conditional logic to only show this when "Other" is checked above.

---

### Tell us about your work and what inspires it
`/ long answer` → required

---

### Photos of Your Work (3–5 photos that represent your style and range)
`/ file upload` → allow multiple files

---

### Are you interested in any of the following? (select all that apply)
`/ checkboxes`

**BULK PASTE options:**
```
Selling through our shop (consignment)
Teaching a class or workshop
Participating in community events
```

---

### Anything else you'd like us to know?
`/ long answer`

---

/ button → label: **Submit Application**

---

## Thank You page

```
Thanks for applying!
```

```
We'll review your application and be in touch soon. We love learning about local makers and are excited to see your work.
```

---

## Settings checklist

- [ ] Email notification → katie@mapleandsprucefolkarts.com
- [ ] Confirmation email to respondent (optional)
- [ ] Conditional logic: show "Other describe" only when "Other" is checked
- [ ] Embed on: `/our-artists` page (replace "Get in Touch" button that links to Contact)
