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

/** Semester lifecycle. `planned` terms may have no sections yet. */
export type MusicTogetherSemesterStatus =
  | 'planned' // On the calendar, not yet open for registration
  | 'enrolling' // Sections open for registration
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
  /** Built-in snow makeup dates (Winter). */
  snowMakeupDates?: Date[];
  /** When re-registration opens for this term. */
  enrollmentOpensAt?: Date;
  status: MusicTogetherSemesterStatus;
  /** Free-text note, e.g. "exact dates confirmed by spring 2027" (Summer). */
  notes?: string;
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

/** Whether a semester is accepting registrations right now. */
export function mtSemesterIsEnrolling(
  semester: Pick<MusicTogetherSemester, 'status'>
): boolean {
  return semester.status === 'enrolling';
}
