'use client';

/**
 * Settings card for the instruments the studio teaches (#161).
 *
 * The list drives the student form's choices, the instructor rate editor and
 * the names shown everywhere. Renaming keeps an instrument's key, so students
 * on it are untouched; removing one only stops it being offered — students
 * and rates already on it keep it.
 */
import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  IconButton,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import {
  instrumentKeyFromLabel,
  instrumentListProblem,
} from '@maple/ts/domain';
import type { InstrumentOption, RequestState } from '@maple/ts/domain';

export interface InstrumentsConfigCardProps {
  instrumentsState: RequestState<InstrumentOption[]>;
  isSaving: boolean;
  onSave: (instruments: InstrumentOption[]) => Promise<unknown>;
}

export function InstrumentsConfigCard({
  instrumentsState,
  isSaving,
  onSave,
}: InstrumentsConfigCardProps) {
  const [draft, setDraft] = useState<InstrumentOption[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (instrumentsState.status === 'success') {
      setDraft(instrumentsState.data);
      setDirty(false);
    }
  }, [instrumentsState]);

  const change = (next: InstrumentOption[]) => {
    setDraft(next);
    setDirty(true);
    setSaved(false);
    setError(null);
  };

  const newKey = instrumentKeyFromLabel(newLabel);
  const canAdd = newKey.length > 0;

  const add = () => {
    if (!canAdd) return;
    change([...draft, { key: newKey, label: newLabel.trim() }]);
    setNewLabel('');
  };

  const problem = dirty ? instrumentListProblem(draft) : null;

  const save = async () => {
    setError(null);
    try {
      await onSave(draft.map((o) => ({ ...o, label: o.label.trim() })));
      setDirty(false);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    }
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" component="h2" gutterBottom>
          Instruments
        </Typography>
        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
          What the studio teaches: the choices on a student and on a teacher’s
          rates. Removing one only stops it being offered. Students and rates
          already on it keep it.
        </Typography>

        {(instrumentsState.status === 'idle' ||
          instrumentsState.status === 'loading') && (
          <Box aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} variant="text" height={48} />
            ))}
          </Box>
        )}

        {instrumentsState.status === 'error' && (
          <Alert severity="error">
            Could not load instruments: {instrumentsState.error}
          </Alert>
        )}

        {instrumentsState.status === 'success' && (
          <Stack spacing={1.5}>
            {draft.map((option, index) => (
              <Stack
                key={option.key}
                direction="row"
                spacing={1}
                sx={{ alignItems: 'center' }}
              >
                <TextField
                  size="small"
                  label="Name"
                  value={option.label}
                  onChange={(e) =>
                    change(
                      draft.map((o, i) =>
                        i === index ? { ...o, label: e.target.value } : o
                      )
                    )
                  }
                  slotProps={{ htmlInput: { 'aria-label': `Name of ${option.key}` } }}
                  sx={{ flex: 1 }}
                />
                <Tooltip title={`Stop offering ${option.label}`}>
                  <IconButton
                    aria-label={`Remove ${option.label}`}
                    onClick={() => change(draft.filter((_, i) => i !== index))}
                  >
                    <DeleteOutlineIcon />
                  </IconButton>
                </Tooltip>
              </Stack>
            ))}

            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <TextField
                size="small"
                label="Add an instrument"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    add();
                  }
                }}
                sx={{ flex: 1 }}
              />
              <Button onClick={add} disabled={!canAdd}>
                Add
              </Button>
            </Stack>

            {problem && <Alert severity="warning">{problem}</Alert>}
            {error && <Alert severity="error">{error}</Alert>}
            {saved && !dirty && <Alert severity="success">Saved.</Alert>}

            <Box>
              <Button
                variant="contained"
                onClick={save}
                disabled={!dirty || Boolean(problem) || isSaving}
              >
                {isSaving ? 'Saving…' : 'Save instruments'}
              </Button>
            </Box>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
