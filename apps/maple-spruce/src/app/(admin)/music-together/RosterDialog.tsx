'use client';

import { useMemo } from 'react';
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
  Chip,
  Typography,
  Box,
  CircularProgress,
  Alert,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import {
  buildMusicTogetherLicenseeCsv,
  mtFormatDob,
  type RequestState,
} from '@maple/ts/domain';
import type { GetMusicTogetherRosterResponse } from '@maple/ts/firebase/api-types';

interface Props {
  open: boolean;
  onClose: () => void;
  sectionName: string;
  rosterState: RequestState<GetMusicTogetherRosterResponse>;
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function RosterDialog({ open, onClose, sectionName, rosterState }: Props) {
  const entries =
    rosterState.status === 'success' ? rosterState.data.entries : [];

  const confirmed = useMemo(
    () =>
      entries.filter((e) => e.registration.status === 'confirmed'),
    [entries]
  );

  const handleDownload = () => {
    const csv = buildMusicTogetherLicenseeCsv(
      confirmed.map((e) => e.registration)
    );
    const safe = sectionName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    downloadCsv(`music-together-licensee-${safe}.csv`, csv);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Roster — {sectionName}</DialogTitle>
      <DialogContent>
        {rosterState.status === 'loading' && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        )}
        {rosterState.status === 'error' && (
          <Alert severity="error">{rosterState.error}</Alert>
        )}
        {rosterState.status === 'success' && entries.length === 0 && (
          <Typography sx={{ p: 2 }} color="text.secondary">
            No families enrolled yet.
          </Typography>
        )}
        {rosterState.status === 'success' && entries.length > 0 && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Parent(s)</TableCell>
                <TableCell>Children (DOB)</TableCell>
                <TableCell>Plan</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.registration.id}>
                  <TableCell>{entry.registration.parentNames.join(', ')}</TableCell>
                  <TableCell>
                    {entry.registration.children
                      .map((c) => `${c.name} (${mtFormatDob(new Date(c.dob))})`)
                      .join(', ')}
                  </TableCell>
                  <TableCell>{entry.registration.paymentPlan}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={
                        entry.pastDue
                          ? 'Past due'
                          : entry.registration.status
                      }
                      color={
                        entry.pastDue
                          ? 'error'
                          : entry.registration.status === 'confirmed'
                            ? 'success'
                            : 'default'
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          startIcon={<DownloadIcon />}
          onClick={handleDownload}
          disabled={confirmed.length === 0}
        >
          Licensee CSV ({confirmed.length})
        </Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
