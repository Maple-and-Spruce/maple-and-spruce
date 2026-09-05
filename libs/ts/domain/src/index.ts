// Shared interfaces
export * from './lib/payee';
export * from './lib/gallery-image';

// Domain types
export * from './lib/artist';
export * from './lib/category';
export * from './lib/product';
export * from './lib/sale';
export * from './lib/payout';
export * from './lib/inventory-movement';
export * from './lib/sync-conflict';

// Phase 5: Etsy Integration
export * from './lib/etsy';
export * from './lib/etsy-import';

// Phase 3: Classes & Workshops
export * from './lib/instructor';
export * from './lib/class';
export * from './lib/schedule-format';
export * from './lib/class-category';
export * from './lib/registration';
export * from './lib/pos-sale-request';
export * from './lib/pos-lesson-attribution';
export * from './lib/pos-lesson-config';
export * from './lib/discount';
export * from './lib/tax';
export * from './lib/class-waitlist';

// Phase 4: Music Lessons
export * from './lib/student';
export * from './lib/lesson';
export * from './lib/lesson-block';
export * from './lib/lesson-inquiry';
export * from './lib/inquiry-to-student';
export * from './lib/hope-submission';
export * from './lib/needs-attention';
export * from './lib/student-lesson-schedule';
export * from './lib/lesson-billing-rule';
export * from './lib/lesson-scheduled-charge';
export * from './lib/openings';
export * from './lib/invoice';
export * from './lib/hope-rates';
export * from './lib/lesson-rates-config';
export * from './lib/business-payment-config';
export * from './lib/teacher-payout';

// Phase 4.5: Calendar
export * from './lib/calendar-event';
export * from './lib/calendar-embed-config';
export * from './lib/room';

// Agreements & Waivers
export * from './lib/agreement-template';
export * from './lib/agreement-request';
export * from './lib/signed-agreement';

// Craft Club (recurring studio-access membership)
export * from './lib/craft-club-member';

// Music Together (separate-business early-childhood music program)
export * from './lib/music-together-semester';
export * from './lib/music-together-section';
export * from './lib/music-together-registration';
export * from './lib/music-together-pricing';
export * from './lib/music-together-scheduled-charge';
export * from './lib/music-together-waitlist';
export * from './lib/music-together-demo';
export * from './lib/music-together-demo-rsvp';
export * from './lib/music-together-interest';
export * from './lib/music-together-licensee';

// User & role administration
export * from './lib/app-user';

// State management
export * from './lib/request-state';
