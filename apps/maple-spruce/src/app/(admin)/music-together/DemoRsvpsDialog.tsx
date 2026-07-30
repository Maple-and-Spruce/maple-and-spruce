'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Typography,
  Box,
  Stack,
  Chip,
  Skeleton,
  Alert,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import {
  mtDemoDisplayLabel,
  type RequestState,
  type MusicTogetherDemoRsvp,
} from '@maple/ts/domain';
import type {
  GetMusicTogetherDemoRsvpsResponse,
  MusicTogetherDemoRsvpGroup,
} from '@maple/ts/firebase/api-types';

interface Props {
  open: boolean;
  onClose: () => void;
  demoRsvpsState: RequestState<GetMusicTogetherDemoRsvpsResponse>;
}

/** Table-shaped placeholder shown while the RSVPs load. */
function DemoLoadingSkeleton() {
  return (
    <Box sx={{ mt: 1 }}>
      <Skeleton variant="text" width="40%" sx={{ mb: 1 }} />
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Email</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {Array.from({ length: 3 }).map((_, r) => (
            <TableRow key={r}>
              <TableCell>
                <Skeleton variant="text" width="70%" />
              </TableCell>
              <TableCell>
                <Skeleton variant="text" width="55%" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

/** A copy-emails button that flips to "Copied!" briefly. */
function CopyEmailsButton({ rsvps }: { rsvps: MusicTogetherDemoRsvp[] }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    const emails = rsvps
      .map((r) => r.email)
      .filter((email, i, arr) => arr.indexOf(email) === i) // dedupe
      .join(', ');
    navigator.clipboard.writeText(emails).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <Button
      size="small"
      variant="outlined"
      startIcon={<ContentCopyIcon />}
      onClick={handleCopy}
      disabled={rsvps.length === 0}
    >
      {copied ? 'Copied!' : 'Copy emails'}
    </Button>
  );
}

/** A table of RSVPs (name + email), or a muted "none" line. */
function RsvpTable({ rsvps }: { rsvps: MusicTogetherDemoRsvp[] }) {
  if (rsvps.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
        None yet.
      </Typography>
    );
  }
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Name</TableCell>
          <TableCell>Email</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rsvps.map((rsvp) => (
          <TableRow key={rsvp.id}>
            <TableCell>{rsvp.name}</TableCell>
            <TableCell>{rsvp.email}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** One demo with its confirmed + waitlisted RSVPs, each with a copy-emails button. */
function DemoGroupSection({ group }: { group: MusicTogetherDemoRsvpGroup }) {
  const allRsvps = [...group.confirmed, ...group.waitlisted];
  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 1,
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Typography variant="h6">
          {mtDemoDisplayLabel(group.demo)}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Chip
            size="small"
            color="success"
            label={`${group.confirmed.length} / ${group.demo.capacityFamilies} confirmed`}
          />
          {group.waitlisted.length > 0 && (
            <Chip
              size="small"
              label={`${group.waitlisted.length} waitlisted`}
            />
          )}
          <CopyEmailsButton rsvps={allRsvps} />
        </Box>
      </Box>
      <Typography variant="subtitle2" sx={{ mt: 1 }}>
        Confirmed
      </Typography>
      <RsvpTable rsvps={group.confirmed} />
      {group.waitlisted.length > 0 && (
        <>
          <Typography variant="subtitle2" sx={{ mt: 1.5 }}>
            Waitlist
          </Typography>
          <RsvpTable rsvps={group.waitlisted} />
        </>
      )}
    </Box>
  );
}

/**
 * Admin viewer for the free Music Together demo-class RSVPs. Lists each demo
 * (soonest first) with its families split into confirmed (seated) and
 * waitlisted, each with counts and a copy-emails button so Stephanie can
 * follow up.
 */
export function DemoRsvpsDialog({ open, onClose, demoRsvpsState }: Props) {
  const groups =
    demoRsvpsState.status === 'success' ? demoRsvpsState.data.demos : [];
  // Only show demos that actually have at least one RSVP.
  const withRsvps = groups.filter(
    (g) => g.confirmed.length + g.waitlisted.length > 0
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Demo RSVPs</DialogTitle>
      <DialogContent>
        {(demoRsvpsState.status === 'idle' ||
          demoRsvpsState.status === 'loading') && <DemoLoadingSkeleton />}
        {demoRsvpsState.status === 'error' && (
          <Alert severity="error">{demoRsvpsState.error}</Alert>
        )}
        {demoRsvpsState.status === 'success' && withRsvps.length === 0 && (
          <Typography sx={{ p: 2 }} color="text.secondary">
            No RSVPs yet.
          </Typography>
        )}
        {demoRsvpsState.status === 'success' && withRsvps.length > 0 && (
          <Stack spacing={4} sx={{ mt: 1 }}>
            {withRsvps.map((group) => (
              <DemoGroupSection key={group.demo.id} group={group} />
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
