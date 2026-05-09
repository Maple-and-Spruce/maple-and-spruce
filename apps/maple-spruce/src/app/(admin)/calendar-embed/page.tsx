'use client';

import { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Switch,
  IconButton,
  Chip,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  Skeleton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import LockIcon from '@mui/icons-material/Lock';
import SaveIcon from '@mui/icons-material/Save';
import type {
  CalendarEmbedSource,
  CreateCalendarEmbedSourceInput,
  UpdateCalendarEmbedSettingsInput,
} from '@maple/ts/domain';
import { DeleteConfirmDialog } from '@maple/react/ui';
import { useCalendarEmbedConfig } from '@maple/react/data';

function AddSourceDialog({
  open,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: CreateCalendarEmbedSourceInput) => Promise<void>;
  isSubmitting: boolean;
}) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [color, setColor] = useState('5C8A97');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!label.trim() || !url.trim()) {
      setError('Label and URL are required');
      return;
    }
    setError(null);
    try {
      await onSubmit({ label: label.trim(), url: url.trim(), color, enabled: true });
      setLabel('');
      setUrl('');
      setColor('5C8A97');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add source');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Calendar Source</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Katie's Ad-Hoc Events"
            required
            fullWidth
            autoFocus
          />
          <TextField
            label="ICS Feed URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
            required
            fullWidth
          />
          <TextField
            label="Color (hex without #)"
            value={color}
            onChange={(e) => setColor(e.target.value.replace('#', ''))}
            placeholder="5C8A97"
            fullWidth
            InputProps={{
              startAdornment: (
                <Box
                  sx={{
                    width: 20,
                    height: 20,
                    borderRadius: '4px',
                    backgroundColor: `#${color}`,
                    mr: 1,
                    flexShrink: 0,
                  }}
                />
              ),
            }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Adding...' : 'Add Source'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function CalendarEmbedPage() {
  const { configState, updateSettings, addSource, removeSource } =
    useCalendarEmbedConfig();

  // Add source dialog
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAddSubmitting, setIsAddSubmitting] = useState(false);

  // Delete source dialog
  const [sourceToDelete, setSourceToDelete] =
    useState<CalendarEmbedSource | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Settings form
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  const handleAddSource = useCallback(
    async (input: CreateCalendarEmbedSourceInput) => {
      setIsAddSubmitting(true);
      try {
        await addSource(input);
      } finally {
        setIsAddSubmitting(false);
      }
    },
    [addSource]
  );

  const handleToggleSource = useCallback(
    async (source: CalendarEmbedSource) => {
      // Use updateSettings to toggle - we update the full config
      // Actually we need updateSource - but we only have updateSettings and addSource/removeSource
      // For now, updateSettings doesn't handle individual source updates
      // We'll need to re-save the full sources array via updateSettings
      if (configState.status !== 'success') return;
      const updatedSources = configState.data.sources.map((s) =>
        s.id === source.id ? { ...s, enabled: !s.enabled } : s
      );
      await updateSettings({ sources: updatedSources } as UpdateCalendarEmbedSettingsInput);
    },
    [configState, updateSettings]
  );

  const handleDeleteSource = useCallback(async () => {
    if (!sourceToDelete) return;
    setIsDeleting(true);
    try {
      await removeSource(sourceToDelete.id);
      setSourceToDelete(null);
    } catch (error) {
      console.error('Failed to remove source:', error);
    } finally {
      setIsDeleting(false);
    }
  }, [sourceToDelete, removeSource]);

  const handleSaveSettings = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (configState.status !== 'success') return;
      setIsSavingSettings(true);
      setSettingsSuccess(false);

      const form = e.currentTarget;
      const formData = new FormData(form);

      const input: UpdateCalendarEmbedSettingsInput = {
        owcBaseUrl: formData.get('owcBaseUrl') as string,
        title: formData.get('title') as string,
        defaultTab: formData.get('defaultTab') as string,
        skin: formData.get('skin') as string,
        startOfWeek: formData.get('startOfWeek') as string,
        timezone: formData.get('timezone') as string,
        cssUrl: formData.get('cssUrl') as string,
      };

      try {
        await updateSettings(input);
        setSettingsSuccess(true);
        setTimeout(() => setSettingsSuccess(false), 3000);
      } catch (error) {
        console.error('Failed to save settings:', error);
      } finally {
        setIsSavingSettings(false);
      }
    },
    [configState, updateSettings]
  );

  if (configState.status === 'loading' || configState.status === 'idle') {
    return (
      <>
        <Typography variant="h4" component="h1" sx={{ mb: 3 }}>
          Calendar Embed
        </Typography>
        <Skeleton variant="rounded" height={200} />
      </>
    );
  }

  if (configState.status === 'error') {
    return (
      <>
        <Typography variant="h4" component="h1" sx={{ mb: 3 }}>
          Calendar Embed
        </Typography>
        <Alert severity="error">{configState.error}</Alert>
      </>
    );
  }

  const config = configState.data;

  return (
    <>
      <Typography variant="h4" component="h1" sx={{ mb: 3 }}>
        Calendar Embed
      </Typography>

      {/* Calendar Sources */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
        }}
      >
        <Typography variant="h6">Calendar Sources</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setIsAddOpen(true)}
          size="small"
        >
          Add Source
        </Button>
      </Box>

      <TableContainer component={Card} sx={{ mb: 4 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Color</TableCell>
              <TableCell>Label</TableCell>
              <TableCell>URL</TableCell>
              <TableCell>Type</TableCell>
              <TableCell align="center">Enabled</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {config.sources.map((source) => (
              <TableRow key={source.id}>
                <TableCell>
                  <Box
                    sx={{
                      width: 20,
                      height: 20,
                      borderRadius: '4px',
                      backgroundColor: `#${source.color}`,
                    }}
                  />
                </TableCell>
                <TableCell>{source.label}</TableCell>
                <TableCell>
                  <Typography
                    variant="body2"
                    sx={{
                      maxWidth: 300,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                    }}
                  >
                    {source.url}
                  </Typography>
                </TableCell>
                <TableCell>
                  {source.isSystem ? (
                    <Chip label="System" size="small" variant="outlined" />
                  ) : (
                    <Chip label="Custom" size="small" color="info" />
                  )}
                </TableCell>
                <TableCell align="center">
                  <Switch
                    checked={source.enabled}
                    onChange={() => handleToggleSource(source)}
                    size="small"
                  />
                </TableCell>
                <TableCell align="right">
                  {source.isSystem ? (
                    <IconButton size="small" disabled>
                      <LockIcon fontSize="small" />
                    </IconButton>
                  ) : (
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => setSourceToDelete(source)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Display Settings */}
      <Typography variant="h6" sx={{ mb: 2 }}>
        Display Settings
      </Typography>

      <Card>
        <CardContent>
          <form onSubmit={handleSaveSettings}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 2,
              }}
            >
              <TextField
                name="owcBaseUrl"
                label="Open Web Calendar URL"
                defaultValue={config.owcBaseUrl}
                fullWidth
                size="small"
              />
              <TextField
                name="title"
                label="Calendar Title"
                defaultValue={config.title}
                fullWidth
                size="small"
              />
              <FormControl size="small" fullWidth>
                <InputLabel>Default View</InputLabel>
                <Select
                  name="defaultTab"
                  label="Default View"
                  defaultValue={config.defaultTab}
                >
                  <MenuItem value="month">Month</MenuItem>
                  <MenuItem value="week">Week</MenuItem>
                  <MenuItem value="day">Day</MenuItem>
                  <MenuItem value="agenda">Agenda</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel>Skin</InputLabel>
                <Select
                  name="skin"
                  label="Skin"
                  defaultValue={config.skin}
                >
                  <MenuItem value="material">Material</MenuItem>
                  <MenuItem value="flat">Flat</MenuItem>
                  <MenuItem value="terrace">Terrace</MenuItem>
                  <MenuItem value="contrast-black">Contrast Black</MenuItem>
                  <MenuItem value="contrast-white">Contrast White</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel>Start of Week</InputLabel>
                <Select
                  name="startOfWeek"
                  label="Start of Week"
                  defaultValue={config.startOfWeek}
                >
                  <MenuItem value="su">Sunday</MenuItem>
                  <MenuItem value="mo">Monday</MenuItem>
                </Select>
              </FormControl>
              <TextField
                name="timezone"
                label="Timezone"
                defaultValue={config.timezone}
                fullWidth
                size="small"
              />
              <TextField
                name="cssUrl"
                label="Custom CSS URL (optional)"
                defaultValue={config.cssUrl}
                fullWidth
                size="small"
                sx={{ gridColumn: { sm: '1 / -1' } }}
              />
            </Box>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                mt: 2,
              }}
            >
              <Button
                type="submit"
                variant="contained"
                startIcon={
                  isSavingSettings ? (
                    <CircularProgress size={16} />
                  ) : (
                    <SaveIcon />
                  )
                }
                disabled={isSavingSettings}
              >
                {isSavingSettings ? 'Saving...' : 'Save Settings'}
              </Button>
              {settingsSuccess && (
                <Alert severity="success" sx={{ py: 0 }}>
                  Settings saved
                </Alert>
              )}
            </Box>
          </form>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <AddSourceDialog
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSubmit={handleAddSource}
        isSubmitting={isAddSubmitting}
      />

      <DeleteConfirmDialog
        open={!!sourceToDelete}
        onClose={() => setSourceToDelete(null)}
        onConfirm={handleDeleteSource}
        isDeleting={isDeleting}
        title="Remove Calendar Source?"
        itemName={sourceToDelete?.label ?? ''}
      />
    </>
  );
}
