# Maple & Spruce - Development Backlog

> Add ideas, features, and tasks here. Move to REQUIREMENTS.md when prioritized.

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

*As we build, track things to clean up later*

- [ ] (placeholder)

---

## Won't Do (For Now)

*Features we've decided not to build, with reasoning*

| Feature | Reason | Revisit? |
|---------|--------|----------|
| Mobile app | Web works fine, low volume | Maybe year 2 |
| Multi-currency | US only | No |
| Multi-language | English only market | No |

---

*Last updated: 2025-01-06*
