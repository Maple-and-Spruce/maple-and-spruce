import { describe, expect, it } from 'vitest';
import { navModeFor } from '@maple/react/layout';
import type { UserRole } from '@maple/ts/domain';
import {
  buildCreateActions,
  buildNavGroups,
  createActionRoles,
  pageRolesForPath,
} from './nav-groups';

const ALL = ['mt-teacher', 'clerk', 'lesson-teacher'];
const LT = ['lesson-teacher'];
const MT = ['mt-teacher'];
const CLERK = ['clerk'];

/**
 * Every page the nav linked to before the areas rework, with the roles
 * that could see it. Regrouping must not drop a page or change who can
 * open it — PathRoleGuard reads these same roles.
 */
const PAGE_ROLES: Record<string, string[]> = {
  '/': ALL,
  '/inventory': CLERK,
  '/sales': CLERK,
  '/categories': CLERK,
  '/artists': [],
  '/payouts/artist-payouts': [],
  '/sync-conflicts': [],
  '/classes': [],
  '/class-categories': [],
  '/instructors': [],
  '/discounts': [],
  '/registrations': CLERK,
  '/agreements': [],
  '/craft-club': [],
  '/my-day': LT,
  '/students': LT,
  '/leads': [],
  '/teaching-days': LT,
  '/lesson-blocks': [],
  '/hope': [],
  '/payouts': [],
  '/pos-lessons': [],
  '/music-together': MT,
  '/music-together/discounts': MT,
  '/events': ['mt-teacher', 'clerk'],
  '/room-schedule': ALL,
  '/book-room': ALL,
  '/calendar-embed': [],
  '/calendar-links': [],
  '/users': [],
  '/settings': [],
};

const labels = (roles: UserRole[]) =>
  Object.fromEntries(
    buildNavGroups(roles, 0).map((g) => [g.label, g.items.map((i) => i.label)]),
  );

describe('nav areas', () => {
  it('admin sees the eight areas in order', () => {
    expect(buildNavGroups(['admin'], 0).map((g) => g.label)).toEqual([
      'Home',
      'Classes',
      'Lessons',
      'Music Together',
      'Shop',
      'Calendar',
      'Money',
      'Settings',
    ]);
  });

  it('every area has an icon for its row', () => {
    for (const group of buildNavGroups(['admin'], 0)) {
      expect(group.icon).toBeTruthy();
    }
  });

  it('keeps every page reachable for an admin', () => {
    const hrefs = buildNavGroups(['admin'], 0).flatMap((g) =>
      g.items.map((i) => i.href),
    );
    expect([...hrefs].sort()).toEqual(Object.keys(PAGE_ROLES).sort());
  });

  it.each(Object.entries(PAGE_ROLES))(
    'keeps who can open %s',
    (href, roles) => {
      expect([...pageRolesForPath(href)]).toEqual(roles);
    },
  );

  it('puts Hope Billing and POS Lessons under Money', () => {
    expect(labels(['admin']).Money).toEqual([
      'Hope Billing',
      'POS Lessons',
      'Teacher Payouts',
      'Artist Payouts',
    ]);
  });

  it('shows each scoped role only its pages', () => {
    expect(labels(['mt-teacher'])).toEqual({
      Home: ['Home'],
      'Music Together': ['Sections', 'Discounts'],
      Calendar: ['Events', 'Spruce Room Schedule', 'Book the Spruce Room'],
    });
    expect(labels(['lesson-teacher'])).toEqual({
      Home: ['Home'],
      Lessons: ['My Week', 'Students', 'Teaching Days'],
      Calendar: ['Spruce Room Schedule', 'Book the Spruce Room'],
    });
    expect(labels(['clerk'])).toEqual({
      Home: ['Home'],
      Classes: ['Registrations'],
      Shop: ['Inventory', 'Sales', 'Categories'],
      Calendar: ['Events', 'Spruce Room Schedule', 'Book the Spruce Room'],
    });
  });

  it('gives single roles the flat list and admins the accordion', () => {
    expect(navModeFor(buildNavGroups(['mt-teacher'], 0))).toBe('flat');
    expect(navModeFor(buildNavGroups(['lesson-teacher'], 0))).toBe('flat');
    expect(navModeFor(buildNavGroups(['clerk'], 0))).toBe('flat');
    expect(navModeFor(buildNavGroups(['admin'], 0))).toBe('accordion');
  });

  it('carries the pending counts onto Sync and POS Lessons', () => {
    const items = buildNavGroups(['admin'], 4, 2).flatMap((g) => g.items);
    expect(items.find((i) => i.href === '/sync-conflicts')?.badge).toBe(4);
    expect(items.find((i) => i.href === '/pos-lessons')?.badge).toBe(2);
  });
});

describe('create actions', () => {
  const actionLabels = (roles: UserRole[]) =>
    buildCreateActions(roles).map((a) => a.label);

  it('admin gets every action, each opening its create form', () => {
    expect(
      buildCreateActions(['admin']).map(({ label, href }) => ({ label, href })),
    ).toEqual([
      { label: 'New class', href: '/classes?new=1' },
      { label: 'New event', href: '/events?new=1' },
      { label: 'Add student', href: '/students?new=1' },
      { label: 'Book the Spruce Room', href: '/book-room' },
    ]);
  });

  it('scoped roles get only what they can do', () => {
    expect(actionLabels(['mt-teacher'])).toEqual([
      'New event',
      'Book the Spruce Room',
    ]);
    expect(actionLabels(['clerk'])).toEqual([
      'New event',
      'Book the Spruce Room',
    ]);
    expect(actionLabels(['lesson-teacher'])).toEqual([
      'Add student',
      'Book the Spruce Room',
    ]);
    expect(actionLabels([])).toEqual([]);
  });

  it('never offers an action whose page the role cannot open', () => {
    for (const { href, roles } of createActionRoles()) {
      const page = pageRolesForPath(href.split('?')[0]);
      for (const role of roles) {
        expect(page).toContain(role);
      }
    }
  });
});
