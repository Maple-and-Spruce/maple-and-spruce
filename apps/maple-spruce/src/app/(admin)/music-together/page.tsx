'use client';

import { useState, useCallback, useMemo } from 'react';
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
import {
  getMusicTogetherSeasonLabel,
  mtSectionDerivedStatus,
  type MusicTogetherSection,
  type MusicTogetherSemester,
  type CreateMusicTogetherSectionInput,
  type CreateMusicTogetherSemesterInput,
} from '@maple/ts/domain';
import {
  useMusicTogetherSections,
  useMusicTogetherSemesters,
  useMusicTogetherRoster,
} from '../../../hooks';
import { SectionFormDialog } from './SectionFormDialog';
import { SemesterFormDialog } from './SemesterFormDialog';
import { RosterDialog } from './RosterDialog';

const fmtDate = (d?: Date) =>
  d
    ? new Date(d).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '—';
const fmtDay = (d?: Date) =>
  d ? new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—';
const fmtPrice = (cents: number) => `$${(cents / 100).toFixed(0)}`;

export default function MusicTogetherPage() {
  const { sectionsState, countsBySection, createSection, updateSection } =
    useMusicTogetherSections();
  const { semestersState, createSemester, updateSemester } =
    useMusicTogetherSemesters();

  const [isSectionFormOpen, setIsSectionFormOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<
    MusicTogetherSection | undefined
  >();
  const [isSectionSubmitting, setIsSectionSubmitting] = useState(false);

  const [isSemesterFormOpen, setIsSemesterFormOpen] = useState(false);
  const [editingSemester, setEditingSemester] = useState<
    MusicTogetherSemester | undefined
  >();
  const [isSemesterSubmitting, setIsSemesterSubmitting] = useState(false);

  const [rosterSection, setRosterSection] = useState<
    MusicTogetherSection | undefined
  >();
  const { rosterState } = useMusicTogetherRoster(rosterSection?.id);

  const semesters = useMemo(
    () => (semestersState.status === 'success' ? semestersState.data : []),
    [semestersState]
  );
  const semesterName = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of semesters) map.set(s.id, s.name);
    return map;
  }, [semesters]);

  const handleSectionSubmit = useCallback(
    async (data: CreateMusicTogetherSectionInput) => {
      setIsSectionSubmitting(true);
      try {
        if (editingSection) {
          await updateSection({ id: editingSection.id, ...data });
        } else {
          await createSection(data);
        }
        setIsSectionFormOpen(false);
        setEditingSection(undefined);
      } finally {
        setIsSectionSubmitting(false);
      }
    },
    [editingSection, createSection, updateSection]
  );

  const handleSemesterSubmit = useCallback(
    async (data: CreateMusicTogetherSemesterInput) => {
      setIsSemesterSubmitting(true);
      try {
        if (editingSemester) {
          await updateSemester({ id: editingSemester.id, ...data });
        } else {
          await createSemester(data);
        }
        setIsSemesterFormOpen(false);
        setEditingSemester(undefined);
      } finally {
        setIsSemesterSubmitting(false);
      }
    },
    [editingSemester, createSemester, updateSemester]
  );

  return (
    <>
      <Typography variant="h4" component="h1" sx={{ mb: 3 }}>
        Music Together
      </Typography>

      {/* ── Semesters ─────────────────────────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 1.5,
        }}
      >
        <Typography variant="h6" component="h2">
          Semesters
        </Typography>
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => {
            setEditingSemester(undefined);
            setIsSemesterFormOpen(true);
          }}
        >
          New Semester
        </Button>
      </Box>
      {semestersState.status === 'loading' && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress />
        </Box>
      )}
      {semestersState.status === 'error' && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {semestersState.error}
        </Alert>
      )}
      {semestersState.status === 'success' && semesters.length === 0 && (
        <Typography color="text.secondary" sx={{ mb: 4 }}>
          No semesters yet. Create a term (e.g. “Fall 2026”), then add sections
          under it.
        </Typography>
      )}
      {semestersState.status === 'success' && semesters.length > 0 && (
        <Table size="small" sx={{ mb: 4 }}>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Term</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Dates</TableCell>
              <TableCell>Weeks</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {semesters.map((sem) => (
              <TableRow key={sem.id}>
                <TableCell>{sem.name}</TableCell>
                <TableCell>
                  {getMusicTogetherSeasonLabel(sem.season)} {sem.year}
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={sem.status}
                    color={sem.status === 'enrolling' ? 'success' : 'default'}
                  />
                </TableCell>
                <TableCell>
                  {sem.startDate || sem.endDate
                    ? `${fmtDay(sem.startDate)} – ${fmtDay(sem.endDate)}`
                    : '—'}
                </TableCell>
                <TableCell>{sem.weeks ?? '—'}</TableCell>
                <TableCell align="right">
                  <Tooltip title="Edit">
                    <IconButton
                      aria-label={`Edit ${sem.name}`}
                      onClick={() => {
                        setEditingSemester(sem);
                        setIsSemesterFormOpen(true);
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

      {/* ── Sections ──────────────────────────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 1.5,
        }}
      >
        <Typography variant="h6" component="h2">
          Sections
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setEditingSection(undefined);
            setIsSectionFormOpen(true);
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
              <TableCell>Semester</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>First session</TableCell>
              <TableCell>Capacity</TableCell>
              <TableCell>Registered</TableCell>
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
                  {section.semesterId
                    ? (semesterName.get(section.semesterId) ?? '—')
                    : '—'}
                </TableCell>
                <TableCell>
                  {(() => {
                    const derived = mtSectionDerivedStatus(
                      section,
                      new Date(),
                      countsBySection[section.id]?.families
                    );
                    return (
                      <Chip
                        size="small"
                        label={derived}
                        color={derived === 'open' ? 'success' : 'default'}
                      />
                    );
                  })()}
                </TableCell>
                <TableCell>{fmtDate(section.sessions?.[0]?.dateTime)}</TableCell>
                <TableCell>{section.capacityFamilies} families</TableCell>
                <TableCell>
                  {(() => {
                    const counts = countsBySection[section.id];
                    const families = counts?.families ?? 0;
                    const childCount = counts?.children ?? 0;
                    return (
                      <>
                        <Typography variant="body2">
                          {childCount}{' '}
                          {childCount === 1 ? 'child' : 'children'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {families} / {section.capacityFamilies} families
                        </Typography>
                      </>
                    );
                  })()}
                </TableCell>
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
                        setEditingSection(section);
                        setIsSectionFormOpen(true);
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

      <SemesterFormDialog
        open={isSemesterFormOpen}
        onClose={() => {
          setIsSemesterFormOpen(false);
          setEditingSemester(undefined);
        }}
        onSubmit={handleSemesterSubmit}
        semester={editingSemester}
        isSubmitting={isSemesterSubmitting}
      />

      <SectionFormDialog
        open={isSectionFormOpen}
        onClose={() => {
          setIsSectionFormOpen(false);
          setEditingSection(undefined);
        }}
        onSubmit={handleSectionSubmit}
        section={editingSection}
        semesters={semesters}
        isSubmitting={isSectionSubmitting}
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
