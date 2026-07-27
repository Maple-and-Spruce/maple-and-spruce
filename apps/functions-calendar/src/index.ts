/**
 * Firebase Cloud Functions — Calendar ICS Feeds Codebase
 *
 * This codebase contains calendar ICS feed generation functions.
 * Separated to isolate ical-generator and timezone dependencies
 * from other functions, reducing cold start times.
 */
// MUST be first: sets global maxInstances before any function is defined.
// See global-runtime-options.ts for the ordering contract.
import '@maple/firebase/functions/global-runtime-options';
import { getApps, initializeApp } from 'firebase-admin/app';

if (getApps().length === 0) {
  initializeApp();
}

// Calendar ICS feeds (HTTP endpoints)
export { calendarClassesFeed } from '@maple/firebase/maple-functions/calendar-classes-feed';
export { calendarMusicFeed } from '@maple/firebase/maple-functions/calendar-music-feed';
export { calendarEventsFeed } from '@maple/firebase/maple-functions/calendar-events-feed';
export { calendarHoursFeed } from '@maple/firebase/maple-functions/calendar-hours-feed';
export { calendarAllFeed } from '@maple/firebase/maple-functions/calendar-all-feed';
export { calendarAdhocProxy } from '@maple/firebase/maple-functions/calendar-adhoc-proxy';
export { calendarMusicTogetherFeed } from '@maple/firebase/maple-functions/calendar-music-together-feed';
export { calendarFamilyMusicTogetherFeed } from '@maple/firebase/maple-functions/calendar-family-music-together-feed';
export { calendarPrivateFeed } from '@maple/firebase/maple-functions/calendar-private-feed';
