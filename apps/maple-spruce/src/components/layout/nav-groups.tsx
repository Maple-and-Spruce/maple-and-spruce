import HomeIcon from '@mui/icons-material/Home';
import InventoryIcon from '@mui/icons-material/Inventory';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import PeopleIcon from '@mui/icons-material/People';
import CategoryIcon from '@mui/icons-material/Category';
import SyncProblemIcon from '@mui/icons-material/SyncProblem';
import SchoolIcon from '@mui/icons-material/School';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import TodayIcon from '@mui/icons-material/Today';
import ChildCareIcon from '@mui/icons-material/ChildCare';
import PaymentsIcon from '@mui/icons-material/Payments';
import StarsIcon from '@mui/icons-material/Stars';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import EventIcon from '@mui/icons-material/Event';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import EventNoteIcon from '@mui/icons-material/EventNote';
import ViewWeekIcon from '@mui/icons-material/ViewWeek';
import ForwardToInboxIcon from '@mui/icons-material/ForwardToInbox';
import TuneIcon from '@mui/icons-material/Tune';
import LinkIcon from '@mui/icons-material/Link';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import SettingsIcon from '@mui/icons-material/Settings';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import GavelIcon from '@mui/icons-material/Gavel';
import CardMembershipIcon from '@mui/icons-material/CardMembership';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import PaletteIcon from '@mui/icons-material/Palette';
import StorefrontIcon from '@mui/icons-material/Storefront';
import { createIntentHref } from './create-intent';
import type { NavAction, NavGroup, NavItem } from '@maple/react/layout';
import type { UserRole } from '@maple/ts/domain';
import {
  allowedRolesForPath,
  filterItemsByRoles,
  filterNavGroupsByRoles,
} from './nav-filter';

/**
 * A nav item annotated with the roles that may see it. Omitted = admin
 * only. Admins always see everything, so 'admin' never needs listing.
 *
 * This is UX-side filtering ONLY — enforcement is each Cloud Function's
 * `requiringRole(...)` check (epic #49; re-scoping lands with legacy #615).
 * Keep this map in sync with the access matrix on the epic.
 */
type RoleNavItem = NavItem & { roles?: readonly UserRole[] };
type RoleNavGroup = Omit<NavGroup, 'items'> & { items: RoleNavItem[] };
type RoleNavAction = NavAction & { roles?: readonly UserRole[] };

/** Every non-admin role — for items any portal user should see. */
const ALL_ROLES = ['mt-teacher', 'clerk', 'lesson-teacher'] as const;

/**
 * The nav's top-level areas, Square Dashboard style: a short list of
 * areas, the current one open (AppShell's accordion). An area's first
 * visible item is where clicking the area lands.
 */
