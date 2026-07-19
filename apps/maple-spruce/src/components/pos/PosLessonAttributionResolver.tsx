'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  TextField,
  Typography,
} from '@mui/material';
import type { PosLessonAttribution, Student } from '@maple/ts/domain';
import { formatCents } from '@maple/react/lessons';
import { StudentPicker } from '@maple/react/students';
import type { PosLessonResolution } from '@maple/ts/firebase/api-types';

interface PosLessonAttributionResolverProps {
  attribution: PosLessonAttribution | null;
  students: Student[];
  open: boolean;
  onClose: () => void;
  onResolve: (
    action: PosLessonResolution,
    opts?: { studentId?: string; notes?: string }
  ) => Promise<void>;
  isResolving?: boolean;
}

function formatDate(value: Date | string | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
}

/**
 * Resolve one pending POS lesson sale: attribute it to a student (settles a
 * matching open invoice or creates a paid one), or dismiss it.
 */
export function PosLessonAttributionResolver({
  attribution,
  students,
  open,
  onClose,
  onResolve,
  isResolving = false,
}: PosLessonAttributionResolverProps) {
  const [studentId, setStudentId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    setStudentId(null);
    setNotes('');
    setShowError(false);
  }, [attribution?.id, open]);

  if (!attribution) return null;

  const handleAttribute = async () => {
    if (!studentId) {
      setShowError(true);
      return;
    }
    await onResolve('attribute', { studentId });
  };

  const handleDismiss = async () => {
    await onResolve('dismiss', { notes: notes.trim() || undefined });
  };

  const payer =
    attribution.customerName ||
    attribution.customerEmail ||
    'No customer on the sale';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Attribute POS lesson sale</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <Box>
            <Typography variant="h6" component="span">
              {formatCents(attribution.amountPaidCents)}
            </Typography>{' '}
            <Typography variant="body1" component="span" color="text.secondary">
              {attribution.itemName} · {formatDate(attribution.occurredAt)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Paid by: {payer}
            </Typography>
          </Box>

          <Divider />

          <Typography variant="overline" color="text.secondary">
            Attribute to a student
          </Typography>
          <StudentPicker
            students={students}
            value={studentId}
            onChange={(id) => {
              setStudentId(id);
              if (id) setShowError(false);
            }}
            disabled={isResolving}
            error={showError}
            helperText={
              showError
                ? 'Pick a student to attribute this sale to.'
                : 'Settles their matching open invoice, or creates a paid one.'
            }
          />

          <Alert severity="info" variant="outlined">
            No student? Dismiss this sale (e.g. it was refunded or isn’t a
            lesson) using the notes below.
          </Alert>
          <TextField
            label="Dismissal notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isResolving}
            multiline
            rows={2}
            fullWidth
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isResolving}>
          Cancel
        </Button>
        <Button color="warning" onClick={handleDismiss} disabled={isResolving}>
          Dismiss
        </Button>
        <Button
          variant="contained"
          onClick={handleAttribute}
          disabled={isResolving}
        >
          {isResolving ? 'Saving…' : 'Attribute'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
