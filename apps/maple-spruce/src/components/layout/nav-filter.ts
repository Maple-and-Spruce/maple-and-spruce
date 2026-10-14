import type { UserRole } from '@maple/ts/domain';

/**
 * Role-based nav filtering, kept free of JSX so it's unit-testable
 * (app .tsx components are exercised via Storybook play tests instead).
 *
 * An item's `roles` lists the non-admin roles that may see it; omitted =
 * admin only. Admins always see everything. Groups left with no visible
 * items are dropped. While roles are unresolved (empty array), nothing
 * is visible — the nav skeleton renders and fills in when roles land.
 */
export interface RoleAnnotated {
  roles?: readonly UserRole[];
}

/**
 * Resolve which roles may view a route, from the same annotations that
 * drive nav filtering. Longest-prefix match so detail routes inherit
 * their section's roles (`/classes/abc` -> `/classes`); `/` only matches
 * exactly (it would otherwise swallow every route). Unknown routes
 * return [] = admin-only (safe default for new pages).
 */
export function allowedRolesForPath<
  Item extends RoleAnnotated & { href: string },
>(
  groups: ReadonlyArray<{ label: string; items: readonly Item[] }>,
  pathname: string
): readonly UserRole[] {
  let best: { href: string; roles: readonly UserRole[] } | undefined;
  for (const group of groups) {
    for (const item of group.items) {
      const matches =
        item.href === '/'
          ? pathname === '/'
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (matches && (!best || item.href.length > best.href.length)) {
        best = { href: item.href, roles: item.roles ?? [] };
      }
    }
  }
  return best?.roles ?? [];
}

/**
 * The items a user's roles may see, with the `roles` annotation stripped.
 * Admins see everything; unresolved roles (empty) see nothing.
 */
export function filterItemsByRoles<Item extends RoleAnnotated>(
  items: readonly Item[],
  roles: readonly UserRole[]
): Array<Omit<Item, 'roles'>> {
  const isAdmin = roles.includes('admin');
  return items
    .filter(
      (item) => isAdmin || item.roles?.some((role) => roles.includes(role))
    )
    .map(({ roles: _roles, ...item }) => item);
}

/**
 * Filter each group's items by role, dropping groups left empty. Every
 * other group field (an area's icon, say) passes through unchanged.
 */
export function filterNavGroupsByRoles<
  Group extends { label: string; items: readonly RoleAnnotated[] },
>(
  groups: readonly Group[],
  roles: readonly UserRole[]
): Array<
  Omit<Group, 'items'> & {
    items: Array<Omit<Group['items'][number], 'roles'>>;
  }
> {
  return groups
    .map((group) => ({
      ...group,
      items: filterItemsByRoles(group.items, roles),
    }))
    .filter((group) => group.items.length > 0);
}
