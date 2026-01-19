'use client';

import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AppBar,
  Box,
  Button,
  Container,
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
import HomeIcon from '@mui/icons-material/Home';
import InventoryIcon from '@mui/icons-material/Inventory';
import PeopleIcon from '@mui/icons-material/People';
import CategoryIcon from '@mui/icons-material/Category';
import { UserMenu } from '../auth';

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
}

const navItems: NavItem[] = [
  { label: 'Home', href: '/', icon: <HomeIcon /> },
  { label: 'Inventory', href: '/inventory', icon: <InventoryIcon /> },
  { label: 'Categories', href: '/categories', icon: <CategoryIcon /> },
  { label: 'Artists', href: '/artists', icon: <PeopleIcon /> },
];

interface AppShellProps {
  children: ReactNode;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | false;
}

/**
 * Shared layout component with navigation.
 * Provides consistent AppBar and navigation across all authenticated pages.
 * Responsive: shows hamburger menu on mobile, inline buttons on desktop.
 */
export function AppShell({ children, maxWidth = 'lg' }: AppShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const drawer = (
    <Box sx={{ width: 250 }}>
      <Box sx={{ p: 2, bgcolor: 'secondary.main', color: 'secondary.contrastText' }}>
        <Typography variant="h6">Maple & Spruce</Typography>
      </Box>
      <List>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <ListItem key={item.href} disablePadding>
              <ListItemButton
                component={Link}
                href={item.href}
                selected={isActive}
                onClick={handleDrawerToggle}
                sx={{
                  '&.Mui-selected': {
                    bgcolor: 'action.selected',
                  },
                }}
              >
                <ListItemIcon sx={{ color: isActive ? 'secondary.main' : 'inherit' }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" color="secondary" elevation={1}>
        <Toolbar>
          {/* Mobile menu button */}
          <IconButton
            color="inherit"
            aria-label="open navigation menu"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
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
              mr: 4,
              flexGrow: { xs: 1, sm: 0 },
            }}
          >
            Maple & Spruce
          </Typography>

          {/* Desktop navigation */}
          <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 1, flexGrow: 1 }}>
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Button
                  key={item.href}
                  component={Link}
                  href={item.href}
                  color="inherit"
                  startIcon={item.icon}
                  sx={{
                    backgroundColor: isActive ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                    '&:hover': {
                      backgroundColor: isActive
                        ? 'rgba(255, 255, 255, 0.2)'
                        : 'rgba(255, 255, 255, 0.1)',
                    },
                  }}
                >
                  {item.label}
                </Button>
              );
            })}
          </Box>

          <UserMenu />
        </Toolbar>
      </AppBar>

      {/* Mobile navigation drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', sm: 'none' },
          '& .MuiDrawer-paper': { boxSizing: 'border-box', width: 250 },
        }}
      >
        {drawer}
      </Drawer>

      <Container maxWidth={maxWidth} sx={{ py: 4 }}>
        {children}
      </Container>
    </Box>
  );
}
