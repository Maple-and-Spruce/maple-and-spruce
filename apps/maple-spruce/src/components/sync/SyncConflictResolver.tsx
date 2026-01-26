'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Paper,
  Divider,
  Alert,
  CircularProgress,
} from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BuildIcon from '@mui/icons-material/Build';
import BlockIcon from '@mui/icons-material/Block';
import type { SyncConflict, SyncResolution } from '@maple/ts/domain';
import { formatPrice } from '@maple/ts/domain';

interface SyncConflictResolverProps {
  /** The conflict to resolve */
  conflict: SyncConflict | null;
  /** Whether the dialog is open */
  open: boolean;
  /** Called when the dialog is closed */
  onClose: () => void;
  /** Called when resolution is submitted */
  onResolve: (resolution: SyncResolution, notes?: string) => void;
  /** Whether a resolution is in progress */
  isResolving?: boolean;
}

const resolutionOptions: Array<{
  value: SyncResolution;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    value: 'use_local',
    label: 'Use Local',
    description: 'Push our data to Square',
    icon: <ArrowForwardIcon />,
  },
  {
    value: 'use_external',
    label: 'Use Square',
    description: 'Pull Square data to us',
    icon: <ArrowBackIcon />,
  },
  {
    value: 'manual',
    label: 'Manual',
    description: 'I fixed it manually',
    icon: <BuildIcon />,
  },
  {
    value: 'ignored',
    label: 'Ignore',
    description: 'Keep the mismatch',
    icon: <BlockIcon />,
  },
];

function StateDisplay({
  title,
  state,
  highlight,
}: {
  title: string;
  state: { quantity: number; price: number; name: string };
  highlight?: 'local' | 'external';
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        flex: 1,
        border: 1,
        borderColor: highlight ? 'primary.main' : 'divider',
        borderRadius: 1,
        backgroundColor: highlight ? 'primary.50' : 'background.paper',
      }}
    >
      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        {title}
      </Typography>
      <Typography variant="body1" fontWeight="medium">
        {state.name}
      </Typography>
      <Box sx={{ mt: 1, display: 'flex', gap: 2 }}>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Quantity
          </Typography>
          <Typography variant="body1" fontWeight="medium">
            {state.quantity}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Price
          </Typography>
          <Typography variant="body1" fontWeight="medium">
            {formatPrice(state.price)}
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
}

export function SyncConflictResolver({
  conflict,
  open,
  onClose,
  onResolve,
  isResolving = false,
}: SyncConflictResolverProps) {
  const [selectedResolution, setSelectedResolution] = useState<SyncResolution | null>(
    null
  );
  const [notes, setNotes] = useState('');
  const [notesError, setNotesError] = useState<string | null>(null);

  const handleResolutionChange = (
    _event: React.MouseEvent<HTMLElement>,
    newResolution: SyncResolution | null
  ) => {
    setSelectedResolution(newResolution);
    setNotesError(null);
  };

  const handleConfirm = () => {
    if (!selectedResolution) return;

    // Manual resolution requires notes
    if (selectedResolution === 'manual' && !notes.trim()) {
      setNotesError('Please describe what you did to resolve this conflict');
      return;
    }

    onResolve(selectedResolution, notes.trim() || undefined);
  };

  const handleClose = () => {
    setSelectedResolution(null);
    setNotes('');
    setNotesError(null);
    onClose();
  };

  if (!conflict) return null;

  const typeLabels: Record<string, string> = {
    quantity_mismatch: 'Quantity Mismatch',
    price_mismatch: 'Price Mismatch',
    missing_local: 'Missing Locally',
    missing_external: 'Missing in Square',
    unexpected_sale: 'Unexpected Sale',
  };

  // Determine which options are available based on conflict type
  const availableResolutions = resolutionOptions.filter((option) => {
    if (conflict.type === 'missing_local') {
      // Can't use local if there's no local record
      return option.value !== 'use_local';
    }
    if (conflict.type === 'missing_external') {
      // Can't use external if there's no external record
      return option.value !== 'use_external';
    }
    return true;
  });

  // Highlight which side is selected
  const highlightLocal = selectedResolution === 'use_local';
  const highlightExternal = selectedResolution === 'use_external';

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Resolve {typeLabels[conflict.type] || conflict.type}
      </DialogTitle>
      <DialogContent>
        {/* State comparison */}
        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
          <StateDisplay
            title="Local (Firestore)"
            state={conflict.localState}
            highlight={highlightLocal ? 'local' : undefined}
          />
          <StateDisplay
            title={`External (${conflict.externalState.system})`}
            state={conflict.externalState}
            highlight={highlightExternal ? 'external' : undefined}
          />
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Resolution options */}
        <Typography variant="subtitle2" gutterBottom>
          Choose resolution
        </Typography>
        <ToggleButtonGroup
          value={selectedResolution}
          exclusive
          onChange={handleResolutionChange}
          aria-label="resolution type"
          sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}
        >
          {availableResolutions.map((option) => (
            <ToggleButton
              key={option.value}
              value={option.value}
              aria-label={option.label}
              sx={{
                flex: '1 1 calc(50% - 4px)',
                minWidth: 120,
                flexDirection: 'column',
                py: 1.5,
                px: 2,
                textTransform: 'none',
              }}
            >
              {option.icon}
              <Typography variant="body2" fontWeight="medium">
                {option.label}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {option.description}
              </Typography>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {/* Notes field */}
        <TextField
          label="Notes"
          placeholder={
            selectedResolution === 'manual'
              ? 'Describe what you did to resolve this (required)'
              : 'Optional notes about this resolution'
          }
          multiline
          rows={2}
          fullWidth
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            if (notesError) setNotesError(null);
          }}
          error={!!notesError}
          helperText={notesError}
          required={selectedResolution === 'manual'}
        />

        {/* Warning for destructive actions */}
        {selectedResolution === 'use_local' && conflict.type === 'missing_external' && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            This product was deleted from Square. You&apos;ll need to recreate it
            manually in Square to sync.
          </Alert>
        )}

        {selectedResolution === 'use_external' && conflict.type === 'missing_local' && (
          <Alert severity="info" sx={{ mt: 2 }}>
            This will not automatically create a product in Firestore. You may need
            to import it manually.
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isResolving}>
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          disabled={!selectedResolution || isResolving}
          startIcon={isResolving ? <CircularProgress size={16} /> : null}
        >
          {isResolving ? 'Resolving...' : 'Confirm'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
