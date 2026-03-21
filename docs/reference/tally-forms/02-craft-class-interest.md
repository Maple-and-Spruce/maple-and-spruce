# Craft Class Interest — Tally Form Blueprint

> Build this form in Tally by working top to bottom.
> - Plain text → just type it
> - `/ block-type` → type `/` and select that block from the menu
> - **BULK PASTE** sections → copy the line-separated list and paste into the block's bulk-insert

---

## Form content (type / paste in order)

```
Craft Class Interest
```
_(Form title)_

```
Interested in a class? Let us know which ones catch your eye and we'll save your spot or notify you when registration opens.
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

### Which class(es) are you interested in? (select all that apply)
`/ checkboxes` → required

**BULK PASTE options:**
```
Wire Wrapping (1.5 hrs, $40)
Beading & Gemstone Jewelry (1.5 hrs, $35)
Stained Glass — Intro (3 hrs, $60)
Stained Glass — 4-Session Series (4×3 hrs, $180)
Pottery "Dirt to Dishes" (6-week series, $180)
Micro Macrame Series (5×1.5 hrs, $100)
Open Studio Social (free)
Other
```

---

### If you selected "Other," what craft are you interested in?
`/ short answer`

> 💡 Tip: Use conditional logic to only show this when "Other" is checked above.

---

### How many people in your group?
`/ dropdown`

**BULK PASTE options:**
```
Just me
2
3–5
6+ (group / private event)
```

---

### Experience Level
`/ multiple choice`

**BULK PASTE options:**
```
Never tried this craft before
Tried it once or twice
I have some experience
```

---

### Preferred Schedule (select all that apply)
`/ checkboxes`

**BULK PASTE options:**
```
Weekday evenings
Saturday
Sunday
```

---

### Anything else we should know?
`/ long answer`

---

/ button → label: **Reserve My Spot**

---

## Thank You page

```
Thanks for your interest in craft classes!
```

```
We'll be in touch soon with class dates and registration details. Check out our Craft page in the meantime to learn more about the crafting pathway from classes to Craft Club.
```

---

## Settings checklist

- [ ] Email notification → katie@mapleandsprucefolkarts.com
- [ ] Confirmation email to respondent (optional)
- [ ] Conditional logic: show "Other" text field only when "Other" is checked
- [ ] Embed on: `/classes` page (replace "Online registration is coming soon!" section)
