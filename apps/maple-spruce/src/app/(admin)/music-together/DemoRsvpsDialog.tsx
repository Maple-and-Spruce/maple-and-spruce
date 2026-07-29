'use client';

import { useMemo, useState } from 'react';
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
  Skeleton,
  Alert,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import type { RequestState, MusicTogetherDemoRsvp } from '@maple/ts/domain';
import type { GetMusicTogetherDemoRsvpsResponse } from '@maple/ts/firebase/api-types';

interface Props {
  open: boolean;
  onClose: () => void;
  demoRsvpsState: RequestState<GetMusicTogetherDemoRsvpsResponse>;
}

/** One demo slot with the families who RSVP'd to it (in signup order). */
interface DemoSlotGroup {
  slot: string;
  rsvps: MusicTogetherDemoRsvp[];
}

/** Group RSVPs by their chosen slot, preserving first-seen slot order. */
function groupBySlot(rsvps: MusicTogetherDemoRsvp[]): DemoSlotGroup[] {
  const groups = new Map<string, MusicTogetherDemoRsvp[]>();
  for (const rsvp of rsvps) {
    const list = groups.get(rsvp.demoSlot) ?? [];
    list.push(rsvp);
    groups.set(rsvp.demoSlot, list);
  }
  return Array.from(groups, ([slot, slotRsvps]) => ({ slot, rsvps: slotRsvps }));
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

/** A single demo-slot group: a header with count + copy-emails, then the rows. */
function DemoSlotSection({ group }: { group: DemoSlotGroup }) {
  const [copied, setCopied] = useState(false);

  const handleCopyEmails = () => {
    const emails = group.rsvps
      .map((r) => r.email)
      .filter((email, i, arr) => arr.indexOf(email) === i) // dedupe
      .join(', ');
    navigator.clipboard.writeText(emails).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

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
          {group.slot} ({group.rsvps.length})
        </Typography>
        <Button
          size="small"
          variant="outlined"
          startIcon={<ContentCopyIcon />}
          onClick={handleCopyEmails}
        >
          {copied ? 'Copied!' : 'Copy emails'}
        </Button>
      </Box>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Email</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {group.rsvps.map((rsvp) => (
            <TableRow key={rsvp.id}>
              <TableCell>{rsvp.name}</TableCell>
              <TableCell>{rsvp.email}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

/**
 * Admin viewer for the free Music Together demo-class RSVPs. Lists families
 * grouped by the demo slot they chose, each group with a count and a
 * copy-emails button, so Stephanie can follow up.
 */
export function DemoRsvpsDialog({ open, onClose, demoRsvpsState }: Props) {
  const rsvps =
    demoRsvpsState.status === 'success' ? demoRsvpsState.data.rsvps : [];
  const groups = useMemo(() => groupBySlot(rsvps), [rsvps]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Demo RSVPs</DialogTitle>
      <DialogContent>
        {(demoRsvpsState.status === 'idle' ||
          demoRsvpsState.status === 'loading') && <DemoLoadingSkeleton />}
        {demoRsvpsState.status === 'error' && (
          <Alert severity="error">{demoRsvpsState.error}</Alert>
        )}
        {demoRsvpsState.status === 'success' && groups.length === 0 && (
          <Typography sx={{ p: 2 }} color="text.secondary">
            No RSVPs yet.
          </Typography>
        )}
        {demoRsvpsState.status === 'success' && groups.length > 0 && (
          <Stack spacing={4} sx={{ mt: 1 }}>
            {groups.map((group) => (
              <DemoSlotSection key={group.slot} group={group} />
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
