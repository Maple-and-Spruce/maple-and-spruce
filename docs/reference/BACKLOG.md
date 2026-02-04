# Maple & Spruce - Development Backlog

> Add ideas, features, and tasks here. Move to REQUIREMENTS.md when prioritized.

---

## Planned Enhancements

### Inventory & Products
- [ ] Add link to Square item from inventory table rows
- [ ] Align inventory/product form with Etsy's product form for seamless future Etsy integration (needs research — study Etsy's form fields, identify overlap, and innovate to make form entry easier than Etsy's native interface)

### Classes & Workshops
- [ ] Add category support for Classes/Workshops (similar to product categories)
- [ ] Investigate whether class/workshop categories should be based on Square categories

### Square Integration
- [ ] Investigate whether product categories should be synced from/to Square categories

### Developer Experience
- [ ] Implement agentic coding pattern: continually author and document discrete decisions after planning and implementation changes (self-documenting ADR workflow)

---

## Ideas & Future Features

### Customer Experience
- [ ] Gift cards / gift certificates
- [ ] Class pass bundles (buy 5 get 1 free)
- [ ] Wishlist for classes
- [ ] "Notify me" for sold out classes
- [ ] Social sharing of class purchases
- [ ] Review/rating system for classes
- [ ] Photo gallery of past workshops

### Operations
- [ ] Staff scheduling
- [ ] Inventory alerts (low stock)
- [ ] Sales analytics dashboard
- [ ] Customer analytics (repeat buyers, class preferences)
- [ ] Automated payout reminders

### Marketing
- [ ] Email newsletter integration
- [ ] SMS notifications for class reminders
- [ ] Referral program
- [ ] Loyalty points
- [ ] Seasonal/holiday promotions

### Technical Improvements
- [ ] PWA for mobile access
- [ ] Offline capability for POS
- [ ] Automated backups
- [ ] Performance monitoring
- [ ] Error tracking (Sentry)

---

## Research Needed

### Cal.com vs Calendly
- Cal.com: Open source, self-hostable, API access
- Calendly: Simpler, proven, limited customization
- **Questions**:
  - How important is the booking UX?
  - Need custom availability rules?
  - Budget for Cal.com pro?

### Etsy Product Form Alignment
- What fields does Etsy's product form use?
- Which fields overlap with our current inventory form?
- What fields are Etsy-specific vs universal?
- How can we make form entry faster/easier than Etsy's native UI?
- **Goal**: Ensure our product data model supports seamless Etsy sync without re-entry

### Etsy API Limitations
- Rate limits
- Webhook availability
- Inventory sync reliability
- **Questions**:
  - How many products?
  - How often do items sell?
  - Worth the complexity?

### Square Integration Depth
- Read-only sales data vs full sync
- Real-time webhooks vs polling
- **Questions**:
  - What Square plan?
  - Need real-time or daily ok?

---

## Technical Debt & Cleanup

### UI Bugs
- [ ] Drag handle icon in category table is broken/not displaying
- [x] ~~Snapshot tests involving dates/times~~ — Fixed: replaced dynamic `futureDate()`/`pastDate()`/`new Date()` in Storybook fixtures with deterministic dates

### Code Quality
- [x] ~~Drive toward declarative code style~~ — Audited: codebase is already declarative. Only 2 minor instances found (async iterator collection, forEach with batch side effects) which are idiomatic for their use cases
- [ ] Backend API responses should return structured errors useful for UI form validation (field-level messages, not just generic errors)
- [ ] `.claude/settings.local.json` is tracked in git — should be gitignored since it's developer-specific

### Architecture
- [ ] Split web app code into semantic Nx libraries for re-usability, modularity, composability, and faster CI (affected build/test/lint only)
- [ ] Environment lookup has hardcoded checks — refactor to a more natural/config-driven approach
- [ ] Implement better dependency caching in CI for faster pipeline runs

### Testing
- [ ] Add comprehensive test coverage including interaction tests that validate all functional requirements of the platform
- [ ] Fix date/time-dependent snapshot tests to use deterministic values

---

## Won't Do (For Now)

*Features we've decided not to build, with reasoning*

| Feature | Reason | Revisit? |
|---------|--------|----------|
| Mobile app | Web works fine, low volume | Maybe year 2 |
| Multi-currency | US only | No |
| Multi-language | English only market | No |

---

*Last updated: 2026-02-03*
