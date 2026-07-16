/**
 * Music Together semester domain types
 *
 * A semester (aka term) is the top-level organizing unit of the Music Together
 * program year — Fall, Winter, Spring, or a shorter Summer. Families enroll
 * into a `MusicTogetherSection` (a specific class time), and each section
 * belongs to a semester (`section.semesterId`). A semester carries the
 * term-level facts that live above any single section — the date span, holiday
 * and snow-day breaks, and the re-enrollment window — and can exist as
 * `planned` before any sections are created (so the public site can describe an
 * upcoming term whose exact schedule isn't set yet).
 */

/** The four terms of the program year, in academic-year order. */
export type MusicTogetherSeason = 'fall' | 'winter' | 'spring' | 'summer';

/** All seasons in academic-year order (drives sorting + labels). */
export const MT_SEASONS: MusicTogetherSeason[] = [
  'fall',
  'winter',
  'spring',
  'summer',
];

/** Default number of weeks per term by season (Summer is shorter). */
export const MT_SEASON_DEFAULT_WEEKS: Record<MusicTogetherSeason, number> = {
  fall: 10,
  winter: 10,
  spring: 10,
  summer: 6,
};

/**
 * Semester lifecycle — DERIVED from the term's dates, never stored. Admins set
 * the explicit date controls (`enrollmentOpensAt`, `startDate`, `endDate`) and
 * the overall status falls out of them via `mtSemesterDerivedStatus`.
 */
export type MusicTogetherSemesterStatus =
  | 'planned' // On the calendar, not yet open for registration
  | 'enrolling' // Registration window open, term not started
  | 'active' // Term in progress
  | 'completed'; // Term finished

/** A holiday / mid-term break within a semester. */
export interface MusicTogetherSemesterBreak {
  label: string;
  startDate: Date;
  endDate: Date;
}

/**
 * Music Together semester entity — one term of the program year.
 */
export interface MusicTogetherSemester {
  id: string;
  /** Display name, e.g. "Fall 2026". */
  name: string;
  season: MusicTogetherSeason;
  /** Calendar year the term begins in (Winter spans into year+1). */
  year: number;
  /** First and last class dates of the term. Optional while still `planned`. */
  startDate?: Date;
  endDate?: Date;
  /** Number of weekly meetings (10, or 6 for Summer). Optional prefill. */
  weeks?: number;
  /** Holiday / mid-term breaks. */
  breaks?: MusicTogetherSemesterBreak[];
  /** Built-in weather makeup dates (e.g. the two snow days held in Winter). */
  weatherMakeupDates?: Date[];
  /** When registration opens for this term. Drives the `enrolling` status. */
  enrollmentOpensAt?: Date;
  /** Free-text note, e.g. "exact dates confirmed by spring 2027" (Summer). */
  notes?: string;
  /** Webflow CMS item ID, once synced to the public site. */
  webflowItemId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Input for creating a semester. The server stamps id + timestamps. */
export type CreateMusicTogetherSemesterInput = Omit<
  MusicTogetherSemester,
  'id' | 'createdAt' | 'updatedAt'
>;

/** Input for updating a semester. */
export type UpdateMusicTogetherSemesterInput = Partial<
  Omit<MusicTogetherSemester, 'id' | 'createdAt' | 'updatedAt'>
> & {
  id: string;
};

/** Human-readable season label. */
export function getMusicTogetherSeasonLabel(season: MusicTogetherSeason): string {
  const labels: Record<MusicTogetherSeason, string> = {
    fall: 'Fall',
    winter: 'Winter',
    spring: 'Spring',
    summer: 'Summer',
  };
  return labels[season];
}

/**
 * Stable sort value for ordering semesters chronologically across the program
 * year (Fall < Winter < Spring < Summer within a year). Prefers `startDate`
 * when set, so terms with real schedules sort by their true start; otherwise
 * falls back to `year` + season order for still-`planned` terms.
 */
export function mtSemesterSortValue(
  semester: Pick<MusicTogetherSemester, 'season' | 'year' | 'startDate'>
): number {
  if (semester.startDate instanceof Date) {
    return semester.startDate.getTime();
  }
  const seasonIndex = MT_SEASONS.indexOf(semester.season);
  // Space years far apart so season order never collides across years.
  return semester.year * 12 + seasonIndex;
}

/**
 * The overall semester status — DERIVED, never stored. Computed from the term's
 * date controls + `now`:
 *
 * - `completed` — the end date has passed
 * - `active` — the start date has passed (term in progress)
 * - `enrolling` — registration has opened (`enrollmentOpensAt` reached) but the
 *   term hasn't started
 * - `planned` — none of the above (on the calendar, registration not open yet)
 *
 * Ordering matters: later phases win, so a term reads `active` once it starts
 * even if `enrollmentOpensAt` is also in the past.
 */
export function mtSemesterDerivedStatus(
  semester: Pick<
    MusicTogetherSemester,
    'startDate' | 'endDate' | 'enrollmentOpensAt'
  >,
  now: Date
): MusicTogetherSemesterStatus {
  if (semester.endDate && now >= semester.endDate) return 'completed';
  if (semester.startDate && now >= semester.startDate) return 'active';
  if (semester.enrollmentOpensAt && now >= semester.enrollmentOpensAt) {
    return 'enrolling';
  }
  return 'planned';
}

/** Whether a semester is in its registration window right now (derived). */
export function mtSemesterIsEnrolling(
  semester: Pick<
    MusicTogetherSemester,
    'startDate' | 'endDate' | 'enrollmentOpensAt'
  >,
  now: Date = new Date()
): boolean {
  return mtSemesterDerivedStatus(semester, now) === 'enrolling';
}
