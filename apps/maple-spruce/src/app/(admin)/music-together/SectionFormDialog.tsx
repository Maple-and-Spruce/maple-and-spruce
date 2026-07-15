'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Box,
  Typography,
  IconButton,
  Stack,
  Divider,
  Switch,
  FormControlLabel,
  Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import {
  MT_DEFAULT_CAPACITY_FAMILIES,
  MT_PRICE_FULL_CENTS,
  MT_DEFAULT_INSTALLMENT_CENTS,
  mtSectionDerivedStatus,
  type MusicTogetherSection,
  type MusicTogetherSemester,
  type CreateMusicTogetherSectionInput,
  ROOMS,
  getRoomLabel,
} from '@maple/ts/domain';

/** Date <-> <input type="datetime-local"> string (local time). */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function fromLocalInput(value: string): Date {
  return new Date(value);
}
const dollars = (cents: number) => (cents / 100).toFixed(2);
const toCents = (dollarStr: string) => Math.round(parseFloat(dollarStr) * 100);

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateMusicTogetherSectionInput) => Promise<void>;
  section?: MusicTogetherSection;
  /** Semesters to choose from — a section is organized under one. */
  semesters?: MusicTogetherSemester[];
  isSubmitting: boolean;
}

export function SectionFormDialog({
  open,
  onClose,
  onSubmit,
  section,
  semesters = [],
  isSubmitting,
}: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [semesterId, setSemesterId] = useState('');
  // Explicit controls — the overall status is derived from these (see the Chip).
  const [visible, setVisible] = useState(false);
  const [enrollmentActive, setEnrollmentActive] = useState(false);
  const [enrollmentOpensAt, setEnrollmentOpensAt] = useState('');
  const [enrollmentClosesAt, setEnrollmentClosesAt] = useState('');
  const [capacity, setCapacity] = useState(String(MT_DEFAULT_CAPACITY_FAMILIES));
  const [priceFull, setPriceFull] = useState(dollars(MT_PRICE_FULL_CENTS));
  const [location, setLocation] = useState('');
  // Defaults to 'spruce' so MT-generated calendar events reliably carry
  // room=='spruce' and surface on the /room-schedule. Constrained to a
  // dropdown (ROOMS) — a free-text value that isn't exactly a Room string
  // resolves to null and silently drops off the room schedule.
  const [room, setRoom] = useState<string>('spruce');
  const [sessions, setSessions] = useState<string[]>([]);
  const [installments, setInstallments] = useState<
    { amount: string; dueAt: string }[]
  >([]);
  const [error, setError] = useState<string | null>(null);

  // Seed the form whenever it opens (edit) or resets (create).
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (section) {
      setName(section.name);
      setDescription(section.description ?? '');
      setSemesterId(section.semesterId ?? '');
      setVisible(section.visible);
      setEnrollmentActive(section.enrollmentActive);
      setEnrollmentOpensAt(
        section.enrollmentOpensAt
          ? toLocalInput(new Date(section.enrollmentOpensAt))
          : ''
      );
      setEnrollmentClosesAt(
        section.enrollmentClosesAt
          ? toLocalInput(new Date(section.enrollmentClosesAt))
          : ''
      );
      setCapacity(String(section.capacityFamilies));
      setPriceFull(dollars(section.priceFullCents));
      setLocation(section.location ?? '');
      setRoom(section.room ?? '');
      setSessions(section.sessions.map((s) => toLocalInput(new Date(s.dateTime))));
      setInstallments(
        (section.installmentPlan ?? []).map((i) => ({
          amount: dollars(i.amountCents),
          dueAt: toLocalInput(new Date(i.dueAt)),
        }))
      );
    } else {
      setName('');
      setDescription('');
      setSemesterId('');
      setVisible(false);
      setEnrollmentActive(false);
      setEnrollmentOpensAt('');
      setEnrollmentClosesAt('');
      setCapacity(String(MT_DEFAULT_CAPACITY_FAMILIES));
      setPriceFull(dollars(MT_PRICE_FULL_CENTS));
      setLocation('');
      setRoom('spruce');
      setSessions([]);
      setInstallments([]);
    }
  }, [open, section]);

  const handleSubmit = async () => {
    setError(null);
    try {
      const input: CreateMusicTogetherSectionInput = {
        name: name.trim(),
        description: description.trim() || undefined,
        visible,
        enrollmentActive,
        enrollmentOpensAt: enrollmentOpensAt
          ? fromLocalInput(enrollmentOpensAt)
          : undefined,
        enrollmentClosesAt: enrollmentClosesAt
          ? fromLocalInput(enrollmentClosesAt)
          : undefined,
        semesterId: semesterId || undefined,
        capacityFamilies: parseInt(capacity, 10),
        priceFullCents: toCents(priceFull),
        sessions: sessions
          .filter((s) => s)
          .map((s) => ({ dateTime: fromLocalInput(s) })),
        installmentPlan:
          installments.length > 0
            ? installments
                .filter((i) => i.amount && i.dueAt)
                .map((i) => ({
                  amountCents: toCents(i.amount),
                  dueAt: fromLocalInput(i.dueAt),
                }))
            : undefined,
        location: location.trim() || undefined,
        room: room.trim() || undefined,
      };
      await onSubmit(input);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save section');
    }
  };

  // Named list mutators keep the JSX handlers shallow (avoids deeply nested
  // inline arrows).
  const setSessionAt = (idx: number, value: string) =>
    setSessions((prev) => prev.map((v, i) => (i === idx ? value : v)));
  const removeSessionAt = (idx: number) =>
    setSessions((prev) => prev.filter((_, i) => i !== idx));
  const patchInstallmentAt = (
    idx: number,
    patch: Partial<{ amount: string; dueAt: string }>
  ) =>
    setInstallments((prev) =>
      prev.map((v, i) => (i === idx ? { ...v, ...patch } : v))
    );
  const removeInstallmentAt = (idx: number) =>
    setInstallments((prev) => prev.filter((_, i) => i !== idx));

  // Live preview of the derived status from the current control values (no
  // family count in the form, so this never shows 'full').
  const derivedStatus = mtSectionDerivedStatus(
    {
      visible,
      enrollmentActive,
      enrollmentOpensAt: enrollmentOpensAt
        ? fromLocalInput(enrollmentOpensAt)
        : undefined,
      enrollmentClosesAt: enrollmentClosesAt
        ? fromLocalInput(enrollmentClosesAt)
        : undefined,
      capacityFamilies: parseInt(capacity, 10) || 0,
      sessions: sessions
        .filter((s) => s)
        .map((s) => ({ dateTime: fromLocalInput(s) })),
    },
    new Date()
  );

  const prefillInstallments = () => {
    const firstSession = sessions[0]
      ? fromLocalInput(sessions[0])
      : new Date();
    const week5 = new Date(firstSession);
    week5.setDate(week5.getDate() + 28);
    setInstallments([
      { amount: dollars(MT_DEFAULT_INSTALLMENT_CENTS), dueAt: toLocalInput(firstSession) },
      { amount: dollars(MT_DEFAULT_INSTALLMENT_CENTS), dueAt: toLocalInput(week5) },
    ]);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{section ? 'Edit Section' : 'New Section'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            fullWidth
            inputProps={{ 'aria-label': 'Section name' }}
          />
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
          />
          <TextField
            label="Semester"
            select
            value={semesterId}
            onChange={(e) => setSemesterId(e.target.value)}
            fullWidth
            helperText="Which term this section belongs to"
            inputProps={{ 'aria-label': 'Semester' }}
          >
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {semesters.map((sem) => (
              <MenuItem key={sem.id} value={sem.id}>
                {sem.name}
              </MenuItem>
            ))}
          </TextField>
          <Divider />
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Typography variant="subtitle2">Visibility &amp; enrollment</Typography>
            <Chip
              size="small"
              label={derivedStatus}
              color={derivedStatus === 'open' ? 'success' : 'default'}
            />
          </Box>
          <FormControlLabel
            control={
              <Switch
                checked={visible}
                onChange={(e) => setVisible(e.target.checked)}
                inputProps={{ 'aria-label': 'Show on calendar and site' }}
              />
            }
            label="Show on calendar &amp; site (registration can still be closed)"
          />
          <FormControlLabel
            control={
              <Switch
                checked={enrollmentActive}
                onChange={(e) => setEnrollmentActive(e.target.checked)}
                inputProps={{ 'aria-label': 'Enrollment active' }}
              />
            }
            label="Enrollment active (accept registrations now)"
          />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Enrollment opens (optional)"
              type="datetime-local"
              value={enrollmentOpensAt}
              onChange={(e) => setEnrollmentOpensAt(e.target.value)}
              InputLabelProps={{ shrink: true }}
              helperText="Auto-opens at this time when active"
              sx={{ flex: 1 }}
            />
            <TextField
              label="Enrollment closes (optional)"
              type="datetime-local"
              value={enrollmentClosesAt}
              onChange={(e) => setEnrollmentClosesAt(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1 }}
            />
          </Box>
          <Divider />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Capacity (families)"
              type="number"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Full price ($)"
              value={priceFull}
              onChange={(e) => setPriceFull(e.target.value)}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Room"
              select
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              sx={{ flex: 1 }}
            >
              <MenuItem value="">None</MenuItem>
              {ROOMS.map((r) => (
                <MenuItem key={r} value={r}>
                  {getRoomLabel(r)}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          <Divider />
          <Box
            sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Typography variant="subtitle2">Sessions</Typography>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setSessions((s) => [...s, ''])}
            >
              Add session
            </Button>
          </Box>
          {sessions.map((value, idx) => (
            <Box key={idx} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField
                type="datetime-local"
                value={value}
                onChange={(e) => setSessionAt(idx, e.target.value)}
                fullWidth
                inputProps={{ 'aria-label': `Session ${idx + 1}` }}
              />
              <IconButton
                aria-label={`Remove session ${idx + 1}`}
                onClick={() => removeSessionAt(idx)}
              >
                <DeleteOutlineIcon />
              </IconButton>
            </Box>
          ))}

          <Divider />
          <Box
            sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Typography variant="subtitle2">
              Installment plan (optional)
            </Typography>
            <Box>
              <Button size="small" onClick={prefillInstallments}>
                Prefill 2×
              </Button>
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={() =>
                  setInstallments((s) => [...s, { amount: '', dueAt: '' }])
                }
              >
                Add
              </Button>
            </Box>
          </Box>
          {installments.map((inst, idx) => (
            <Box key={idx} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField
                label="Amount ($)"
                value={inst.amount}
                onChange={(e) => patchInstallmentAt(idx, { amount: e.target.value })}
                sx={{ width: 130 }}
              />
              <TextField
                type="datetime-local"
                value={inst.dueAt}
                onChange={(e) => patchInstallmentAt(idx, { dueAt: e.target.value })}
                fullWidth
                inputProps={{ 'aria-label': `Installment ${idx + 1} due date` }}
              />
              <IconButton
                aria-label={`Remove installment ${idx + 1}`}
                onClick={() => removeInstallmentAt(idx)}
              >
                <DeleteOutlineIcon />
              </IconButton>
            </Box>
          ))}

          {error && <Typography color="error">{error}</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={isSubmitting || !name.trim()}
        >
          {isSubmitting ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
