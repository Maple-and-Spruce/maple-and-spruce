/**
 * Browser-side "Add to Calendar" helpers for the registration confirmation.
 *
 * A downloaded .ics only reaches a calendar in some browsers. Safari on iPhone
 * opens it in Calendar, but Chrome, Firefox, Edge and in-app browsers on iOS
 * (Instagram, Facebook) just offer to save the file. So the widget also offers
 * Google and Outlook links, which work anywhere, and the confirmation email
 * carries the same .ics as an attachment.
 *
 * The event building itself lives in `@maple/ts/domain` (class-calendar), shared
 * with the confirmation email.
 */
import { buildClassIcs, type ClassCalendarEntry } from '@maple/ts/domain';

/**
 * True for an iOS browser that is not Safari: Chrome, Firefox, Edge, Opera,
 * the Google app, and in-app web views. These save an .ics as a file instead
 * of opening it in Calendar.
 */
export function isIosNonSafari(
  userAgent: string,
  maxTouchPoints = 0
): boolean {
  const isIos =
    /iPhone|iPad|iPod/.test(userAgent) ||
    // iPadOS asks for the desktop site and reports itself as a Mac.
    (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  if (!isIos) return false;
  const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\//.test(userAgent);
  // In-app web views (Instagram, Facebook, Gmail) leave out "Safari/".
  const looksLikeSafari =
    /Version\/\d/.test(userAgent) && /Safari\//.test(userAgent);
  return otherBrowser || !looksLikeSafari;
}

/** Download every entry as one `class.ics`. */
export function downloadIcs(
  entries: ReadonlyArray<ClassCalendarEntry>,
  filename = 'class.ics'
): void {
  const blob = new Blob([buildClassIcs(entries)], {
    type: 'text/calendar;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoking straight away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
