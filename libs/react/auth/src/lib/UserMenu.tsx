'use client';

import { useState } from 'react';
import {
  ButtonBase,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Typography,
  Box,
} from '@mui/material';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuth } from './useAuth';

interface UserMenuProps {
  /** 'icon' shows just the icon button (for toolbars). 'inline' shows icon + email (for sidebars). */
  variant?: 'icon' | 'inline';
}

/**
 * User account menu with logout functionality.
 * Displays user email and sign out option.
 */
export function UserMenu({ variant = 'icon' }: UserMenuProps) {
  const { user, signOut } = useAuth();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSignOut = async () => {
    handleClose();
    try {
      await signOut();
    } catch (error) {
      console.error('Failed to sign out:', error);
    }
  };

  if (!user) {
    return null;
  }

  const trigger =
    variant === 'inline' ? (
      <ButtonBase
        onClick={handleClick}
        aria-label="account menu"
        aria-controls={open ? 'account-menu' : undefined}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : undefined}
        sx={{
          width: '100%',
          justifyContent: 'flex-start',
          gap: 1.5,
          px: 1,
          py: 1,
          borderRadius: 1,
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <AccountCircleIcon sx={{ color: 'text.secondary' }} />
        <Typography
          variant="body2"
          color="primary"
          noWrap
          sx={{ fontWeight: 500 }}
        >
          {user.displayName || user.email}
        </Typography>
      </ButtonBase>
    ) : (
      <IconButton
        onClick={handleClick}
        size="large"
        edge="end"
        color="inherit"
        aria-label="account menu"
        aria-controls={open ? 'account-menu' : undefined}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : undefined}
      >
        <AccountCircleIcon />
      </IconButton>
    );

  return (
    <>
      {trigger}
      <Menu
        id="account-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        onClick={handleClose}
        transformOrigin={{ horizontal: 'left', vertical: 'bottom' }}
        anchorOrigin={{ horizontal: 'left', vertical: 'top' }}
        slotProps={{
          paper: {
            sx: { minWidth: 200 },
          },
        }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Signed in as
          </Typography>
          <Typography variant="body2" fontWeight="medium" noWrap>
            {user.email}
          </Typography>
        </Box>
        <Divider />
        <MenuItem onClick={handleSignOut}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Sign out</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}
