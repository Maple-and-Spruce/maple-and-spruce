# Fiddle Repair Request — Tally Form Blueprint

> Build this form in Tally by working top to bottom.
> - Plain text → just type it
> - `/ block-type` → type `/` and select that block from the menu
> - **BULK PASTE** sections → copy the line-separated list and paste into the block's bulk-insert

---

## Form content (type / paste in order)

```
Fiddle Repair Request
```
_(Form title)_

```
Have a fiddle that needs some love? Tell us about it and we'll let you know how we can help. For simple jobs like new strings or a bridge, you can also just drop by!
```

/ divider

---

### Your Name
`/ short answer` → required

### Email
`/ email` → required

### Phone Number
`/ phone number`

---

### What type of instrument?
`/ dropdown` → required

**BULK PASTE options:**
```
Student violin
Intermediate violin ($200–$2,000 value)
Old-time / folk fiddle
Other (we may not be able to help)
```

---

### Approximate value of the instrument
`/ dropdown`

**BULK PASTE options:**
```
Under $200
$200–$1,000
$1,000–$2,000
$2,000–$3,000
Over $3,000 (we don't work on these)
Not sure
```

---

### What's wrong with it? (select all that apply)
`/ checkboxes`

**BULK PASTE options:**
```
Needs new strings
Pegs are sticky or slipping
Needs a new bridge
Has a crack
Rib damage
Neck issues
Found it in an attic/closet — not sure what it needs
Other
```

---

### Please describe the issue
`/ long answer`

---

### Photos of the Instrument (photos help us give a better estimate — show the damage if possible)
`/ file upload` → allow multiple files

---

/ button → label: **Submit Repair Request**

---

## Thank You page

```
Thanks for reaching out about your fiddle!
```

```
Katie will review your request and get back to you with an estimate. You can also bring the instrument in for an in-person assessment.
```

---

## Settings checklist

- [ ] Email notification → katie@mapleandsprucefolkarts.com
- [ ] Confirmation email to respondent (optional)
- [ ] Embed on: `/fiddle-repair` page (after the pricing section, near "Bring in your fiddle for an estimate")
