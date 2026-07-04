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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import {
  MT_DEFAULT_CAPACITY_FAMILIES,
  MT_PRICE_FULL_CENTS,
  MT_DEFAULT_INSTALLMENT_CENTS,
  type MusicTogetherSection,
  type CreateMusicTogetherSectionInput,
  type MusicTogetherSectionStatus,
} from '@maple/ts/domain';

const STATUSES: MusicTogetherSectionStatus[] = [
  'draft',
  'open',
  'closed',
  'completed',
];

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
  isSubmitting: boolean;
}

export function SectionFormDialog({
  open,
  onClose,
  onSubmit,
  section,
  isSubmitting,
}: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<MusicTogetherSectionStatus>('draft');
  const [capacity, setCapacity] = useState(String(MT_DEFAULT_CAPACITY_FAMILIES));
  const [priceFull, setPriceFull] = useState(dollars(MT_PRICE_FULL_CENTS));
  const [location, setLocation] = useState('');
  const [room, setRoom] = useState('');
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
      setStatus(section.status);
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
      setStatus('draft');
      setCapacity(String(MT_DEFAULT_CAPACITY_FAMILIES));
      setPriceFull(dollars(MT_PRICE_FULL_CENTS));
      setLocation('');
      setRoom('');
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
        status,
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
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Status"
              select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as MusicTogetherSectionStatus)
              }
              sx={{ flex: 1 }}
            >
              {STATUSES.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Capacity (families)"
              type="number"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              sx={{ flex: 1 }}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
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
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              sx={{ flex: 1 }}
            />
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
                onChange={(e) =>
                  setSessions((s) =>
                    s.map((v, i) => (i === idx ? e.target.value : v))
                  )
                }
                fullWidth
                inputProps={{ 'aria-label': `Session ${idx + 1}` }}
              />
              <IconButton
                aria-label={`Remove session ${idx + 1}`}
                onClick={() =>
                  setSessions((s) => s.filter((_, i) => i !== idx))
                }
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
                onChange={(e) =>
                  setInstallments((s) =>
                    s.map((v, i) =>
                      i === idx ? { ...v, amount: e.target.value } : v
                    )
                  )
                }
                sx={{ width: 130 }}
              />
              <TextField
                type="datetime-local"
                value={inst.dueAt}
                onChange={(e) =>
                  setInstallments((s) =>
                    s.map((v, i) =>
                      i === idx ? { ...v, dueAt: e.target.value } : v
                    )
                  )
                }
                fullWidth
                inputProps={{ 'aria-label': `Installment ${idx + 1} due date` }}
              />
              <IconButton
                aria-label={`Remove installment ${idx + 1}`}
                onClick={() =>
                  setInstallments((s) => s.filter((_, i) => i !== idx))
                }
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
