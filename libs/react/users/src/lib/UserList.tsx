'use client';

import {
  Avatar,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { AppUser } from '@maple/ts/domain';
import { describeUserRoles } from './describeUserRoles';

export interface UserListProps {
  users: AppUser[];
  /** Caller's UID — used to mark "this is you" in the row. */
  callerUid: string | null;
  onManage: (user: AppUser) => void;
}

function formatRelativeDate(date?: Date): string {
  if (!date) return 'Never';
  const ms = Date.now() - date.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return date.toLocaleDateString();
}

export function UserList({ users, callerUid, onManage }: UserListProps) {
  if (users.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">No users yet.</Typography>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>User</TableCell>
            <TableCell>Roles</TableCell>
            <TableCell>Last sign-in</TableCell>
            <TableCell align="right" />
          </TableRow>
        </TableHead>
        <TableBody>
          {users.map((user) => {
            const isSelf = user.uid === callerUid;
            const chips = describeUserRoles(user);
            return (
              <TableRow key={user.uid} hover>
                <TableCell>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Avatar src={user.photoUrl} sx={{ width: 36, height: 36 }}>
                      {(user.displayName || user.email || '?')
                        .charAt(0)
                        .toUpperCase()}
                    </Avatar>
                    <Box>
                      <Typography variant="body2">
                        {user.displayName ?? '(no name)'}
                        {isSelf && (
                          <Typography
                            component="span"
                            variant="caption"
                            color="text.secondary"
                            sx={{ ml: 1 }}
                          >
                            (you)
                          </Typography>
                        )}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {user.email ?? '(no email)'}
                      </Typography>
                    </Box>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap">
                    {chips.map((chip) => (
                      <Chip
                        key={chip.label}
                        size="small"
                        label={chip.label}
                        color={chip.color}
                        variant={chip.color === 'default' ? 'outlined' : 'filled'}
                      />
                    ))}
                  </Stack>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {formatRelativeDate(user.lastSignInAt)}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => onManage(user)}>
                    Manage
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Paper>
  );
}
