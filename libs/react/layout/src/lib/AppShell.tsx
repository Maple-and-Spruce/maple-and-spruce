'use client';

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  AppBar,
  Badge,
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { UserMenu } from '@maple/react/auth';
import {
  FLAT_NAV_MAX_ITEMS,
  findActiveHref,
  groupBadge,
  groupOfHref,
  navModeFor,
  searchNav,
  type ExternalLink,
  type NavAction,
  type NavGroup,
  type NavItem,
} from './nav-model';
import { PinnedLinks } from './PinnedLinks';

export interface AppShellProps {
  children: ReactNode;
  navGroups: NavGroup[];
  /** Quick-create entries for the pinned Create menu; none hides it. */
  createActions?: NavAction[];
  /** External services pinned under the header; none hides the row. */
  pinnedLinks?: readonly ExternalLink[];
  /** At or under this many pages the nav is a plain grouped list. */
  flatMaxItems?: number;
  title?: string;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | false;
}

const DRAWER_WIDTH = 260;

const rowSx = {
  mx: 1,
  borderRadius: 1,
  mb: 0.25,
  '&.Mui-selected': {
    bgcolor: 'action.selected',
    '&:hover': { bgcolor: 'action.selected' },
  },
} as const;

function ItemBadge({
  count,
  color,
  children,
}: {
  count?: number;
  color?: NavItem['badgeColor'];
  children: ReactNode;
}): ReactNode {
  if (!count || count <= 0) return children;
  return (
    <Badge badgeContent={count} color={color ?? 'error'} max={99}>
      {children}
    </Badge>
  );
}

function ItemLabel({
  label,
  active,
  size = '0.875rem',
}: {
  label: string;
  active: boolean;
  size?: string;
}): ReactNode {
  return (
    <ListItemText
      primary={label}
      slotProps={{
        primary: { sx: { fontSize: size, fontWeight: active ? 600 : 400 } },
      }}
    />
  );
}

