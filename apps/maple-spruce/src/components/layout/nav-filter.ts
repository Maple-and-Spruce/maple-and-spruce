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

export function filterNavGroupsByRoles<Item extends RoleAnnotated>(
  groups: ReadonlyArray<{ label: string; items: Item[] }>,
  roles: readonly UserRole[]
): Array<{ label: string; items: Array<Omit<Item, 'roles'>> }> {
  const isAdmin = roles.includes('admin');

  return groups
    .map((group) => ({
      label: group.label,
      items: group.items
        .filter(
          (item) =>
            isAdmin || item.roles?.some((role) => roles.includes(role))
        )
        .map(({ roles: _roles, ...item }) => item),
    }))
    .filter((group) => group.items.length > 0);
}
