'use client';

/**
 * The `/leads` queue (#795).
 *
 * Built to be *cleared*, not browsed. Each row shows everything needed to make
 * the next call without opening anything — name, how to reach them, the child's
 * age, when they can come in, whether they are on Hope — and carries one
 * labelled primary action plus an overflow for the rest.
 *
 * That action shape is the pattern #805 is moving the lesson surfaces onto:
 * a labelled primary button, a `MoreVert` overflow, and **per-row** pending
 * state. A page-wide `busy` boolean (which `/my-day` still has) freezes every
 * row while one is saving, and unlabelled icon buttons make a state change a
 * guess. No reason to build the new surface with the old defect.
 */

import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Link,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import StarsIcon from '@mui/icons-material/Stars';
import type { LessonInquiry, LessonInquiryStatus } from '@maple/ts/domain';
import { daysWaiting, isLessonInquiryStale } from '@maple/ts/domain';

export interface LessonInquiryListProps {
  inquiries: LessonInquiry[];
  /** Id of the inquiry currently saving, if any. Drives per-row pending state. */
  updatingId?: string | null;
  onUpdateStatus: (id: string, status: LessonInquiryStatus) => void;
  /** Opens the enrol flow, which needs a student and so cannot be one click. */
  onEnroll?: (inquiry: LessonInquiry) => void;
  /**
   * Opens the create-student flow seeded from this inquiry (#817).
   *
   * Distinct from `onEnroll`, which links to a student that already exists.
   * This is the path for the far more common case: the family said yes and
   * there is no record yet. Omit to hide the action.
   */
  onCreateStudent?: (inquiry: LessonInquiry) => void;
}

type FilterTab = 'open' | 'all' | LessonInquiryStatus;

const STATUS_LABELS: Record<LessonInquiryStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  'interview-booked': 'Interview booked',
  enrolled: 'Enrolled',
  lost: 'Lost',
};

const STATUS_COLORS: Record<
  LessonInquiryStatus,
  'default' | 'info' | 'warning' | 'success'
> = {
  new: 'info',
  contacted: 'warning',
  'interview-booked': 'warning',
  enrolled: 'success',
  lost: 'default',
};

/**
 * The single most likely next action for a lead in this state, so the common
 * case is one labelled click. `enrolled` is deliberately absent: it needs the
 * Student the inquiry became, so it lives in the overflow behind a dialog.
 */
const PRIMARY_ACTION: Partial<
  Record<LessonInquiryStatus, { label: string; next: LessonInquiryStatus }>
> = {
  new: { label: 'Mark contacted', next: 'contacted' },
  contacted: { label: 'Interview booked', next: 'interview-booked' },
};

