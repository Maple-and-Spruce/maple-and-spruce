import { describe, it, expect } from 'vitest';
import {
  MT_SEASONS,
  MT_SEASON_DEFAULT_WEEKS,
  getMusicTogetherSeasonLabel,
  mtSemesterSortValue,
  mtSemesterIsEnrolling,
  mtSemesterDerivedStatus,
  type MusicTogetherSemester,
} from './music-together-semester';

function semester(
  overrides: Partial<MusicTogetherSemester> = {}
): MusicTogetherSemester {
  return {
    id: 's1',
    name: 'Fall 2026',
    season: 'fall',
    year: 2026,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('music-together-semester', () => {
  it('exposes seasons in academic-year order', () => {
    expect(MT_SEASONS).toEqual(['fall', 'winter', 'spring', 'summer']);
  });

  it('defaults Summer to 6 weeks and the rest to 10', () => {
    expect(MT_SEASON_DEFAULT_WEEKS.fall).toBe(10);
    expect(MT_SEASON_DEFAULT_WEEKS.summer).toBe(6);
  });

  it('labels seasons for display', () => {
    expect(getMusicTogetherSeasonLabel('fall')).toBe('Fall');
    expect(getMusicTogetherSeasonLabel('summer')).toBe('Summer');
  });

  describe('mtSemesterSortValue', () => {
    it('sorts by startDate when present', () => {
      const a = semester({ startDate: new Date('2026-09-10') });
      const b = semester({ startDate: new Date('2026-12-03') });
      expect(mtSemesterSortValue(a)).toBeLessThan(mtSemesterSortValue(b));
    });

    it('falls back to year + season order for planned terms', () => {
      const fall26 = semester({ season: 'fall', year: 2026 });
      const winter26 = semester({ season: 'winter', year: 2026 });
      const spring27 = semester({ season: 'spring', year: 2027 });
      expect(mtSemesterSortValue(fall26)).toBeLessThan(
        mtSemesterSortValue(winter26)
      );
      expect(mtSemesterSortValue(winter26)).toBeLessThan(
        mtSemesterSortValue(spring27)
      );
    });

    it('keeps season order from colliding across adjacent years', () => {
      const summer26 = semester({ season: 'summer', year: 2026 });
      const fall27 = semester({ season: 'fall', year: 2027 });
      expect(mtSemesterSortValue(summer26)).toBeLessThan(
        mtSemesterSortValue(fall27)
      );
    });
  });

  describe('mtSemesterDerivedStatus', () => {
    const now = new Date('2026-08-01T12:00:00Z');

    it('is planned before registration opens (or no dates set)', () => {
      expect(mtSemesterDerivedStatus(semester(), now)).toBe('planned');
      expect(
        mtSemesterDerivedStatus(
          semester({ enrollmentOpensAt: new Date('2026-08-15T00:00:00Z') }),
          now
        )
      ).toBe('planned');
    });

    it('is enrolling once registration opens, before the term starts', () => {
      expect(
        mtSemesterDerivedStatus(
          semester({
            enrollmentOpensAt: new Date('2026-07-01T00:00:00Z'),
            startDate: new Date('2026-09-10T00:00:00Z'),
            endDate: new Date('2026-11-14T00:00:00Z'),
          }),
          now
        )
      ).toBe('enrolling');
    });

    it('is active once the term has started', () => {
      expect(
        mtSemesterDerivedStatus(
          semester({
            enrollmentOpensAt: new Date('2026-07-01T00:00:00Z'),
            startDate: new Date('2026-07-20T00:00:00Z'),
            endDate: new Date('2026-11-14T00:00:00Z'),
          }),
          now
        )
      ).toBe('active');
    });

    it('is completed after the end date', () => {
      expect(
        mtSemesterDerivedStatus(
          semester({
            startDate: new Date('2026-01-10T00:00:00Z'),
            endDate: new Date('2026-03-14T00:00:00Z'),
          }),
          now
        )
      ).toBe('completed');
    });
  });

  it('reports enrolling status (derived from dates)', () => {
    expect(
      mtSemesterIsEnrolling(
        semester({
          enrollmentOpensAt: new Date('2026-07-01T00:00:00Z'),
          startDate: new Date('2026-09-10T00:00:00Z'),
        }),
        new Date('2026-08-01T12:00:00Z')
      )
    ).toBe(true);
    expect(
      mtSemesterIsEnrolling(semester(), new Date('2026-08-01T12:00:00Z'))
    ).toBe(false);
  });
});
