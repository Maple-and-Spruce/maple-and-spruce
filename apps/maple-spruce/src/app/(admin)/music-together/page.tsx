'use client';

import { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import GroupIcon from '@mui/icons-material/Group';
import type {
  MusicTogetherSection,
  CreateMusicTogetherSectionInput,
} from '@maple/ts/domain';
import { useMusicTogetherSections, useMusicTogetherRoster } from '../../../hooks';
import { SectionFormDialog } from './SectionFormDialog';
import { RosterDialog } from './RosterDialog';

const fmtDate = (d?: Date) =>
  d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const fmtPrice = (cents: number) => `$${(cents / 100).toFixed(0)}`;

export default function MusicTogetherPage() {
  const { sectionsState, createSection, updateSection } =
    useMusicTogetherSections();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<MusicTogetherSection | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [rosterSection, setRosterSection] = useState<
    MusicTogetherSection | undefined
  >();
  const { rosterState } = useMusicTogetherRoster(rosterSection?.id);

  const handleSubmit = useCallback(
    async (data: CreateMusicTogetherSectionInput) => {
      setIsSubmitting(true);
      try {
        if (editing) {
          await updateSection({ id: editing.id, ...data });
        } else {
          await createSection(data);
        }
        setIsFormOpen(false);
        setEditing(undefined);
      } finally {
        setIsSubmitting(false);
      }
    },
    [editing, createSection, updateSection]
  );

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Typography variant="h4" component="h1">
          Music Together
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setEditing(undefined);
            setIsFormOpen(true);
          }}
        >
          New Section
        </Button>
      </Box>

      {sectionsState.status === 'loading' && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      )}
      {sectionsState.status === 'error' && (
        <Alert severity="error">{sectionsState.error}</Alert>
      )}
      {sectionsState.status === 'success' && sectionsState.data.length === 0 && (
        <Typography color="text.secondary">
          No sections yet. Create the first one.
        </Typography>
      )}
      {sectionsState.status === 'success' && sectionsState.data.length > 0 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>First session</TableCell>
              <TableCell>Capacity</TableCell>
              <TableCell>Full price</TableCell>
              <TableCell>Installments</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sectionsState.data.map((section) => (
              <TableRow key={section.id}>
                <TableCell>{section.name}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={section.status}
                    color={section.status === 'open' ? 'success' : 'default'}
                  />
                </TableCell>
                <TableCell>{fmtDate(section.sessions?.[0]?.dateTime)}</TableCell>
                <TableCell>{section.capacityFamilies} families</TableCell>
                <TableCell>{fmtPrice(section.priceFullCents)}</TableCell>
                <TableCell>
                  {section.installmentPlan?.length
                    ? `${section.installmentPlan.length}×`
                    : '—'}
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Roster">
                    <IconButton
                      aria-label={`Roster for ${section.name}`}
                      onClick={() => setRosterSection(section)}
                    >
                      <GroupIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Edit">
                    <IconButton
                      aria-label={`Edit ${section.name}`}
                      onClick={() => {
                        setEditing(section);
                        setIsFormOpen(true);
                      }}
                    >
                      <EditIcon />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <SectionFormDialog
        open={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditing(undefined);
        }}
        onSubmit={handleSubmit}
        section={editing}
        isSubmitting={isSubmitting}
      />

      <RosterDialog
        open={!!rosterSection}
        onClose={() => setRosterSection(undefined)}
        sectionName={rosterSection?.name ?? ''}
        rosterState={rosterState}
      />
    </>
  );
}
