import type { ReactNode } from 'react';

export type NavBadgeColor =
  | 'primary'
  | 'secondary'
  | 'error'
  | 'warning'
  | 'info'
  | 'success';

export interface NavItem {
  label: string;
  href: string;
  icon?: ReactNode;
  /** Optional badge count to display on the nav item */
  badge?: number;
  /** Badge color (defaults to 'error' for visibility) */
  badgeColor?: NavBadgeColor;
}

/**
 * A top-level area of the nav (Classes, Lessons, Money...). In the
 * accordion layout the area is one row, and its items show only while
 * the user is inside it.
 */
export interface NavGroup {
  label: string;
  /** Icon for the area's top-level row. */
  icon?: ReactNode;
  items: NavItem[];
}

/** A quick-create entry in the pinned Create menu. */
export interface NavAction {
  label: string;
  href: string;
  icon?: ReactNode;
}

export type NavMode = 'flat' | 'accordion';

/**
 * Users who can see only a handful of pages get the plain grouped list:
 * opening an area to reach one of two links is a click for nothing.
 */
export const FLAT_NAV_MAX_ITEMS = 10;

function matchesPath(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The nav item a route belongs to: longest-prefix match, so a detail
 * route lights up its section (`/students/abc` -> Students) and a nested
 * page beats its parent (`/payouts/artist-payouts` is not Teacher
 * Payouts). `/` only matches itself.
 */
export function findActiveHref(
  groups: readonly NavGroup[],
  pathname: string,
): string | undefined {
  let best: string | undefined;
  for (const group of groups) {
    for (const item of group.items) {
      if (
        matchesPath(item.href, pathname) &&
        (!best || item.href.length > best.length)
      ) {
        best = item.href;
      }
    }
  }
  return best;
}

/** The label of the area that owns `href`, if any. */
export function groupOfHref(
  groups: readonly NavGroup[],
  href: string | undefined,
): string | undefined {
  if (!href) return undefined;
  return groups.find((g) => g.items.some((i) => i.href === href))?.label;
}

export function navItemCount(groups: readonly NavGroup[]): number {
  return groups.reduce((n, g) => n + g.items.length, 0);
}

export function navModeFor(
  groups: readonly NavGroup[],
  flatMaxItems = FLAT_NAV_MAX_ITEMS,
): NavMode {
  return navItemCount(groups) <= flatMaxItems ? 'flat' : 'accordion';
}

/**
 * An area's collapsed row carries the sum of its items' badges, so work
 * waiting inside a closed area is still visible. Colour follows the
 * first badged item.
 */
export function groupBadge(
  group: NavGroup,
): { count: number; color: NavBadgeColor } | undefined {
  const badged = group.items.filter((i) => (i.badge ?? 0) > 0);
  if (badged.length === 0) return undefined;
  return {
    count: badged.reduce((n, i) => n + (i.badge ?? 0), 0),
    color: badged[0].badgeColor ?? 'error',
  };
}

export interface NavSearchResult {
  item: NavItem;
  group: string;
}

/**
 * Pages whose label or area matches the query (case-insensitive).
 * Label matches rank ahead of area-only matches, and labels that start
 * with the query ahead of ones that merely contain it.
 */
/** 0 = label starts with q, 1 = label contains q, 2 = area contains q. */
function matchScore(label: string, area: string, q: string): number {
  if (label.startsWith(q)) return 0;
  if (label.includes(q)) return 1;
  if (area.includes(q)) return 2;
  return -1;
}

export function searchNav(
  groups: readonly NavGroup[],
  query: string,
): NavSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = groups
    .flatMap((group) => group.items.map((item) => ({ item, group: group.label })))
    .map((result, order) => ({
      ...result,
      order,
      score: matchScore(
        result.item.label.toLowerCase(),
        result.group.toLowerCase(),
        q,
      ),
    }))
    .filter((r) => r.score >= 0);
  return scored
    .sort((a, b) => a.score - b.score || a.order - b.order)
    .map(({ item, group }) => ({ item, group }));
}
