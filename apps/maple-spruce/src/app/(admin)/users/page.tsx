'use client';

import { useCallback, useState } from 'react';
import { Alert, Box, CircularProgress, Stack, Typography } from '@mui/material';
import type { AppUser } from '@maple/ts/domain';
import { UserList, UserRolesDialog } from '@maple/react/users';
import { useAuth, useUsers } from '../../../hooks';

export default function UsersPage() {
  const { user } = useAuth();
  const { usersState, grantAdmin, revokeAdmin } = useUsers();

  const [selected, setSelected] = useState<AppUser | null>(null);

  const users = usersState.status === 'success' ? usersState.data : [];

  const handleGrantAdmin = useCallback(
    async (uid: string) => {
      await grantAdmin(uid);
      setSelected((prev) =>
        prev?.uid === uid ? { ...prev, isAdmin: true } : prev
      );
    },
    [grantAdmin]
  );

  const handleRevokeAdmin = useCallback(
    async (uid: string) => {
      await revokeAdmin(uid);
      setSelected((prev) =>
        prev?.uid === uid ? { ...prev, isAdmin: false } : prev
      );
    },
    [revokeAdmin]
  );

  return (
    <>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1">
          Users
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Everyone who&apos;s signed up to the admin app. Grant admin
          access to those who need it.
        </Typography>
      </Box>

      <Stack spacing={2}>
        {usersState.status === 'error' && (
          <Alert severity="error">
            Couldn&apos;t load users: {usersState.error}
          </Alert>
        )}

        {usersState.status === 'loading' || usersState.status === 'idle' ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress color="primary" />
          </Box>
        ) : (
          <UserList
            users={users}
            callerUid={user?.uid ?? null}
            onManage={(u) => setSelected(u)}
          />
        )}
      </Stack>

      <UserRolesDialog
        open={!!selected}
        user={selected}
        callerUid={user?.uid ?? null}
        onClose={() => setSelected(null)}
        onGrantAdmin={handleGrantAdmin}
        onRevokeAdmin={handleRevokeAdmin}
      />
    </>
  );
}
