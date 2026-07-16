'use client';

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
  Stack,
  LinearProgress,
  CircularProgress,
  Alert,
} from '@mui/material';
import type { RequestState } from '@maple/ts/domain';
import type { GetMusicTogetherInterestResponse } from '@maple/ts/firebase/api-types';

interface Props {
  open: boolean;
  onClose: () => void;
  interestState: RequestState<GetMusicTogetherInterestResponse>;
}

const fmtDay = (d: Date) =>
  new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' });

/** Long free-text cell, or a muted em-dash when empty. */
function NoteCell({ text }: { text?: string }) {
  if (!text?.trim()) {
    return (
      <Typography variant="body2" color="text.disabled">
        —
      </Typography>
    );
  }
  return (
    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
      {text}
    </Typography>
  );
}

/**
 * Admin view of the cross-section interest list: a per-section demand ranking
 * (which class times families most want) plus the individual submissions with
 * their preference / alternate-time / notes answers.
 */
export function InterestListDialog({ open, onClose, interestState }: Props) {
  const entries =
    interestState.status === 'success' ? interestState.data.entries : [];
  const demand =
    interestState.status === 'success' ? interestState.data.demand : [];
  const sectionNames =
    interestState.status === 'success' ? interestState.data.sectionNames : {};

  const topCount = demand[0]?.count ?? 0;
  const sectionLabel = (id: string) => sectionNames[id] ?? id;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Interest list — cross-section demand</DialogTitle>
      <DialogContent>
        {interestState.status === 'loading' && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        )}
        {interestState.status === 'error' && (
          <Alert severity="error">{interestState.error}</Alert>
        )}
        {interestState.status === 'success' && entries.length === 0 && (
          <Typography sx={{ p: 2 }} color="text.secondary">
            No interest submissions yet. Families who join the interest list —
            even before a section fills — show up here.
          </Typography>
        )}
        {interestState.status === 'success' && entries.length > 0 && (
          <Stack spacing={4} sx={{ mt: 1 }}>
            {/* ── Demand ranking ─────────────────────────────────────── */}
            <Box>
              <Typography variant="h6" component="h3" sx={{ mb: 1 }}>
                Demand by section
              </Typography>
              {demand.length === 0 ? (
                <Typography color="text.secondary" variant="body2">
                  No section checked yet — see the alternate-time notes below for
                  what times families want.
                </Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Section</TableCell>
                      <TableCell sx={{ width: '45%' }}>Interest</TableCell>
                      <TableCell align="right">Families</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {demand.map((d) => (
                      <TableRow key={d.sectionId}>
                        <TableCell>{sectionLabel(d.sectionId)}</TableCell>
                        <TableCell>
                          <LinearProgress
                            variant="determinate"
                            value={topCount ? (d.count / topCount) * 100 : 0}
                            aria-label={`${d.count} families interested in ${sectionLabel(
                              d.sectionId
                            )}`}
                            sx={{ height: 8, borderRadius: 1 }}
                          />
                        </TableCell>
                        <TableCell align="right">{d.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Box>

            {/* ── Individual submissions ─────────────────────────────── */}
            <Box>
              <Typography variant="h6" component="h3" sx={{ mb: 1 }}>
                Submissions ({entries.length})
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Family</TableCell>
                    <TableCell>Interested in</TableCell>
                    <TableCell>Most interested</TableCell>
                    <TableCell>Other days/times</TableCell>
                    <TableCell>Notes</TableCell>
                    <TableCell>Joined</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell sx={{ maxWidth: 180 }}>
                        <Typography variant="body2">{entry.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {entry.email}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ maxWidth: 180 }}>
                        {entry.interestedSectionIds.length === 0 ? (
                          <Typography variant="body2" color="text.disabled">
                            —
                          </Typography>
                        ) : (
                          <Box
                            sx={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 0.5,
                            }}
                          >
                            {entry.interestedSectionIds.map((id) => (
                              <Chip
                                key={id}
                                size="small"
                                label={sectionLabel(id)}
                              />
                            ))}
                          </Box>
                        )}
                      </TableCell>
                      <TableCell sx={{ maxWidth: 180 }}>
                        <NoteCell text={entry.preferenceNote} />
                      </TableCell>
                      <TableCell sx={{ maxWidth: 180 }}>
                        <NoteCell text={entry.alternateTimesNote} />
                      </TableCell>
                      <TableCell sx={{ maxWidth: 180 }}>
                        <NoteCell text={entry.notes} />
                      </TableCell>
                      <TableCell>{fmtDay(entry.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
