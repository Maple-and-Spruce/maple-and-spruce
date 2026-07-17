import { describe, it, expect } from 'vitest';
import { allowedRolesForPath, filterNavGroupsByRoles } from './nav-filter';

// Icon-free fixture mirroring the real nav's role semantics: an
// admin-only item, a clerk item, an all-roles item, and a group that
// disappears entirely for non-admins. The concrete production nav map
// is asserted by the AppShell.stories.tsx play tests.
const GROUPS = [
  {
    label: 'Store',
    items: [
      { label: 'Home', roles: ['mt-teacher', 'clerk', 'lesson-teacher'] },
      { label: 'Inventory', roles: ['clerk'] },
      { label: 'Artists' }, // admin only
    ],
  },
  {
    label: 'Music Together',
    items: [{ label: 'Sections', roles: ['mt-teacher'] }],
  },
  {
    label: 'Admin',
    items: [{ label: 'Users' }, { label: 'Settings' }],
  },
] as const;

function labels(groups: ReturnType<typeof filterNavGroupsByRoles>) {
  return Object.fromEntries(
    groups.map((g) => [g.label, g.items.map((i) => i.label)])
  );
}

describe('filterNavGroupsByRoles', () => {
  it('admin sees every item, including un-annotated (admin-only) ones', () => {
    expect(labels(filterNavGroupsByRoles(GROUPS, ['admin']))).toEqual({
      Store: ['Home', 'Inventory', 'Artists'],
      'Music Together': ['Sections'],
      Admin: ['Users', 'Settings'],
    });
  });

  it('a scoped role sees only items listing it; empty groups drop', () => {
    expect(labels(filterNavGroupsByRoles(GROUPS, ['mt-teacher']))).toEqual({
      Store: ['Home'],
      'Music Together': ['Sections'],
    });
  });

  it('multi-role users see the union of their roles', () => {
    expect(
      labels(filterNavGroupsByRoles(GROUPS, ['mt-teacher', 'clerk']))
    ).toEqual({
      Store: ['Home', 'Inventory'],
      'Music Together': ['Sections'],
    });
  });

  it('unresolved roles (empty) hide everything', () => {
    expect(filterNavGroupsByRoles(GROUPS, [])).toEqual([]);
  });

  it('strips the internal roles annotation from returned items', () => {
    for (const group of filterNavGroupsByRoles(GROUPS, ['admin'])) {
      for (const item of group.items) {
        expect('roles' in item).toBe(false);
      }
    }
  });

  it('preserves extra item fields (badge etc.) through filtering', () => {
    const groups = [
      {
        label: 'Store',
        items: [{ label: 'Sync', badge: 7, badgeColor: 'warning' }],
      },
    ];
    const [store] = filterNavGroupsByRoles(groups, ['admin']);
    expect(store.items[0]).toEqual({
      label: 'Sync',
      badge: 7,
      badgeColor: 'warning',
    });
  });
});

describe('allowedRolesForPath', () => {
  const GROUPS_WITH_HREFS = [
    {
      label: 'Store',
      items: [
        {
          label: 'Home',
          href: '/',
          roles: ['mt-teacher', 'clerk', 'lesson-teacher'] as const,
        },
        { label: 'Inventory', href: '/inventory', roles: ['clerk'] as const },
        { label: 'Artists', href: '/artists' }, // admin only
        {
          label: 'Artist Payouts',
          href: '/payouts/artist-payouts',
        }, // admin only, nested under /payouts
      ],
    },
    {
      label: 'Music Lessons',
      items: [
        {
          label: 'Teacher Payouts',
          href: '/payouts',
          roles: ['lesson-teacher'] as const,
        },
      ],
    },
  ];

  it('resolves an exact match to its roles', () => {
    expect(allowedRolesForPath(GROUPS_WITH_HREFS, '/inventory')).toEqual([
      'clerk',
    ]);
  });

  it('detail routes inherit their section via prefix match', () => {
    expect(
      allowedRolesForPath(GROUPS_WITH_HREFS, '/inventory/product-123')
    ).toEqual(['clerk']);
  });

  it('longest prefix wins (/payouts/artist-payouts over /payouts)', () => {
    expect(
      allowedRolesForPath(GROUPS_WITH_HREFS, '/payouts/artist-payouts')
    ).toEqual([]); // admin only
    expect(allowedRolesForPath(GROUPS_WITH_HREFS, '/payouts')).toEqual([
      'lesson-teacher',
    ]);
  });

  it('"/" matches only exactly — it never swallows other routes', () => {
    expect(allowedRolesForPath(GROUPS_WITH_HREFS, '/')).toEqual([
      'mt-teacher',
      'clerk',
      'lesson-teacher',
    ]);
    expect(allowedRolesForPath(GROUPS_WITH_HREFS, '/settings')).toEqual([]);
  });

  it('unknown routes are admin-only (empty roles)', () => {
    expect(allowedRolesForPath(GROUPS_WITH_HREFS, '/brand-new-page')).toEqual(
      []
    );
  });

  it('un-annotated items resolve to admin-only', () => {
    expect(allowedRolesForPath(GROUPS_WITH_HREFS, '/artists')).toEqual([]);
  });

  it('does not treat sibling prefixes as matches (/inventory-x vs /inventory)', () => {
    expect(allowedRolesForPath(GROUPS_WITH_HREFS, '/inventory-archive')).toEqual(
      []
    );
  });
});
