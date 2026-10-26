'use client';

/**
 * PrivateHourRoster - the roster of a private-hours class, by day and hour.
 * Each hour shows the group holding it (or "Open"), so staff can see the day
 * at a glance. Cancelled and refunded bookings free their hour and are left
 * to the full registration list below it.
 */
import {
  Alert,
  Box,
  Chip,
  IconButton,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { buildPrivateHourRoster } from '@maple/ts/domain';
import type { Class, Registration, RequestState } from '@maple/ts/domain';

interface PrivateHourRosterProps {
  classItem: Pick<Class, 'sessions' | 'durationMinutes'>;
  registrationsState: RequestState<Registration[]>;
  onViewDetail: (registration: Registration) => void;
}

export function PrivateHourRoster({
  classItem,
  registrationsState,
  onViewDetail,
}: PrivateHourRosterProps) {
  if (registrationsState.status === 'idle' || registrationsState.status === 'loading') {
    return (
      <Box aria-busy="true" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Skeleton variant="rectangular" height={180} sx={{ borderRadius: 2 }} />
        <Skeleton variant="rectangular" height={180} sx={{ borderRadius: 2 }} />
      </Box>
    );
  }
  if (registrationsState.status === 'error') {
    return <Alert severity="error">Couldn&apos;t load the bookings for this class.</Alert>;
  }

  const days = buildPrivateHourRoster(classItem, registrationsState.data);
  if (days.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="textSecondary">
          This class has no hours yet. Add dates and start times to the class.
        </Typography>
      </Paper>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {days.map((day) => (
        <TableContainer component={Paper} key={day.key}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              px: 2,
              py: 1.5,
              bgcolor: 'grey.50',
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            <Typography variant="subtitle1" component="h3">
              {day.label}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              {day.bookedCount} of {day.hours.length} booked
            </Typography>
          </Box>
          {/* Fixed widths so the columns line up from one day to the next. */}
          <Table
            size="small"
            aria-label={`Hours on ${day.label}`}
            sx={{ tableLayout: 'fixed', minWidth: 560 }}
          >
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: '22%' }}>Hour</TableCell>
                <TableCell sx={{ width: '38%' }}>Group</TableCell>
                <TableCell sx={{ width: '14%' }}>Size</TableCell>
                <TableCell sx={{ width: '16%' }}>Status</TableCell>
                <TableCell sx={{ width: '10%' }} align="right">
                  Details
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {day.hours.map((hour) => {
                const reg = hour.registration;
                return (
                  <TableRow key={hour.start} hover={!!reg}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{hour.label}</TableCell>
                    <TableCell>
                      {reg ? (
                        <>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {reg.customerName}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            {reg.customerEmail}
                          </Typography>
                        </>
                      ) : (
                        <Typography variant="body2" color="textSecondary">
                          Open
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{reg?.groupSize ? `about ${reg.groupSize}` : ''}</TableCell>
                    <TableCell>
                      {reg && (
                        <Chip
                          label={reg.status === 'pending' ? 'Checking out' : 'Booked'}
                          size="small"
                          color={reg.status === 'pending' ? 'warning' : 'success'}
                        />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {reg && (
                        <IconButton
                          size="small"
                          aria-label={`View booking for ${hour.label}`}
                          onClick={() => onViewDetail(reg)}
                        >
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      ))}
    </Box>
  );
}
