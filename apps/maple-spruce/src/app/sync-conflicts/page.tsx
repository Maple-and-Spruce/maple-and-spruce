'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  Tabs,
  Tab,
  Chip,
  Alert,
  CircularProgress,
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import type { SyncConflict, SyncConflictStatus, SyncResolution } from '@maple/ts/domain';
import { SyncConflictDataTable, SyncConflictResolver } from '../../components/sync';
import { AppShell } from '../../components/layout';
import { useSyncConflicts } from '@maple/react/data';

type FilterTab = 'all' | SyncConflictStatus;

export default function SyncConflictsPage() {
  // Conflicts state from hook (fetches on mount)
  const {
    conflictsState,
    summaryState,
    detectingState,
    resolveConflict,
    detectConflicts,
  } = useSyncConflicts();

  // Filter tab state
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  // Resolver dialog state
  const [conflictToResolve, setConflictToResolve] = useState<SyncConflict | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  // Filter conflicts based on active tab
  const filteredConflicts = useMemo(() => {
    if (conflictsState.status !== 'success') return undefined;
    if (activeTab === 'all') return undefined; // Use all conflicts

    return conflictsState.data.filter((c) => c.status === activeTab);
  }, [conflictsState, activeTab]);

  // Get counts for tab badges
  const counts = useMemo(() => {
    if (summaryState.status !== 'success') {
      return { all: 0, pending: 0, resolved: 0, ignored: 0 };
    }

    const summary = summaryState.data;
    return {
      all: summary.pending + summary.resolved + summary.ignored,
      pending: summary.pending,
      resolved: summary.resolved,
      ignored: summary.ignored,
    };
  }, [summaryState]);

  const handleTabChange = useCallback(
    (_event: React.SyntheticEvent, newValue: FilterTab) => {
      setActiveTab(newValue);
    },
    []
  );

  const handleDetectConflicts = useCallback(async () => {
    await detectConflicts();
  }, [detectConflicts]);

  const handleOpenResolver = useCallback((conflict: SyncConflict) => {
    setConflictToResolve(conflict);
  }, []);

  const handleCloseResolver = useCallback(() => {
    setConflictToResolve(null);
  }, []);

  const handleResolve = useCallback(
    async (resolution: SyncResolution, notes?: string) => {
      if (!conflictToResolve) return;

      setIsResolving(true);

      try {
        await resolveConflict(conflictToResolve.id, resolution, notes);
        handleCloseResolver();
      } catch (error) {
        console.error('Failed to resolve conflict:', error);
        // TODO: Show error toast
      } finally {
        setIsResolving(false);
      }
    },
    [conflictToResolve, handleCloseResolver, resolveConflict]
  );

  const isDetecting = detectingState.status === 'loading';

  return (
    <AppShell>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Typography variant="h4" component="h1">
          Sync Conflicts
        </Typography>
        <Button
          variant="contained"
          startIcon={
            isDetecting ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />
          }
          onClick={handleDetectConflicts}
          disabled={isDetecting}
        >
          {isDetecting ? 'Detecting...' : 'Detect Now'}
        </Button>
      </Box>

      {/* Show detection results */}
      {detectingState.status === 'success' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Detection complete: {detectingState.data.detected} new conflict{detectingState.data.detected !== 1 ? 's' : ''} found
          {detectingState.data.updated > 0 && ` (${detectingState.data.updated} already pending)`}.
        </Alert>
      )}

      {detectingState.status === 'error' && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Detection failed: {detectingState.error}
        </Alert>
      )}

      {/* Filter tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          aria-label="conflict filter tabs"
        >
          <Tab
            value="all"
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                All
                <Chip label={counts.all} size="small" />
              </Box>
            }
          />
          <Tab
            value="pending"
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                Pending
                <Chip
                  label={counts.pending}
                  size="small"
                  color={counts.pending > 0 ? 'warning' : 'default'}
                />
              </Box>
            }
          />
          <Tab
            value="resolved"
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                Resolved
                <Chip label={counts.resolved} size="small" color="success" />
              </Box>
            }
          />
          <Tab
            value="ignored"
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                Ignored
                <Chip label={counts.ignored} size="small" />
              </Box>
            }
          />
        </Tabs>
      </Box>

      {/* Conflicts table */}
      <SyncConflictDataTable
        conflictsState={conflictsState}
        onResolve={handleOpenResolver}
        filteredConflicts={filteredConflicts}
      />

      {/* Resolver dialog */}
      <SyncConflictResolver
        conflict={conflictToResolve}
        open={!!conflictToResolve}
        onClose={handleCloseResolver}
        onResolve={handleResolve}
        isResolving={isResolving}
      />
    </AppShell>
  );
}