function roleNavGroups(
  pendingConflicts: number,
  pendingPosLessons: number,
): RoleNavGroup[] {
  return [
    {
      label: 'Home',
      icon: <HomeIcon />,
      items: [
        // Home stays visible to every role: it's the landing route, and a
        // nav with no '/' entry strands non-admin users on sign-in.
        { label: 'Home', href: '/', icon: <HomeIcon />, roles: ALL_ROLES },
      ],
    },
    {
      label: 'Classes',
      icon: <PaletteIcon />,
      items: [
        { label: 'Classes', href: '/classes', icon: <EventIcon /> },
        {
          label: 'Registrations',
          href: '/registrations',
          icon: <HowToRegIcon />,
          roles: ['clerk'],
        },
        {
          label: 'Instructors',
          href: '/instructors',
          icon: <SchoolIcon />,
        },
        {
          label: 'Class Categories',
          href: '/class-categories',
          icon: <CategoryIcon />,
        },
        {
          label: 'Discounts',
          href: '/discounts',
          icon: <LocalOfferIcon />,
        },
        {
          label: 'Agreements',
          href: '/agreements',
          icon: <GavelIcon />,
        },
        {
          label: 'Craft Club',
          href: '/craft-club',
          icon: <CardMembershipIcon />,
        },
      ],
    },
    {
      label: 'Lessons',
      icon: <MusicNoteIcon />,
      items: [
        {
          label: 'My Week',
          href: '/my-day',
          icon: <TodayIcon />,
          roles: ['lesson-teacher'],
        },
        {
          label: 'Students',
          href: '/students',
          icon: <MusicNoteIcon />,
          roles: ['lesson-teacher'],
        },
        {
          label: 'Inquiries',
          href: '/leads',
          icon: <ForwardToInboxIcon />,
        },
        {
          label: 'Teaching Days',
          href: '/teaching-days',
          icon: <ViewWeekIcon />,
          roles: ['lesson-teacher'],
        },
        {
          label: 'Lesson Blocks',
          href: '/lesson-blocks',
          icon: <EventNoteIcon />,
        },
        // Lesson Billing (/lesson-billing) is hidden while automatic charging
        // is paused (ADR-034, #162). The route and its code stay, admin-only
        // by URL; put this entry back (under Money) when billing rules are
        // switched on.
      ],
    },
    {
      label: 'Music Together',
      icon: <ChildCareIcon />,
      items: [
        {
          label: 'Sections',
          href: '/music-together',
          icon: <ChildCareIcon />,
          roles: ['mt-teacher'],
        },
        {
          label: 'Discounts',
          href: '/music-together/discounts',
          icon: <LocalOfferIcon />,
          roles: ['mt-teacher'],
        },
      ],
    },
    {
      label: 'Shop',
      icon: <StorefrontIcon />,
      items: [
        {
          label: 'Inventory',
          href: '/inventory',
          icon: <InventoryIcon />,
          roles: ['clerk'],
        },
        {
          label: 'Sales',
          href: '/sales',
          icon: <PointOfSaleIcon />,
          roles: ['clerk'],
        },
        {
          label: 'Categories',
          href: '/categories',
          icon: <CategoryIcon />,
          roles: ['clerk'],
        },
        { label: 'Artists', href: '/artists', icon: <PeopleIcon /> },
        {
          label: 'Sync',
          href: '/sync-conflicts',
          icon: <SyncProblemIcon />,
          badge: pendingConflicts,
          badgeColor: 'warning',
        },
      ],
    },
    {
      label: 'Calendar',
      icon: <CalendarMonthIcon />,
      items: [
        {
          label: 'Events',
          href: '/events',
          icon: <CalendarMonthIcon />,
          // Not lesson-teacher: their lessons are derived, and they don't
          // manage calendar events (they can still book a room, below).
          roles: ['mt-teacher', 'clerk'],
        },
        {
          label: 'Spruce Room Schedule',
          href: '/room-schedule',
          icon: <EventNoteIcon />,
          roles: ALL_ROLES,
        },
        {
          label: 'Book the Spruce Room',
          href: '/book-room',
          icon: <MeetingRoomIcon />,
          roles: ALL_ROLES,
        },
      ],
    },
    {
      // Money in and out: what families pay, and what teachers and artists
      // are owed.
      label: 'Money',
      icon: <PaymentsIcon />,
      items: [
        {
          label: 'Hope Billing',
          href: '/hope',
          icon: <StarsIcon />,
        },
        {
          label: 'POS Lessons',
          href: '/pos-lessons',
          icon: <ReceiptLongIcon />,
          badge: pendingPosLessons,
          badgeColor: 'warning',
        },
        {
          label: 'Teacher Payouts',
          href: '/payouts',
          icon: <PaymentsIcon />,
        },
        {
          label: 'Artist Payouts',
          href: '/payouts/artist-payouts',
          icon: <AccountBalanceWalletIcon />,
        },
      ],
    },
    {
      label: 'Settings',
      icon: <SettingsIcon />,
      items: [
        {
          label: 'Settings',
          href: '/settings',
          icon: <SettingsIcon />,
        },
        {
          label: 'Users',
          href: '/users',
          icon: <ManageAccountsIcon />,
        },
        {
          label: 'Embed Settings',
          href: '/calendar-embed',
          icon: <TuneIcon />,
        },
        {
          label: 'Calendar Links',
          href: '/calendar-links',
          icon: <LinkIcon />,
        },
      ],
    },
  ];
}

/**
 * The pinned Create menu. Each entry opens its page with the create form
 * already open (`?new=1`, see create-intent.ts). Roles mirror both the
 * page's nav roles (so the link isn't a dead end at PathRoleGuard) and
 * the create function's `requiringRole` (so the form can save).
 */
const CREATE_ACTIONS: RoleNavAction[] = [
  {
    label: 'New class',
    href: createIntentHref('/classes'),
    icon: <EventIcon fontSize="small" />,
  },
  {
    label: 'New event',
    href: createIntentHref('/events'),
    icon: <CalendarMonthIcon fontSize="small" />,
    roles: ['mt-teacher', 'clerk'],
  },
  {
    label: 'Add student',
    href: createIntentHref('/students'),
    icon: <MusicNoteIcon fontSize="small" />,
    roles: ['lesson-teacher'],
  },
  {
    label: 'Book the Spruce Room',
    href: '/book-room',
    icon: <MeetingRoomIcon fontSize="small" />,
    roles: ALL_ROLES,
  },
];

/** The Create menu entries a user's roles may use. */
export function buildCreateActions(roles: readonly UserRole[]): NavAction[] {
  return filterItemsByRoles(CREATE_ACTIONS, roles);
}

/** Every create action with its roles, for the spec's drift check. */
export function createActionRoles(): ReadonlyArray<{
  href: string;
  roles: readonly UserRole[];
}> {
  return CREATE_ACTIONS.map((a) => ({ href: a.href, roles: a.roles ?? [] }));
}

/**
 * Build the nav for a user's roles: admins see everything; other roles
 * see only the items listing one of their roles (see
 * `filterNavGroupsByRoles` in nav-filter.ts for the semantics and its
 * unit tests; the concrete role map here is asserted by the
 * AppShell.stories.tsx play tests).
 */
export function buildNavGroups(
  roles: readonly UserRole[],
  pendingConflicts: number,
  pendingPosLessons = 0,
): NavGroup[] {
  return filterNavGroupsByRoles(
    roleNavGroups(pendingConflicts, pendingPosLessons),
    roles,
  );
}

/**
 * Which roles may view a route — derived from the SAME role map as the
 * nav, so page guarding can't drift from nav visibility. Longest-prefix
 * match; unknown routes are admin-only. Used by PathRoleGuard in the
 * (admin) layout. UX only — server enforcement is per-function.
 */
export function pageRolesForPath(pathname: string): readonly UserRole[] {
  return allowedRolesForPath(roleNavGroups(0, 0), pathname);
}
