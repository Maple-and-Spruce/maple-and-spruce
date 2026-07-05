import { describe, it, expect } from 'vitest';
import {
  MT_SEASONS,
  MT_SEASON_DEFAULT_WEEKS,
  getMusicTogetherSeasonLabel,
  mtSemesterSortValue,
  mtSemesterIsEnrolling,
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
    status: 'planned',
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

  it('reports enrolling status', () => {
    expect(mtSemesterIsEnrolling(semester({ status: 'enrolling' }))).toBe(true);
    expect(mtSemesterIsEnrolling(semester({ status: 'planned' }))).toBe(false);
    expect(mtSemesterIsEnrolling(semester({ status: 'active' }))).toBe(false);
  });
});
