/**
 * publicSite — the public reads the Webflow widgets make, as one Cloud
 * Function in `maple-core` (ADR-029).
 *
 * **Why these are together: one warm instance instead of five.** The class and
 * Music Together widgets fetch on mount, so a cold `maple-core` start (~6s) is
 * a visitor staring at a spinner. Five of these reads each kept an instance
 * warm in prod (`minInstances: 1`) to avoid that, and an idle warm instance
 * bills its CPU and memory all month: about $8 each, so ~$40 of a ~$40 bill.
 * One router keeps one instance warm for all of them, and at `concurrency: 80`
 * one instance serves this traffic many times over.
 *
 * The three other public reads the same widgets make soon after mount
 * (`getRegistrationStatus`, `calculateRegistrationCost`, `lookupDiscount`)
 * were cold; here they share the warm instance for free.
 *
 * **Every route is public, on purpose** — each is allowlisted by route name in
 * `tools/check-callable-roles.ts`. Only reads belong here. The public writes
 * (checkout, waitlists, RSVPs) stay with their domains; a route added here
 * must be safe for anyone on the internet to call.
 *
 * Warm in prod only: dev, the emulator and CI run cold, since nobody is
 * waiting on them.
 */
import { Functions, codeLookupThrottles } from '@maple/firebase/functions';
import { SQUARE_STRING_NAMES } from '@maple/firebase/square';
import type {
  CalculateRegistrationCostRequest,
  CalculateRegistrationCostResponse,
  GetPublicClassRequest,
  GetPublicClassResponse,
  GetPublicMusicTogetherDemosRequest,
  GetPublicMusicTogetherDemosResponse,
  GetPublicMusicTogetherSectionRequest,
  GetPublicMusicTogetherSectionResponse,
  GetPublicMusicTogetherSectionsRequest,
  GetPublicMusicTogetherSectionsResponse,
  GetRegistrationStatusRequest,
  GetRegistrationStatusResponse,
  GetRequiredAgreementsForClassRequest,
  GetRequiredAgreementsForClassResponse,
  LookupDiscountRequest,
  LookupDiscountResponse,
} from '@maple/ts/firebase/api-types';
import { calculateRegistrationCost } from './calculate-registration-cost';
import { getPublicClass } from './get-public-class';
import { getPublicMusicTogetherDemos } from './get-public-music-together-demos';
import { getPublicMusicTogetherSection } from './get-public-music-together-section';
import { getPublicMusicTogetherSections } from './get-public-music-together-sections';
import { getRegistrationStatus } from './get-registration-status';
import { getRequiredAgreementsForClass } from './get-required-agreements-for-class';
import { lookupDiscount } from './lookup-discount';

/** One warm instance in prod; everywhere else scales to zero. */
export const PUBLIC_SITE_MIN_INSTANCES =
  process.env['GCLOUD_PROJECT'] === 'maple-and-spruce' ? 1 : 0;

export const publicSite = Functions.router(
  'publicSite',
  {
    // ── Classes (RegistrationWidget) ──────────────────────────────────────

    /** One published class, with instructor, category and spots remaining. */
    getPublicClass: Functions.endpoint.asRoute<
      GetPublicClassRequest,
      GetPublicClassResponse
    >(getPublicClass),

    /** The agreements a registrant must sign for a class. */
    getRequiredAgreementsForClass: Functions.endpoint.asRoute<
      GetRequiredAgreementsForClassRequest,
      GetRequiredAgreementsForClassResponse
    >(getRequiredAgreementsForClass),

    /** The price for a quantity, with any discount applied. */
    calculateRegistrationCost: Functions.endpoint
      .usingStrings(...SQUARE_STRING_NAMES)
      .asRoute<
        CalculateRegistrationCostRequest,
        CalculateRegistrationCostResponse
      >(calculateRegistrationCost),

    /** Whether a hosted checkout landed, on the return from Square. */
    getRegistrationStatus: Functions.endpoint.asRoute<
      GetRegistrationStatusRequest,
      GetRegistrationStatusResponse
    >(getRegistrationStatus),

    /**
     * A discount code, only if it is valid for the asking program. The one
     * route here that guesses can probe, so it carries App Check and a
     * per-IP throttle (ADR-037).
     */
    lookupDiscount: Functions.endpoint
      .withAppCheck('enforce')
      .throttling('lookupDiscount', codeLookupThrottles())
      .asRoute<LookupDiscountRequest, LookupDiscountResponse>(lookupDiscount),

    // ── Music Together widgets ────────────────────────────────────────────

    /** One visible section, for the registration widget. */
    getPublicMusicTogetherSection: Functions.endpoint.asRoute<
      GetPublicMusicTogetherSectionRequest,
      GetPublicMusicTogetherSectionResponse
    >(getPublicMusicTogetherSection),

    /** Every visible section, for the interest form's checkboxes. */
    getPublicMusicTogetherSections: Functions.endpoint.asRoute<
      GetPublicMusicTogetherSectionsRequest,
      GetPublicMusicTogetherSectionsResponse
    >(getPublicMusicTogetherSections),

    /** Upcoming visible demo classes, for the demo RSVP widget. */
    getPublicMusicTogetherDemos: Functions.endpoint.asRoute<
      GetPublicMusicTogetherDemosRequest,
      GetPublicMusicTogetherDemosResponse
    >(getPublicMusicTogetherDemos),
  },
  { minInstances: PUBLIC_SITE_MIN_INSTANCES, concurrency: 80 },
);
