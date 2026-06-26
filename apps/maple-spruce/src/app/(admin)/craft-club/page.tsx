'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  Stack,
  Alert,
  CircularProgress,
  Paper,
} from '@mui/material';
import type {
  CraftClubMember,
  CraftClubMemberStatus,
} from '@maple/ts/domain';
import { CRAFT_CLUB_MONTHLY_PRICE_CENTS } from '@maple/ts/domain';
import { useCraftClubMembers } from '../../../hooks';

const STATUS_LABELS: Record<CraftClubMemberStatus, string> = {
  requested: 'Requested',
  approved: 'Approved',
  active: 'Active',
  past_due: 'Past due',
  paused: 'Paused',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<
  CraftClubMemberStatus,
  'default' | 'info' | 'success' | 'warning' | 'error'
> = {
  requested: 'warning',
  approved: 'info',
  active: 'success',
  past_due: 'error',
  paused: 'default',
  cancelled: 'default',
};

function formatDate(date?: Date): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString();
}

export default function CraftClubPage() {
  const [statusFilter, setStatusFilter] = useState<
    CraftClubMemberStatus | ''
  >('');

  const filters = useMemo(
    () => ({ status: statusFilter || undefined }),
    [statusFilter]
  );

  const { membersState, approveMember, updateMember } =
    useCraftClubMembers(filters);

  // Approve-by-email form
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

  const monthlyPrice = (CRAFT_CLUB_MONTHLY_PRICE_CENTS / 100).toFixed(2);

  const handleApprove = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setFormError(null);
      setSubmitting(true);
      try {
        await approveMember({
          email: email.trim(),
          name: name.trim() || undefined,
        });
        setEmail('');
        setName('');
      } catch (err) {
        setFormError(
          err instanceof Error ? err.message : 'Failed to approve email'
        );
      } finally {
        setSubmitting(false);
      }
    },
    [approveMember, email, name]
  );

  const handlePromoteRequest = useCallback(
    async (member: CraftClubMember) => {
      setRowBusyId(member.id);
      try {
        await approveMember({ email: member.email });
      } finally {
        setRowBusyId(null);
      }
    },
    [approveMember]
  );

  const handleRevoke = useCallback(
    async (member: CraftClubMember) => {
      setRowBusyId(member.id);
      try {
        await updateMember({ id: member.id, status: 'cancelled' });
      } finally {
        setRowBusyId(null);
      }
    },
    [updateMember]
  );

  const members =
    membersState.status === 'success' ? membersState.data : [];

  return (
    <>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1">
          Craft Club
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Members pay ${monthlyPrice}/month for scheduled studio access.
          Materials are charged separately at the POS.
        </Typography>
      </Box>

      {/* Pre-approve an email */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Pre-approve an email
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Only approved emails can attach a payment method and subscribe.
        </Typography>
        <Box component="form" onSubmit={handleApprove}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Email"
              type="email"
              size="small"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              sx={{ minWidth: 260 }}
            />
            <TextField
              label="Name (optional)"
              size="small"
              value={name}
              onChange={(e) => setName(e.target.value)}
              sx={{ minWidth: 200 }}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={submitting || !email.trim()}
            >
              {submitting ? 'Approving…' : 'Approve'}
            </Button>
          </Stack>
          {formError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {formError}
            </Alert>
          )}
        </Box>
      </Paper>

      {/* Filter */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Filter by Status</InputLabel>
          <Select
            value={statusFilter}
            label="Filter by Status"
            onChange={(e) =>
              setStatusFilter(
                (e.target.value as CraftClubMemberStatus) || ''
              )
            }
          >
            <MenuItem value="">
              <em>All Statuses</em>
            </MenuItem>
            {(
              Object.keys(STATUS_LABELS) as CraftClubMemberStatus[]
            ).map((s) => (
              <MenuItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {membersState.status === 'loading' && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {membersState.status === 'error' && (
        <Alert severity="error">{membersState.error}</Alert>
      )}

      {membersState.status === 'success' && (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Email</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Approved</TableCell>
                <TableCell>Subscribed</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {members.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ py: 2 }}
                    >
                      No members yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>{member.email}</TableCell>
                  <TableCell>{member.name ?? '—'}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={STATUS_LABELS[member.status]}
                      color={STATUS_COLORS[member.status]}
                    />
                  </TableCell>
                  <TableCell>{formatDate(member.approvedAt)}</TableCell>
                  <TableCell>{formatDate(member.subscribedAt)}</TableCell>
                  <TableCell align="right">
                    {member.status === 'requested' && (
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={rowBusyId === member.id}
                        onClick={() => handlePromoteRequest(member)}
                      >
                        Approve
                      </Button>
                    )}
                    {member.status === 'approved' && (
                      <Button
                        size="small"
                        color="error"
                        disabled={rowBusyId === member.id}
                        onClick={() => handleRevoke(member)}
                      >
                        Revoke
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </>
  );
}
