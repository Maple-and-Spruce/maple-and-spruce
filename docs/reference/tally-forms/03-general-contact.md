# General Contact — Tally Form Blueprint

> Build this form in Tally by working top to bottom.
> - Plain text → just type it
> - `/ block-type` → type `/` and select that block from the menu
> - **BULK PASTE** sections → copy the line-separated list and paste into the block's bulk-insert

---

## Form content (type / paste in order)

```
Contact Us
```
_(Form title)_

```
Have a question? Send us a message and we'll get back to you soon.
```

/ divider

---

### Your Name
`/ short answer` → required

### Email
`/ email` → required

---

### What is this about?
`/ dropdown` → required

**BULK PASTE options:**
```
Music lessons
Craft classes
Fiddle repair
Selling my art (consignment)
Old Time jam
Group event
General question
Other
```

---

### Your Message
`/ long answer` → required

---

/ button → label: **Send Message**

---

## Thank You page

```
Thanks for reaching out!
```

```
We'll get back to you as soon as we can. You can also reach us at katie@mapleandsprucefolkarts.com or (304) 314-4506.
```

---

## Settings checklist

- [ ] Email notification → katie@mapleandsprucefolkarts.com
- [ ] Confirmation email to respondent (optional)
- [ ] Embed on: `/contact` page (below FAQ section, replace email-only CTA)