function formatSubmitted(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function InquiryRow({
  inquiry,
  updating,
  onUpdateStatus,
  onEnroll,
  onCreateStudent,
}: {
  inquiry: LessonInquiry;
  updating: boolean;
  onUpdateStatus: (id: string, status: LessonInquiryStatus) => void;
  onEnroll?: (inquiry: LessonInquiry) => void;
  onCreateStudent?: (inquiry: LessonInquiry) => void;
}) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const close = () => setAnchorEl(null);
  const primary = PRIMARY_ACTION[inquiry.status];
  const waiting = daysWaiting(inquiry);
  const stale = isLessonInquiryStale(inquiry);

  const otherStatuses = (
    Object.keys(STATUS_LABELS) as LessonInquiryStatus[]
  ).filter((s) => s !== inquiry.status && s !== 'enrolled');

  return (
    <Box sx={{ py: 2 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Box sx={{ minWidth: 0, flex: '1 1 320px' }}>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ flexWrap: 'wrap', gap: 1 }}
          >
            <Typography variant="h6" component="span">
              {inquiry.contactName}
            </Typography>
            <Chip
              size="small"
              label={STATUS_LABELS[inquiry.status]}
              color={STATUS_COLORS[inquiry.status]}
              variant={inquiry.status === 'new' ? 'filled' : 'outlined'}
            />
            {inquiry.hopeScholarship === 'yes' && (
              <Chip
                size="small"
                icon={<StarsIcon />}
                label="Hope Scholarship"
                color="info"
                variant="outlined"
              />
            )}
            {inquiry.hopeScholarship === 'unsure' && (
              <Chip size="small" label="Asking about Hope" variant="outlined" />
            )}
          </Stack>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            <Link href={`mailto:${inquiry.email}`}>{inquiry.email}</Link>
            {inquiry.phone && (
              <>
                {' · '}
                <Link href={`tel:${inquiry.phone}`}>{inquiry.phone}</Link>
              </>
            )}
          </Typography>

          {(inquiry.studentFirstName || inquiry.interest) && (
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              {inquiry.studentFirstName}
              {inquiry.studentAge !== undefined &&
                `, age ${inquiry.studentAge}`}
              {inquiry.studentFirstName && inquiry.interest && ' · '}
              {inquiry.interest}
            </Typography>
          )}

          {inquiry.availability.length > 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Available: {inquiry.availability.join(', ')}
            </Typography>
          )}

          {inquiry.message && (
            <Typography
              variant="body2"
              sx={{ mt: 0.5, fontStyle: 'italic' }}
              color="text.secondary"
            >
              &ldquo;{inquiry.message}&rdquo;
            </Typography>
          )}

          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            {inquiry.formName} · {formatSubmitted(inquiry.submittedAt)}
            {waiting > 0 && ` · waiting ${waiting} day${waiting === 1 ? '' : 's'}`}
            {inquiry.attribution.utmSource &&
              ` · via ${inquiry.attribution.utmSource}`}
          </Typography>

          {stale && (
            <Alert severity="warning" sx={{ mt: 1, py: 0 }}>
              No one has answered this yet.
            </Alert>
          )}
        </Box>

        <Stack direction="row" spacing={1} alignItems="center">
          {primary && (
            <Button
              variant="contained"
              size="small"
              disabled={updating}
              startIcon={
                updating ? <CircularProgress size={16} color="inherit" /> : null
              }
              onClick={() => onUpdateStatus(inquiry.id, primary.next)}
            >
              {updating ? 'Saving' : primary.label}
            </Button>
          )}
          <IconButton
            size="small"
            aria-label={`More actions for ${inquiry.contactName}`}
            disabled={updating}
            onClick={(e) => setAnchorEl(e.currentTarget)}
          >
            <MoreVertIcon fontSize="small" />
          </IconButton>
          <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={close}>
            {onCreateStudent && (
              <MenuItem
                onClick={() => {
                  close();
                  onCreateStudent(inquiry);
                }}
              >
                Create student…
              </MenuItem>
            )}
            {onEnroll && (
              <MenuItem
                onClick={() => {
                  close();
                  onEnroll(inquiry);
                }}
              >
                Mark enrolled…
              </MenuItem>
            )}
            {otherStatuses.map((status) => (
              <MenuItem
                key={status}
                onClick={() => {
                  close();
                  onUpdateStatus(inquiry.id, status);
                }}
              >
                Move to {STATUS_LABELS[status].toLowerCase()}
              </MenuItem>
            ))}
          </Menu>
        </Stack>
      </Box>
    </Box>
  );
}

export function LessonInquiryList({
  inquiries,
  updatingId,
  onUpdateStatus,
  onEnroll,
  onCreateStudent,
}: LessonInquiryListProps) {
  const [tab, setTab] = useState<FilterTab>('open');

  const visible = useMemo(() => {
    if (tab === 'all') return inquiries;
    if (tab === 'open') {
      return inquiries.filter(
        (i) => i.status !== 'enrolled' && i.status !== 'lost'
      );
    }
    return inquiries.filter((i) => i.status === tab);
  }, [inquiries, tab]);

  const openCount = inquiries.filter(
    (i) => i.status !== 'enrolled' && i.status !== 'lost'
  ).length;

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Tabs
        value={tab}
        onChange={(_e, next: FilterTab) => setTab(next)}
        sx={{ mb: 1 }}
        variant="scrollable"
        scrollButtons="auto"
      >
        <Tab label={`Open (${openCount})`} value="open" />
        <Tab label="Enrolled" value="enrolled" />
        <Tab label="Lost" value="lost" />
        <Tab label={`All (${inquiries.length})`} value="all" />
      </Tabs>

      {visible.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
          {tab === 'open'
            ? 'Nothing waiting. Every inquiry has been dealt with.'
            : 'Nothing here yet.'}
        </Typography>
      ) : (
        <Stack divider={<Divider flexItem />}>
          {visible.map((inquiry) => (
            <InquiryRow
              key={inquiry.id}
              inquiry={inquiry}
              updating={updatingId === inquiry.id}
              onUpdateStatus={onUpdateStatus}
              onEnroll={onEnroll}
              onCreateStudent={onCreateStudent}
            />
          ))}
        </Stack>
      )}
    </Paper>
  );
}