/** Today's layout: every group open, with a heading. For small roles. */
function FlatNav({
  navGroups,
  activeHref,
  onNavigate,
}: {
  navGroups: NavGroup[];
  activeHref: string | undefined;
  onNavigate?: () => void;
}): ReactNode {
  return (
    <>
      {navGroups.map((group, groupIndex) => (
        <Box key={group.label}>
          {groupIndex > 0 && <Divider sx={{ mx: 2, my: 0.5 }} />}
          <Typography
            variant="overline"
            sx={{
              px: 2,
              pt: groupIndex === 0 ? 1 : 1.5,
              pb: 0.5,
              display: 'block',
              color: 'text.secondary',
              fontSize: '0.7rem',
              fontWeight: 600,
              letterSpacing: '0.08em',
            }}
          >
            {group.label}
          </Typography>
          <List disablePadding dense>
            {group.items.map((item) => {
              const isActive = item.href === activeHref;
              return (
                <ListItem key={item.href} disablePadding>
                  <ListItemButton
                    component={Link}
                    href={item.href}
                    selected={isActive}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={onNavigate}
                    sx={rowSx}
                  >
                    {item.icon && (
                      <ListItemIcon
                        sx={{
                          color: isActive ? 'secondary.main' : 'text.secondary',
                          minWidth: 36,
                        }}
                      >
                        <ItemBadge count={item.badge} color={item.badgeColor}>
                          {item.icon}
                        </ItemBadge>
                      </ListItemIcon>
                    )}
                    <ItemLabel label={item.label} active={isActive} />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        </Box>
      ))}
    </>
  );
}

/**
 * One row per area. The area you're in is open; the rest are closed.
 * Clicking an area goes to its first page, which opens it. An area with
 * a single page is just a link to that page.
 */
function AccordionNav({
  navGroups,
  activeHref,
  onNavigate,
}: {
  navGroups: NavGroup[];
  activeHref: string | undefined;
  onNavigate?: () => void;
}): ReactNode {
  const activeGroup = groupOfHref(navGroups, activeHref);
  return (
    <List disablePadding dense>
      {navGroups.map((group) => {
        const isCurrent = group.label === activeGroup;
        const multi = group.items.length > 1;
        const open = isCurrent && multi;
        const badge = groupBadge(group);
        return (
          <Box key={group.label} component="li" sx={{ listStyle: 'none' }}>
            <ListItemButton
              component={Link}
              href={group.items[0].href}
              selected={isCurrent && !multi}
              aria-current={isCurrent && !multi ? 'page' : undefined}
              aria-expanded={multi ? open : undefined}
              onClick={onNavigate}
              sx={{ ...rowSx, minHeight: 40 }}
            >
              {group.icon && (
                <ListItemIcon
                  sx={{
                    color: isCurrent ? 'secondary.main' : 'text.secondary',
                    minWidth: 36,
                  }}
                >
                  <ItemBadge
                    count={open ? undefined : badge?.count}
                    color={badge?.color}
                  >
                    {group.icon}
                  </ItemBadge>
                </ListItemIcon>
              )}
              <ItemLabel
                label={group.label}
                active={isCurrent}
                size="0.9375rem"
              />
              {multi &&
                (open ? (
                  <ExpandMoreIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                ) : (
                  <ChevronRightIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                ))}
            </ListItemButton>
            {multi && (
              <Collapse in={open} timeout="auto" unmountOnExit>
                <List
                  disablePadding
                  dense
                  aria-label={`${group.label} pages`}
                >
                  {group.items.map((item) => {
                    const isActive = item.href === activeHref;
                    return (
                      <ListItem key={item.href} disablePadding>
                        <ListItemButton
                          component={Link}
                          href={item.href}
                          selected={isActive}
                          aria-current={isActive ? 'page' : undefined}
                          onClick={onNavigate}
                          sx={{ ...rowSx, pl: 6.5 }}
                        >
                          <ItemLabel label={item.label} active={isActive} />
                          {item.badge && item.badge > 0 ? (
                            <Chip
                              label={item.badge > 99 ? '99+' : item.badge}
                              color={item.badgeColor ?? 'error'}
                              size="small"
                              sx={{ height: 20, fontWeight: 600 }}
                            />
                          ) : null}
                        </ListItemButton>
                      </ListItem>
                    );
                  })}
                </List>
              </Collapse>
            )}
          </Box>
        );
      })}
    </List>
  );
}

function SearchResults({
  navGroups,
  query,
  onNavigate,
}: {
  navGroups: NavGroup[];
  query: string;
  onNavigate: () => void;
}): ReactNode {
  const results = searchNav(navGroups, query);
  if (results.length === 0) {
    return (
      <Typography variant="body2" color="textSecondary" sx={{ px: 2, py: 1 }}>
        No pages match “{query.trim()}”.
      </Typography>
    );
  }
  return (
    <List disablePadding dense aria-label="Search results">
      {results.map(({ item, group }) => (
        <ListItem key={item.href} disablePadding>
          <ListItemButton
            component={Link}
            href={item.href}
            onClick={onNavigate}
            sx={rowSx}
          >
            <ListItemText
              primary={item.label}
              secondary={group === item.label ? undefined : group}
              slotProps={{
                primary: { sx: { fontSize: '0.875rem' } },
                secondary: { sx: { fontSize: '0.75rem' } },
              }}
            />
          </ListItemButton>
        </ListItem>
      ))}
    </List>
  );
}

function shortcutLabel(): string {
  if (typeof navigator === 'undefined') return '⌘K';
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
    ? '⌘K'
    : 'Ctrl K';
}

function CreateMenu({
  actions,
  onNavigate,
}: {
  actions: NavAction[];
  onNavigate?: () => void;
}): ReactNode {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = (): void => setAnchor(null);
  return (
    <>
      <Button
        variant="contained"
        color="primary"
        fullWidth
        startIcon={<AddIcon />}
        aria-haspopup="menu"
        aria-expanded={anchor ? true : undefined}
        aria-controls={anchor ? 'create-menu' : undefined}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ minHeight: 44 }}
      >
        Create
      </Button>
      <Menu
        id="create-menu"
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={close}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { width: DRAWER_WIDTH - 24, mt: -1 } } }}
      >
        {actions.map((action) => (
          <MenuItem
            key={action.href}
            component={Link}
            href={action.href}
            onClick={() => {
              close();
              onNavigate?.();
            }}
          >
            <ListItemIcon sx={{ color: 'secondary.main' }}>
              {action.icon ?? <AddIcon fontSize="small" />}
            </ListItemIcon>
            <ListItemText primary={action.label} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

/**
 * Shared layout with an accordion sidebar, modelled on Square Dashboard:
 * a page search at the top, one row per area (the current area open),
 * and a pinned Create menu. Roles that see only a few pages get the
 * plain grouped list instead.
 * Desktop: persistent left sidebar. Mobile: overlay drawer.
 */
export function AppShell({
  children,
  navGroups,
  createActions = [],
  pinnedLinks = [],
  flatMaxItems = FLAT_NAV_MAX_ITEMS,
  title = 'Maple & Spruce',
  maxWidth = 'lg',
}: AppShellProps): ReactNode {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [shortcut, setShortcut] = useState('⌘K');
  const searchRefs = useRef<Array<HTMLInputElement | null>>([]);

  const activeHref = useMemo(
    () => findActiveHref(navGroups, pathname),
    [navGroups, pathname],
  );
  const mode = navModeFor(navGroups, flatMaxItems);
  const searching = query.trim().length > 0;

  useEffect(() => {
    setShortcut(shortcutLabel());
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        // Whichever copy is on screen: the desktop sidebar or the drawer.
        const visible = searchRefs.current.find(
          (el) => el && el.offsetParent !== null,
        );
        visible?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleNavigate = (): void => {
    setMobileOpen(false);
    setQuery('');
  };

  const drawerContent = (slot: 0 | 1): ReactNode => (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box
        sx={{
          p: 2,
          bgcolor: 'secondary.main',
          color: 'secondary.contrastText',
          display: 'flex',
          alignItems: 'center',
          minHeight: { xs: 56, sm: 64 },
        }}
      >
        <Typography
          variant="h6"
          component={Link}
          href="/"
          sx={{ textDecoration: 'none', color: 'inherit' }}
        >
          {title}
        </Typography>
      </Box>

      {pinnedLinks.length > 0 && <PinnedLinks links={pinnedLinks} />}

      <Box sx={{ px: 1.5, pt: 1.5, pb: 1 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Search pages"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setQuery('');
            } else if (e.key === 'Enter') {
              const first = searchNav(navGroups, query)[0];
              if (first) {
                handleNavigate();
                router.push(first.item.href);
              }
            }
          }}
          inputRef={(el: HTMLInputElement | null) => {
            searchRefs.current[slot] = el;
          }}
          slotProps={{
            htmlInput: { 'aria-label': 'Search pages' },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment
                  position="end"
                  sx={{ display: { xs: 'none', md: 'flex' } }}
                >
                  <Typography
                    component="kbd"
                    variant="caption"
                    color="textSecondary"
                    sx={{
                      border: 1,
                      borderColor: 'divider',
                      borderRadius: 0.5,
                      px: 0.5,
                      fontFamily: 'inherit',
                    }}
                  >
                    {shortcut}
                  </Typography>
                </InputAdornment>
              ),
            },
          }}
        />
      </Box>

      <Box
        component="nav"
        aria-label="Main"
        sx={{ flex: 1, overflowY: 'auto', pb: 1 }}
      >
        {searching && (
          <SearchResults
            navGroups={navGroups}
            query={query}
            onNavigate={handleNavigate}
          />
        )}
        {!searching && mode === 'flat' && (
          <FlatNav
            navGroups={navGroups}
            activeHref={activeHref}
            onNavigate={handleNavigate}
          />
        )}
        {!searching && mode === 'accordion' && (
          <AccordionNav
            navGroups={navGroups}
            activeHref={activeHref}
            onNavigate={handleNavigate}
          />
        )}
      </Box>

      {/* Create + user menu pinned to bottom */}
      <Divider />
      <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {createActions.length > 0 && (
          <CreateMenu actions={createActions} onNavigate={handleNavigate} />
        )}
        <UserMenu variant="inline" />
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Desktop sidebar — persistent */}
      <Box
        sx={{
          width: { md: DRAWER_WIDTH },
          flexShrink: { md: 0 },
          display: { xs: 'none', md: 'block' },
        }}
      >
        <Drawer
          variant="permanent"
          sx={{
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: DRAWER_WIDTH,
              borderRight: '1px solid',
              borderColor: 'divider',
            },
          }}
          open
        >
          {drawerContent(0)}
        </Drawer>
      </Box>

      {/* Mobile drawer — overlay */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: DRAWER_WIDTH,
          },
        }}
      >
        {drawerContent(1)}
      </Drawer>

      {/* Main content area */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        {/* Mobile-only AppBar */}
        <AppBar
          position="static"
          color="secondary"
          elevation={1}
          sx={{ display: { md: 'none' } }}
        >
          <Toolbar>
            <IconButton
              color="inherit"
              aria-label="open navigation menu"
              edge="start"
              onClick={() => setMobileOpen(!mobileOpen)}
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton>
            <Typography
              variant="h6"
              component={Link}
              href="/"
              sx={{
                textDecoration: 'none',
                color: 'inherit',
                flexGrow: 1,
              }}
            >
              {title}
            </Typography>
            <UserMenu />
          </Toolbar>
        </AppBar>

        <Box
          component="main"
          sx={{
            flex: 1,
            p: { xs: 2, sm: 3, md: 4 },
            maxWidth: maxWidth || undefined,
            width: '100%',
            bgcolor: 'background.default',
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}
