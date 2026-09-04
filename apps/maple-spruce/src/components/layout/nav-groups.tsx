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
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import EventIcon from '@mui/icons-material/Event';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import EventNoteIcon from '@mui/icons-material/EventNote';
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
import type { NavGroup, NavItem } from '@maple/react/layout';
import type { UserRole } from '@maple/ts/domain';
import { allowedRolesForPath, filterNavGroupsByRoles } from './nav-filter';

/**
 * A nav item annotated with the roles that may see it. Omitted = admin
 * only. Admins always see everything, so 'admin' never needs listing.
 *
 * This is UX-side filtering ONLY — enforcement is each Cloud Function's
 * `requiringRole(...)` check (epic #617; re-scoping lands with #615).
 * Keep this map in sync with the access matrix on the epic.
 */
type RoleNavItem = NavItem & { roles?: readonly UserRole[] };
type RoleNavGroup = { label: string; items: RoleNavItem[] };

/** Every non-admin role — for items any portal user should see. */
const ALL_ROLES = ['mt-teacher', 'clerk', 'lesson-teacher'] as const;

function roleNavGroups(
  pendingConflicts: number,
  pendingPosLessons: number,
): RoleNavGroup[] {
  return [
    {
      label: 'Store',
      items: [
        // Home stays visible to every role: it's the landing route, and a
        // nav with no '/' entry strands non-admin users on sign-in.
        { label: 'Home', href: '/', icon: <HomeIcon />, roles: ALL_ROLES },
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
          label: 'Artist Payouts',
          href: '/payouts/artist-payouts',
          icon: <AccountBalanceWalletIcon />,
        },
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
      label: 'Classes',
      items: [
        { label: 'Classes', href: '/classes', icon: <EventIcon /> },
        {
          label: 'Class Categories',
          href: '/class-categories',
          icon: <CategoryIcon />,
        },
        {
          label: 'Instructors',
          href: '/instructors',
          icon: <SchoolIcon />,
        },
        {
          label: 'Discounts',
          href: '/discounts',
          icon: <LocalOfferIcon />,
        },
        {
          label: 'Registrations',
          href: '/registrations',
          icon: <HowToRegIcon />,
          roles: ['clerk'],
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
      label: 'Music Lessons',
      items: [
        {
          label: 'My Day',
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
          label: 'Lesson Blocks',
          href: '/lesson-blocks',
          icon: <EventNoteIcon />,
        },
        {
          label: 'Teacher Payouts',
          href: '/payouts',
          icon: <PaymentsIcon />,
        },
        {
          label: 'POS Lessons',
          href: '/pos-lessons',
          icon: <ReceiptLongIcon />,
          badge: pendingPosLessons,
          badgeColor: 'warning',
        },
      ],
    },
    {
      label: 'Music Together',
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
      label: 'Calendar',
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
    {
      label: 'Admin',
      items: [
        {
          label: 'Users',
          href: '/users',
          icon: <ManageAccountsIcon />,
        },
        {
          label: 'Settings',
          href: '/settings',
          icon: <SettingsIcon />,
        },
      ],
    },
  ];
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
