import { describe, expect, it } from 'vitest';
import {
  FLAT_NAV_MAX_ITEMS,
  findActiveHref,
  groupBadge,
  groupOfHref,
  navItemCount,
  navModeFor,
  searchNav,
  type NavGroup,
} from './nav-model';

const groups: NavGroup[] = [
  { label: 'Home', items: [{ label: 'Home', href: '/' }] },
  {
    label: 'Lessons',
    items: [
      { label: 'Students', href: '/students' },
      { label: 'Inquiries', href: '/leads' },
    ],
  },
  {
    label: 'Money',
    items: [
      { label: 'POS Lessons', href: '/pos-lessons', badge: 2, badgeColor: 'warning' },
      { label: 'Teacher Payouts', href: '/payouts' },
      { label: 'Artist Payouts', href: '/payouts/artist-payouts' },
    ],
  },
  {
    label: 'Shop',
    items: [
      { label: 'Sync', href: '/sync-conflicts', badge: 3 },
      { label: 'Artists', href: '/artists', badge: 0 },
    ],
  },
];

describe('findActiveHref', () => {
  it('matches an exact route', () => {
    expect(findActiveHref(groups, '/leads')).toBe('/leads');
  });

  it('matches a detail route to its section', () => {
    expect(findActiveHref(groups, '/students/stu-123')).toBe('/students');
  });

  it('prefers the longest prefix, so a nested page beats its parent', () => {
    expect(findActiveHref(groups, '/payouts/artist-payouts')).toBe(
      '/payouts/artist-payouts',
    );
    expect(findActiveHref(groups, '/payouts')).toBe('/payouts');
    expect(findActiveHref(groups, '/payouts/instructor-statements/x')).toBe(
      '/payouts',
    );
  });

  it('matches / only exactly', () => {
    expect(findActiveHref(groups, '/')).toBe('/');
    expect(findActiveHref(groups, '/unknown')).toBeUndefined();
  });

  it('does not match a sibling that only shares a string prefix', () => {
    expect(findActiveHref(groups, '/students-archive')).toBeUndefined();
  });
});

describe('groupOfHref', () => {
  it('names the area that owns a page', () => {
    expect(groupOfHref(groups, '/payouts')).toBe('Money');
  });

  it('is undefined for no page or an unknown one', () => {
    expect(groupOfHref(groups, undefined)).toBeUndefined();
    expect(groupOfHref(groups, '/nowhere')).toBeUndefined();
  });
});

describe('navModeFor', () => {
  it('counts every item', () => {
    expect(navItemCount(groups)).toBe(8);
  });

  it('is flat at or under the threshold', () => {
    expect(navModeFor(groups)).toBe('flat');
    expect(navModeFor(groups, 8)).toBe('flat');
  });

  it('is accordion over the threshold', () => {
    expect(navModeFor(groups, 7)).toBe('accordion');
  });

  it('defaults to the documented threshold', () => {
    expect(FLAT_NAV_MAX_ITEMS).toBe(10);
  });
});

describe('groupBadge', () => {
  it('sums the items and takes the first badged colour', () => {
    expect(groupBadge(groups[2])).toEqual({ count: 2, color: 'warning' });
  });

  it('defaults the colour to error and ignores zero badges', () => {
    expect(groupBadge(groups[3])).toEqual({ count: 3, color: 'error' });
  });

  it('is undefined when nothing is waiting', () => {
    expect(groupBadge(groups[1])).toBeUndefined();
  });
});

describe('searchNav', () => {
  const labels = (q: string): string[] =>
    searchNav(groups, q).map((r) => r.item.label);

  it('returns nothing for a blank query', () => {
    expect(searchNav(groups, '   ')).toEqual([]);
  });

  it('matches labels case-insensitively and reports the area', () => {
    expect(searchNav(groups, 'INQ')).toEqual([
      { item: groups[1].items[1], group: 'Lessons' },
    ]);
  });

  it('ranks label prefixes, then label substrings, then area matches', () => {
    // "payouts" starts no label, is inside two, and is no area name.
    expect(labels('payouts')).toEqual(['Teacher Payouts', 'Artist Payouts']);
    // "lessons" is inside POS Lessons and is the Lessons area.
    expect(labels('lessons')).toEqual(['POS Lessons', 'Students', 'Inquiries']);
    expect(labels('s')).toEqual([
      'Students',
      'Sync',
      'Inquiries',
      'POS Lessons',
      'Teacher Payouts',
      'Artist Payouts',
      'Artists',
    ]);
  });
});
