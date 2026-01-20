'use client';

import { ReactNode } from 'react';
import HomeIcon from '@mui/icons-material/Home';
import InventoryIcon from '@mui/icons-material/Inventory';
import PeopleIcon from '@mui/icons-material/People';
import CategoryIcon from '@mui/icons-material/Category';
import { AppShell, type NavItem } from '@maple/react/layout';

const navItems: NavItem[] = [
  { label: 'Home', href: '/', icon: <HomeIcon /> },
  { label: 'Inventory', href: '/inventory', icon: <InventoryIcon /> },
  { label: 'Categories', href: '/categories', icon: <CategoryIcon /> },
  { label: 'Artists', href: '/artists', icon: <PeopleIcon /> },
];

interface AppShellWrapperProps {
  children: ReactNode;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | false;
}

/**
 * App-specific wrapper around the library's AppShell component.
 * Provides the navigation configuration for Maple & Spruce.
 */
export function AppShellWrapper({
  children,
  maxWidth = 'lg',
}: AppShellWrapperProps) {
  return (
    <AppShell navItems={navItems} maxWidth={maxWidth}>
      {children}
    </AppShell>
  );
}
