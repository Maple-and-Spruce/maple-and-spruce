'use client';

/**
 * What families pay for a private lesson with this teacher, by instrument and
 * length.
 *
 * One row per instrument the teacher teaches, one column per lesson length.
 * A blank cell is "not priced here", and the studio default fills it; a whole
 * instrument left off falls back the same way. Students are priced from their
 * primary teacher's row for their instrument, and a student's own rate still
 * overrides both.
 *
 * Controlled, in dollars-as-typed strings, so a half-typed "45." is not
 * rounded away under the cursor. `ratesToCents` turns it into what is stored.
 */
import {
  Box,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import type {
  Instrument,
  InstructorLessonRates,
  LessonLength,
} from '@maple/ts/domain';
import { INSTRUMENTS, LESSON_LENGTHS } from '@maple/ts/domain';
import { INSTRUMENT_LABELS, LESSON_LENGTH_LABELS } from '@maple/react/students';

/** Dollars as typed, per instrument and length. */
export type LessonRateDrafts = Partial<
  Record<Instrument, Partial<Record<LessonLength, string>>>
>;

/** Stored cents → editable dollars. */
export function ratesToDrafts(
  rates: InstructorLessonRates | undefined
): LessonRateDrafts {
  const drafts: LessonRateDrafts = {};
  for (const [instrument, byLength] of Object.entries(rates ?? {}) as Array<
    [Instrument, Partial<Record<LessonLength, number>> | undefined]
  >) {
    const row: Partial<Record<LessonLength, string>> = {};
    for (const [length, cents] of Object.entries(byLength ?? {}) as Array<
      [LessonLength, number | undefined]
    >) {
      if (typeof cents === 'number') row[length] = (cents / 100).toString();
    }
    drafts[instrument] = row;
  }
  return drafts;
}

/**
 * Editable dollars → stored cents. Blank cells and empty rows are dropped. Anything that is
 * not a number is passed through as NaN so validation rejects it rather than
 * the form silently saving a price Katie did not type.
 */
export function draftsToRates(drafts: LessonRateDrafts): InstructorLessonRates {
  const rates: InstructorLessonRates = {};
  for (const [instrument, row] of Object.entries(drafts) as Array<
    [Instrument, Partial<Record<LessonLength, string>> | undefined]
  >) {
    const byLength: Partial<Record<LessonLength, number>> = {};
    for (const [length, text] of Object.entries(row ?? {}) as Array<
      [LessonLength, string | undefined]
    >) {
      const trimmed = text?.trim();
      if (!trimmed) continue;
      byLength[length] = Math.round(parseFloat(trimmed) * 100);
    }
    // A row with nothing typed in it prices nothing, so it is not stored.
    if (Object.keys(byLength).length > 0) rates[instrument] = byLength;
  }
  return rates;
}

export interface InstructorLessonRatesEditorProps {
  value: LessonRateDrafts;
  onChange: (next: LessonRateDrafts) => void;
  error?: string | null;
}

export function InstructorLessonRatesEditor({
  value,
  onChange,
  error,
}: InstructorLessonRatesEditorProps) {
  const rows = INSTRUMENTS.filter((i) => value[i] !== undefined);
  const addable = INSTRUMENTS.filter((i) => value[i] === undefined);

  const setCell = (instrument: Instrument, length: LessonLength, text: string) =>
    onChange({ ...value, [instrument]: { ...value[instrument], [length]: text } });

  const remove = (instrument: Instrument) => {
    const next = { ...value };
    delete next[instrument];
    onChange(next);
  };

  return (
    <Box>
      <Typography variant="subtitle2">Lesson rates</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        What a family pays per private lesson with this teacher. Leave a length
        blank to use the studio default. A student&apos;s own rate overrides
        this.
      </Typography>

      <Stack spacing={1.5}>
        {rows.map((instrument) => (
          <Box key={instrument}>
            <Stack direction="row" alignItems="center" sx={{ mb: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, flexGrow: 1 }}>
                {INSTRUMENT_LABELS[instrument]}
              </Typography>
              <Tooltip title={`Remove ${INSTRUMENT_LABELS[instrument]} rates`}>
                <IconButton
                  size="small"
                  aria-label={`Remove ${INSTRUMENT_LABELS[instrument]} rates`}
                  onClick={() => remove(instrument)}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' },
                gap: 1,
              }}
            >
              {LESSON_LENGTHS.map((length) => (
                <TextField
                  key={length}
                  size="small"
                  type="number"
                  label={LESSON_LENGTH_LABELS[length]}
                  value={value[instrument]?.[length] ?? ''}
                  onChange={(e) => setCell(instrument, length, e.target.value)}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">$</InputAdornment>
                      ),
                    },
                    htmlInput: {
                      min: 0,
                      step: '0.01',
                      'aria-label': `${INSTRUMENT_LABELS[instrument]} ${LESSON_LENGTH_LABELS[length]} rate`,
                    },
                  }}
                />
              ))}
            </Box>
          </Box>
        ))}

        {rows.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No rates set. This teacher&apos;s students use the studio default.
          </Typography>
        )}

        {addable.length > 0 && (
          <TextField
            select
            size="small"
            label="Add an instrument"
            value=""
            onChange={(e) =>
              onChange({ ...value, [e.target.value as Instrument]: {} })
            }
            sx={{ maxWidth: 240 }}
          >
            {addable.map((instrument) => (
              <MenuItem key={instrument} value={instrument}>
                {INSTRUMENT_LABELS[instrument]}
              </MenuItem>
            ))}
          </TextField>
        )}

        {error && (
          <Typography variant="caption" color="error">
            {error}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

