/**
 * Calendar Embed Configuration
 *
 * Singleton config document controlling which ICS feeds appear in the
 * public calendar embed and how it's displayed. Stored at config/calendarEmbed
 * in Firestore. The calendarEmbed HTTP function reads this at request time
 * and redirects to Open Web Calendar with the appropriate parameters.
 */

/**
 * A single calendar source (ICS feed) in the embed.
 */
export interface CalendarEmbedSource {
  /** Unique identifier */
  id: string;
  /** Human-readable label (e.g., "Classes & Workshops") */
  label: string;
  /** ICS feed URL — path (e.g. "/calendar/classes.ics") or full URL */
  url: string;
  /** Hex color without # for admin UI display */
  color: string;
  /** System sources cannot be removed */
  isSystem: boolean;
  /** Whether this source is included in the embed */
  enabled: boolean;
}

/**
 * Full embed configuration
 */
export interface CalendarEmbedConfig {
  /** Open Web Calendar base URL */
  owcBaseUrl: string;
  /** Default view: "month" | "week" | "day" | "agenda" */
  defaultTab: string;
  /** Available view tabs */
  tabs: string[];
  /** OWC skin name */
  skin: string;
  /** Start of week: "mo" | "su" */
  startOfWeek: string;
  /** IANA timezone */
  timezone: string;
  /** Calendar title */
  title: string;
  /** Optional custom CSS URL for OWC styling */
  cssUrl: string;
  /** All calendar sources */
  sources: CalendarEmbedSource[];
  updatedAt: Date;
}

/**
 * Input for updating embed config (settings and/or sources)
 */
export type UpdateCalendarEmbedSettingsInput = Partial<
  Omit<CalendarEmbedConfig, 'updatedAt'>
>;

/**
 * Input for adding a custom calendar source
 */
export type CreateCalendarEmbedSourceInput = Omit<
  CalendarEmbedSource,
  'id' | 'isSystem'
>;

/**
 * Input for updating a source (id required, isSystem not changeable)
 */
export type UpdateCalendarEmbedSourceInput = Partial<
  Omit<CalendarEmbedSource, 'id' | 'isSystem'>
> & {
  id: string;
};
