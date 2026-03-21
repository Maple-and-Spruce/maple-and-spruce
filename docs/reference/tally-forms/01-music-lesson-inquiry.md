# Music Lesson Inquiry — Tally Form Blueprint

> Build this form in Tally by working top to bottom.
> - Plain text → just type it
> - `/ block-type` → type `/` and select that block from the menu
> - **BULK PASTE** sections → copy the line-separated list and paste into the block's bulk-insert

---

## Form content (type / paste in order)

```
Music Lesson Inquiry
```
_(This is the form title — click the "Form title" placeholder and type it)_

```
We'd love to help you get started with music lessons at Maple & Spruce! Fill out this form and we'll be in touch within 2 business days.
```

/ divider

---

### Parent or Student Name
`/ short answer` → required

### Email
`/ email` → required

### Phone Number
`/ phone number`

---

### Which instrument are you interested in?
`/ dropdown` → required

**BULK PASTE options:**
```
Suzuki Violin
Old-Time Fiddle
Guitar (notify me when available)
```

---

### Who is the student?
`/ multiple choice` → required

**BULK PASTE options:**
```
My child (under 18)
Myself (adult)
```

---

### If the student is a child, how old are they?
`/ short answer`

> 💡 Tip: Use conditional logic to only show this when "My child (under 18)" is selected above.

---

### Experience Level
`/ multiple choice` → required

**BULK PASTE options:**
```
Complete beginner
Some experience (played before but no formal lessons)
Intermediate (currently playing or had previous lessons)
```

---

### Preferred Lesson Length
`/ multiple choice`

**BULK PASTE options:**
```
30 minutes ($35)
60 minutes ($70)
```

---

### Do you need to borrow a fiddle through our instrument loan program?
`/ multiple choice`

**BULK PASTE options:**
```
Yes
No
Maybe — I'd like to learn more
```

---

### Preferred Days (select all that apply)
`/ checkboxes`

**BULK PASTE options:**
```
Monday
Tuesday
Wednesday
Thursday
Friday
Saturday
```

---

### Anything else we should know?
`/ long answer`

---

/ button → label: **Submit Inquiry**

---

## Thank You page

```
Thank you for your interest in music lessons!
```

```
We'll be in touch within 2 business days to discuss scheduling and answer any questions. In the meantime, feel free to visit our Music Lessons page to learn more.
```

---

## Settings checklist

- [ ] Email notification → katie@mapleandsprucefolkarts.com
- [ ] Confirmation email to respondent (optional)
- [ ] Conditional logic: show "child age" only when student = "My child (under 18)"
- [ ] Embed on: `/music-lessons` page (replace "Online sign-up is coming soon!" section)
