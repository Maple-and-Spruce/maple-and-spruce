/**
 * Date hydration for Music Together payloads returned by callables.
 *
 * Firebase callables serialize `Date` to an ISO string, but the response types
 * still declare `Date`. TypeScript therefore cannot catch a consumer that
 * treats the value as a Date, and the mistake only surfaces at runtime, in
 * whichever branch first calls a Date method.
 *
 * That is exactly how the roster's Cancel / refund button crashed the admin
 * app: the roster hook hydrated its entries and waitlist but passed `section`
 * through raw, so `section.sessions[].dateTime` stayed a string.
 * `mtSectionFirstSessionAt` compares with `<`, which happens to work on ISO
 * strings, so it silently returned a *string* typed `Date | undefined`, and
 * `mtRefundCents` then called `.getTime()` on it. The TypeError was thrown
 * both from the click handler and again while rendering the refund dialog,
 * which took the whole page down rather than surfacing an error.
 *
 * Anything that reads a callable-returned section must hydrate it here first.
 */
import type { MusicTogetherSection } from '@maple/ts/domain';

/** Hydrate ISO date strings (callable serialization) back into Dates. */
export function hydrateMusicTogetherSection(
  section: MusicTogetherSection
): MusicTogetherSection {
  return {
    ...section,
    sessions: (section.sessions ?? []).map((s) => ({
      dateTime: new Date(s.dateTime),
    })),
    installmentPlan: section.installmentPlan?.map((i) => ({
      amountCents: i.amountCents,
      dueAt: new Date(i.dueAt),
    })),
    createdAt: new Date(section.createdAt),
    updatedAt: new Date(section.updatedAt),
    ...(section.enrollmentOpensAt
      ? { enrollmentOpensAt: new Date(section.enrollmentOpensAt) }
      : {}),
    ...(section.enrollmentClosesAt
      ? { enrollmentClosesAt: new Date(section.enrollmentClosesAt) }
      : {}),
  };
}
