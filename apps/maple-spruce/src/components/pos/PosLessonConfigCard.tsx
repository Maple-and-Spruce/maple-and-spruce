'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { usePosLessonConfig } from '@maple/react/data';

/**
 * Settings card to manage which Square catalog items count as music lessons
 * at the POS (#628). A line item rung up with one of these catalog object ids
 * is routed to the POS lesson review queue instead of being ignored.
 */
export function PosLessonConfigCard() {
  const { configState, saveConfig } = usePosLessonConfig();
  const [ids, setIds] = useState<string[]>([]);
  const [newId, setNewId] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (configState.status === 'success') {
      setIds(configState.data.lessonCatalogObjectIds);
      setDirty(false);
    }
  }, [configState]);

  const addId = () => {
    const v = newId.trim();
    if (!v) return;
    if (!ids.includes(v)) {
      setIds([...ids, v]);
      setDirty(true);
    }
    setNewId('');
  };

  const removeId = (id: string) => {
    setIds(ids.filter((x) => x !== id));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveConfig(ids);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" gutterBottom>
          POS Lesson Catalog Items
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Square catalog object (variation) ids that count as music lessons when
          rung up at the POS — e.g. your “Guitar Lesson” item. A POS sale of one
          of these is routed to the POS Lessons review queue. Find the id in the
          Square Dashboard (catalog item → variation).
        </Typography>

        {configState.status === 'loading' && (
          <Skeleton variant="rectangular" height={80} />
        )}
        {configState.status === 'error' && (
          <Alert severity="error">Failed to load: {configState.error}</Alert>
        )}
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {configState.status === 'success' && (
          <>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
              {ids.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No lesson items configured — POS lesson detection is off.
                </Typography>
              ) : (
                ids.map((id) => (
                  <Chip
                    key={id}
                    label={id}
                    onDelete={() => removeId(id)}
                    sx={{ fontFamily: 'monospace' }}
                  />
                ))
              )}
            </Box>

            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
              <TextField
                size="small"
                label="Catalog object id"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addId();
                  }
                }}
                sx={{ flex: 1 }}
              />
              <Button onClick={addId} disabled={!newId.trim()}>
                Add
              </Button>
            </Stack>

            <Button
              variant="contained"
              onClick={save}
              disabled={!dirty || saving}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
