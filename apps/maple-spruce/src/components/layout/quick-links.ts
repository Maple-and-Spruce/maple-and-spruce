import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import BusinessIcon from '@mui/icons-material/Business';
import CampaignIcon from '@mui/icons-material/Campaign';
import FolderSharedIcon from '@mui/icons-material/FolderShared';
import LanguageIcon from '@mui/icons-material/Language';
import ListAltIcon from '@mui/icons-material/ListAlt';
import PhoneIcon from '@mui/icons-material/Phone';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import SchoolIcon from '@mui/icons-material/School';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import type { ExternalLink } from '@maple/react/layout';
import type { UserRole } from '@maple/ts/domain';
import { filterItemsByRoles } from './nav-filter';

type RoleExternalLink = ExternalLink & { roles?: readonly UserRole[] };

/**
 * The studio's external business accounts, pinned at the top of the
 * sidebar. Formerly the Home page's Quick Links grid.
 *
 * Order is display order. The first three carry `pinned: true` and show
 * as tiles; the rest open from the sliver. Pinning is static for now —
 * making it per-user later only has to change which entries are pinned.
 *
 * No `roles` = admin only, as on the old Home grid (same semantics as
 * the nav map in nav-groups.tsx).
 *
 * Colours are each brand's, darkened where the bright original would
 * wash out a white glyph.
 */
const QUICK_LINKS: RoleExternalLink[] = [
  { label: 'Square', href: 'https://squareup.com/dashboard', icon: ShoppingCartIcon, color: '#006aff', pinned: true },
  { label: 'Wave', href: 'https://my.waveapps.com', icon: AccountBalanceIcon, color: '#1c6dd0', pinned: true },
  { label: 'Tally', href: 'https://tally.so', icon: ListAltIcon, color: '#6c5ce7', pinned: true },
  { label: 'MailerLite', href: 'https://app.mailerlite.com', icon: CampaignIcon, color: '#08a656' },
  { label: 'Google Drive', href: 'https://drive.google.com', icon: FolderSharedIcon, color: '#a87a00' },
  { label: 'Facebook Ads', href: 'https://adsmanager.facebook.com/adsmanager/manage/campaigns', icon: CampaignIcon, color: '#1877f2' },
  { label: 'Webflow', href: 'https://webflow.com/dashboard', icon: LanguageIcon, color: '#4353ff' },
  { label: 'Firebase', href: 'https://console.firebase.google.com', icon: AdminPanelSettingsIcon, color: '#d86c06' },
  { label: 'Vercel', href: 'https://vercel.com/dashboard', icon: RocketLaunchIcon, color: '#000000' },
  { label: 'Google Voice', href: 'https://voice.google.com', icon: PhoneIcon, color: '#2b8a46' },
  { label: 'Hope Scholarship', href: 'https://app.hopescholarshipwv.com/esa/esa_vendor_admin/landing', icon: SchoolIcon, color: '#b71c1c' },
  { label: 'WV MyTaxes', href: 'https://mytaxes.wvtax.gov', icon: ReceiptLongIcon, color: '#0b6e4f' },
  { label: 'Apple Business', href: 'https://business.apple.com/main/home', icon: BusinessIcon, color: '#555555' },
];

/** The external links a user's roles may see (today: admins, all of them). */
export function buildQuickLinks(roles: readonly UserRole[]): ExternalLink[] {
  return filterItemsByRoles(QUICK_LINKS, roles);
}
