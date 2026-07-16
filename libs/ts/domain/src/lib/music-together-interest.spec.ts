import { describe, it, expect } from 'vitest';
import { mtInterestDemandBySection } from './music-together-interest';

describe('mtInterestDemandBySection', () => {
  it('tallies interest per section, highest first', () => {
    const demand = mtInterestDemandBySection([
      { interestedSectionIds: ['sec-1', 'sec-2'] },
      { interestedSectionIds: ['sec-1'] },
      { interestedSectionIds: ['sec-1', 'sec-3'] },
    ]);
    expect(demand).toEqual([
      { sectionId: 'sec-1', count: 3 },
      { sectionId: 'sec-2', count: 1 },
      { sectionId: 'sec-3', count: 1 },
    ]);
  });

  it('breaks ties by section id for stable ordering', () => {
    const demand = mtInterestDemandBySection([
      { interestedSectionIds: ['b', 'a'] },
    ]);
    expect(demand).toEqual([
      { sectionId: 'a', count: 1 },
      { sectionId: 'b', count: 1 },
    ]);
  });

  it('ignores entries with no checked sections', () => {
    expect(
      mtInterestDemandBySection([
        { interestedSectionIds: [] },
        { interestedSectionIds: ['x'] },
      ])
    ).toEqual([{ sectionId: 'x', count: 1 }]);
  });

  it('is empty when nobody checked a section', () => {
    expect(mtInterestDemandBySection([])).toEqual([]);
  });
});
