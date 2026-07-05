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
  MT_SEASONS,
  MT_SEASON_DEFAULT_WEEKS,
  getMusicTogetherSeasonLabel,
  type MusicTogetherSemester,
  type MusicTogetherSeason,
  type CreateMusicTogetherSemesterInput,
  type MusicTogetherSemesterStatus,
} from '@maple/ts/domain';

const STATUSES: MusicTogetherSemesterStatus[] = [
  'planned',
  'enrolling',
  'active',
  'completed',
];

/** Date <-> <input type="date"> string (local, day granularity). */
function toDateInput(date?: Date): string {
  if (!date) return '';
  const d = new Date(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fromDateInput(value: string): Date {
  // Anchor to local midnight so the day doesn't slip across time zones.
  return new Date(`${value}T00:00:00`);
}

interface BreakRow {
  label: string;
  startDate: string;
  endDate: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateMusicTogetherSemesterInput) => Promise<void>;
  semester?: MusicTogetherSemester;
  isSubmitting: boolean;
}

export function SemesterFormDialog({
  open,
  onClose,
  onSubmit,
  semester,
  isSubmitting,
}: Props) {
  const [name, setName] = useState('');
  const [season, setSeason] = useState<MusicTogetherSeason>('fall');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [status, setStatus] = useState<MusicTogetherSemesterStatus>('planned');
  const [weeks, setWeeks] = useState(String(MT_SEASON_DEFAULT_WEEKS.fall));
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [enrollmentOpensAt, setEnrollmentOpensAt] = useState('');
  const [notes, setNotes] = useState('');
  const [breaks, setBreaks] = useState<BreakRow[]>([]);
  const [weatherDates, setWeatherDates] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Seed the form whenever it opens (edit) or resets (create).
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (semester) {
      setName(semester.name);
      setSeason(semester.season);
      setYear(String(semester.year));
      setStatus(semester.status);
      setWeeks(semester.weeks != null ? String(semester.weeks) : '');
      setStartDate(toDateInput(semester.startDate));
      setEndDate(toDateInput(semester.endDate));
      setEnrollmentOpensAt(toDateInput(semester.enrollmentOpensAt));
      setNotes(semester.notes ?? '');
      setBreaks(
        (semester.breaks ?? []).map((b) => ({
          label: b.label,
          startDate: toDateInput(b.startDate),
          endDate: toDateInput(b.endDate),
        }))
      );
      setWeatherDates((semester.weatherMakeupDates ?? []).map(toDateInput));
    } else {
      setName('');
      setSeason('fall');
      setYear(String(new Date().getFullYear()));
      setStatus('planned');
      setWeeks(String(MT_SEASON_DEFAULT_WEEKS.fall));
      setStartDate('');
      setEndDate('');
      setEnrollmentOpensAt('');
      setNotes('');
      setBreaks([]);
      setWeatherDates([]);
    }
  }, [open, semester]);

  // Prefill the week count from the season's default (Summer = 6).
  const handleSeasonChange = (next: MusicTogetherSeason) => {
    setSeason(next);
    setWeeks(String(MT_SEASON_DEFAULT_WEEKS[next]));
  };

  const setBreakAt = (idx: number, patch: Partial<BreakRow>) =>
    setBreaks((prev) => prev.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  const removeBreakAt = (idx: number) =>
    setBreaks((prev) => prev.filter((_, i) => i !== idx));
  const setWeatherAt = (idx: number, value: string) =>
    setWeatherDates((prev) => prev.map((v, i) => (i === idx ? value : v)));
  const removeWeatherAt = (idx: number) =>
    setWeatherDates((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    setError(null);
    try {
      const cleanBreaks = breaks
        .filter((b) => b.label.trim() && b.startDate && b.endDate)
        .map((b) => ({
          label: b.label.trim(),
          startDate: fromDateInput(b.startDate),
          endDate: fromDateInput(b.endDate),
        }));
      const cleanWeather = weatherDates.filter((d) => d).map(fromDateInput);
      const input: CreateMusicTogetherSemesterInput = {
        name: name.trim(),
        season,
        year: parseInt(year, 10),
        status,
        weeks: weeks ? parseInt(weeks, 10) : undefined,
        startDate: startDate ? fromDateInput(startDate) : undefined,
        endDate: endDate ? fromDateInput(endDate) : undefined,
        enrollmentOpensAt: enrollmentOpensAt
          ? fromDateInput(enrollmentOpensAt)
          : undefined,
        notes: notes.trim() || undefined,
        breaks: cleanBreaks.length > 0 ? cleanBreaks : undefined,
        weatherMakeupDates: cleanWeather.length > 0 ? cleanWeather : undefined,
      };
      await onSubmit(input);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save semester');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{semester ? 'Edit Semester' : 'New Semester'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            fullWidth
            placeholder="Fall 2026"
            inputProps={{ 'aria-label': 'Semester name' }}
          />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Season"
              select
              value={season}
              onChange={(e) =>
                handleSeasonChange(e.target.value as MusicTogetherSeason)
              }
              sx={{ flex: 1 }}
            >
              {MT_SEASONS.map((s) => (
                <MenuItem key={s} value={s}>
                  {getMusicTogetherSeasonLabel(s)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Year"
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              sx={{ flex: 1 }}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Status"
              select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as MusicTogetherSemesterStatus)
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
              label="Weeks"
              type="number"
              value={weeks}
              onChange={(e) => setWeeks(e.target.value)}
              sx={{ flex: 1 }}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Start date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1 }}
              inputProps={{ 'aria-label': 'Start date' }}
            />
            <TextField
              label="End date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1 }}
              inputProps={{ 'aria-label': 'End date' }}
            />
          </Box>
          <TextField
            label="Re-enrollment opens"
            type="date"
            value={enrollmentOpensAt}
            onChange={(e) => setEnrollmentOpensAt(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
            inputProps={{ 'aria-label': 'Re-enrollment opens' }}
          />
          <TextField
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            fullWidth
            multiline
            placeholder="e.g. exact dates confirmed by spring 2027"
          />

          <Divider />
          <Box
            sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Typography variant="subtitle2">Breaks</Typography>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() =>
                setBreaks((b) => [...b, { label: '', startDate: '', endDate: '' }])
              }
            >
              Add break
            </Button>
          </Box>
          {breaks.map((b, idx) => (
            <Box key={idx} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField
                label="Label"
                value={b.label}
                onChange={(e) => setBreakAt(idx, { label: e.target.value })}
                sx={{ flex: 1 }}
                inputProps={{ 'aria-label': `Break ${idx + 1} label` }}
              />
              <TextField
                type="date"
                value={b.startDate}
                onChange={(e) => setBreakAt(idx, { startDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
                inputProps={{ 'aria-label': `Break ${idx + 1} start` }}
              />
              <TextField
                type="date"
                value={b.endDate}
                onChange={(e) => setBreakAt(idx, { endDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
                inputProps={{ 'aria-label': `Break ${idx + 1} end` }}
              />
              <IconButton
                aria-label={`Remove break ${idx + 1}`}
                onClick={() => removeBreakAt(idx)}
              >
                <DeleteOutlineIcon />
              </IconButton>
            </Box>
          ))}

          <Divider />
          <Box
            sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Typography variant="subtitle2">Weather makeup dates</Typography>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setWeatherDates((d) => [...d, ''])}
            >
              Add date
            </Button>
          </Box>
          {weatherDates.map((value, idx) => (
            <Box key={idx} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField
                type="date"
                value={value}
                onChange={(e) => setWeatherAt(idx, e.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
                inputProps={{ 'aria-label': `Weather makeup date ${idx + 1}` }}
              />
              <IconButton
                aria-label={`Remove weather makeup date ${idx + 1}`}
                onClick={() => removeWeatherAt(idx)}
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
