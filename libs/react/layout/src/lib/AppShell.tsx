'use client';

import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AppBar,
  Badge,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { UserMenu } from '@maple/react/auth';

export interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  /** Optional badge count to display on the nav item */
  badge?: number;
  /** Badge color (defaults to 'error' for visibility) */
  badgeColor?:
    | 'primary'
    | 'secondary'
    | 'error'
    | 'warning'
    | 'info'
    | 'success';
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export interface AppShellProps {
  children: ReactNode;
  navGroups: NavGroup[];
  title?: string;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | false;
}

const DRAWER_WIDTH = 260;

function NavContent({
  navGroups,
  pathname,
  onNavigate,
}: {
  navGroups: NavGroup[];
  pathname: string;
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
              const isActive = pathname === item.href;
              return (
                <ListItem key={item.href} disablePadding>
                  <ListItemButton
                    component={Link}
                    href={item.href}
                    selected={isActive}
                    onClick={onNavigate}
                    sx={{
                      mx: 1,
                      borderRadius: 1,
                      mb: 0.25,
                      '&.Mui-selected': {
                        bgcolor: 'action.selected',
                        '&:hover': {
                          bgcolor: 'action.selected',
                        },
                      },
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        color: isActive ? 'secondary.main' : 'text.secondary',
                        minWidth: 36,
                      }}
                    >
                      {item.badge && item.badge > 0 ? (
                        <Badge
                          badgeContent={item.badge}
                          color={item.badgeColor || 'error'}
                          max={99}
                        >
                          {item.icon}
                        </Badge>
                      ) : (
                        item.icon
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={item.label}
                      primaryTypographyProps={{
                        fontSize: '0.875rem',
                        fontWeight: isActive ? 600 : 400,
                      }}
                    />
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
 * Shared layout with shelf-style sidebar navigation.
 * Desktop: persistent left sidebar with grouped nav sections.
 * Mobile: overlay drawer triggered by hamburger menu.
 * Inspired by Mountain Sol admin drawer pattern.
 */
export function AppShell({
  children,
  navGroups,
  title = 'Maple & Spruce',
  maxWidth = 'lg',
}: AppShellProps): ReactNode {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleDrawerToggle = (): void => {
    setMobileOpen(!mobileOpen);
  };

  const drawerContent = (
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

      <Box sx={{ flex: 1, overflowY: 'auto', py: 1 }}>
        <NavContent
          navGroups={navGroups}
          pathname={pathname}
          onNavigate={() => setMobileOpen(false)}
        />
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Desktop sidebar — persistent */}
      <Box
        component="nav"
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
          {drawerContent}
        </Drawer>
      </Box>

      {/* Mobile drawer — overlay */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: DRAWER_WIDTH,
          },
        }}
      >
        {drawerContent}
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
              onClick={handleDrawerToggle}
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

        {/* Desktop top bar — user menu only */}
        <AppBar
          position="static"
          color="inherit"
          elevation={0}
          sx={{
            display: { xs: 'none', md: 'flex' },
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Toolbar sx={{ justifyContent: 'flex-end' }}>
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
