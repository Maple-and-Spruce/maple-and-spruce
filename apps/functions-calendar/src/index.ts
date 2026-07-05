/**
 * Firebase Cloud Functions — Calendar ICS Feeds Codebase
 *
 * This codebase contains calendar ICS feed generation functions.
 * Separated to isolate ical-generator and timezone dependencies
 * from other functions, reducing cold start times.
 */
import admin from 'firebase-admin';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

// Calendar ICS feeds (HTTP endpoints)
export { calendarClassesFeed } from '@maple/firebase/maple-functions/calendar-classes-feed';
export { calendarMusicFeed } from '@maple/firebase/maple-functions/calendar-music-feed';
export { calendarEventsFeed } from '@maple/firebase/maple-functions/calendar-events-feed';
export { calendarHoursFeed } from '@maple/firebase/maple-functions/calendar-hours-feed';
export { calendarAllFeed } from '@maple/firebase/maple-functions/calendar-all-feed';
export { calendarAdhocProxy } from '@maple/firebase/maple-functions/calendar-adhoc-proxy';
export { calendarMusicTogetherFeed } from '@maple/firebase/maple-functions/calendar-music-together-feed';
