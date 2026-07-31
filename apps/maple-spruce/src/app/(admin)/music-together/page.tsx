'use client';

import { useState, useCallback, useMemo, type ReactNode } from 'react';
import {
  Box,
  Stack,
  Typography,
  Button,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  Skeleton,
  Alert,
  IconButton,
  Tooltip,
  Link,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import GroupIcon from '@mui/icons-material/Group';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import {
  getMusicTogetherSeasonLabel,
  mtSectionDerivedStatus,
  mtSemesterDerivedStatus,
  mtDemoDurationMinutes,
  type MusicTogetherSection,
  type MusicTogetherSemester,
  type MusicTogetherDemo,
  type CreateMusicTogetherSectionInput,
  type CreateMusicTogetherSemesterInput,
  type CreateMusicTogetherDemoInput,
} from '@maple/ts/domain';
import {
  useMusicTogetherSections,
  useMusicTogetherSemesters,
  useMusicTogetherRoster,
  useMusicTogetherInterest,
  useMusicTogetherDemos,
  useMusicTogetherDemoRsvps,
} from '../../../hooks';
import { SectionFormDialog } from './SectionFormDialog';
import { SemesterFormDialog } from './SemesterFormDialog';
import { RosterDialog } from './RosterDialog';
import { InterestListDialog } from './InterestListDialog';
import { DemoFormDialog } from './DemoFormDialog';
import { DemoRsvpsDialog } from './DemoRsvpsDialog';

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

/**
 * The single, shared style for every Name-cell link across the three MT admin
 * tables (Semesters, Sections, Demo Classes) so they read as one control. It's
 * a real `<button>` (MUI `Link` with `component="button"`) so it's
 * keyboard-focusable and announces the entity name as its accessible label;
 * clicking opens that row's review modal. Left-aligned and inline so it doesn't
 * grow the row height.
 */
function NameLink({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <Link
      component="button"
      type="button"
      variant="body2"
      underline="hover"
      color="primary"
      onClick={onClick}
      sx={{
        textAlign: 'left',
        verticalAlign: 'baseline',
        cursor: 'pointer',
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: 2,
          borderRadius: 0.5,
        },
      }}
    >
      {children}
    </Link>
  );
}

/**
 * A table-shaped loading placeholder that mirrors the real table's columns so
 * the layout doesn't shift when data arrives. Keeps the header visible and
 * fills the body with shimmering skeleton rows.
 */
function TableLoadingSkeleton({
  headers,
  rows = 3,
  size = 'medium',
  mb,
}: {
  headers: readonly string[];
  rows?: number;
  size?: 'small' | 'medium';
  mb?: number;
}) {
  return (
    <Table size={size} sx={mb ? { mb } : undefined}>
      <TableHead>
        <TableRow>
          {headers.map((h, i) => (
            <TableCell key={h} align={i === headers.length - 1 ? 'right' : 'left'}>
              {h}
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {Array.from({ length: rows }).map((_, r) => (
          <TableRow key={r}>
            {headers.map((h, c) => (
              <TableCell key={h}>
                <Skeleton variant="text" width={c === 0 ? '70%' : '55%'} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

const SEMESTER_HEADERS = [
  'Name',
  'Term',
  'Status',
  'Dates',
  'Weeks',
  'Actions',
] as const;

const SECTION_HEADERS = [
  'Name',
  'Semester',
  'Status',
  'First session',
  'Capacity',
  'Registered',
  'Full price',
  'Installments',
  'Actions',
] as const;

const DEMO_HEADERS = [
  'Date & time',
  'Location',
  'Duration',
  'Capacity',
  'RSVPs',
  'Visible',
  'Actions',
] as const;

export default function MusicTogetherPage() {
  const {
    sectionsState,
    countsBySection,
    createSection,
    updateSection,
    duplicateSection,
  } = useMusicTogetherSections();
  const [actionError, setActionError] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const handleDuplicate = useCallback(
    async (sectionId: string) => {
      setActionError(null);
      setDuplicatingId(sectionId);
      try {
        await duplicateSection(sectionId);
      } catch (e) {
        setActionError(
          e instanceof Error ? e.message : 'Failed to duplicate section'
        );
      } finally {
        setDuplicatingId(null);
      }
    },
    [duplicateSection]
  );
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
  const { rosterState, cancelRegistration } = useMusicTogetherRoster(
    rosterSection?.id
  );

  const [isInterestOpen, setIsInterestOpen] = useState(false);
  const { interestState } = useMusicTogetherInterest();

  const [isDemoRsvpsOpen, setIsDemoRsvpsOpen] = useState(false);
  // When a demo Name link is clicked we open the (shared) Demo RSVPs viewer
  // scrolled to that demo; the global toolbar button leaves this undefined so
  // the viewer shows every demo group with none focused.
  const [focusedDemoId, setFocusedDemoId] = useState<string | undefined>();
  const { demoRsvpsState } = useMusicTogetherDemoRsvps();

  const { demosState, countsByDemo, createDemo, updateDemo, deleteDemo } =
    useMusicTogetherDemos();
  const [isDemoFormOpen, setIsDemoFormOpen] = useState(false);
  const [editingDemo, setEditingDemo] = useState<MusicTogetherDemo | undefined>();
  const [isDemoSubmitting, setIsDemoSubmitting] = useState(false);

  const handleDemoSubmit = useCallback(
    async (data: CreateMusicTogetherDemoInput) => {
      setIsDemoSubmitting(true);
      try {
        if (editingDemo) {
          await updateDemo({ id: editingDemo.id, ...data });
        } else {
          await createDemo(data);
        }
        setIsDemoFormOpen(false);
        setEditingDemo(undefined);
      } finally {
        setIsDemoSubmitting(false);
      }
    },
    [editingDemo, createDemo, updateDemo]
  );

  const handleDeleteDemo = useCallback(
    async (demo: MusicTogetherDemo) => {
      if (
        !window.confirm(
          `Delete the demo on ${new Date(demo.dateTime).toLocaleString()} at ${
            demo.location
          }? This also removes it from the calendar.`
        )
      ) {
        return;
      }
      setActionError(null);
      try {
        await deleteDemo(demo.id);
      } catch (e) {
        setActionError(
          e instanceof Error ? e.message : 'Failed to delete demo'
        );
      }
    },
    [deleteDemo]
  );

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
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<EventAvailableIcon />}
            onClick={() => {
              setFocusedDemoId(undefined);
              setIsDemoRsvpsOpen(true);
            }}
          >
            Demo RSVPs
          </Button>
          <Button
            variant="outlined"
            startIcon={<FavoriteBorderIcon />}
            onClick={() => setIsInterestOpen(true)}
          >
            Interest list
          </Button>
        </Stack>
      </Box>

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
      {(semestersState.status === 'idle' ||
        semestersState.status === 'loading') && (
        <TableLoadingSkeleton
          headers={SEMESTER_HEADERS}
          size="small"
          rows={2}
          mb={4}
        />
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
                <TableCell>
                  <NameLink
                    onClick={() => {
                      setEditingSemester(sem);
                      setIsSemesterFormOpen(true);
                    }}
                  >
                    {sem.name}
                  </NameLink>
                </TableCell>
                <TableCell>
                  {getMusicTogetherSeasonLabel(sem.season)} {sem.year}
                </TableCell>
                <TableCell>
                  {(() => {
                    const derived = mtSemesterDerivedStatus(sem, new Date());
                    return (
                      <Chip
                        size="small"
                        label={derived}
                        color={derived === 'enrolling' ? 'success' : 'default'}
                      />
                    );
                  })()}
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

      {actionError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      {(sectionsState.status === 'idle' ||
        sectionsState.status === 'loading') && (
        <TableLoadingSkeleton headers={SECTION_HEADERS} rows={3} />
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
                <TableCell>
                  <NameLink onClick={() => setRosterSection(section)}>
                    {section.name}
                  </NameLink>
                </TableCell>
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
                  <Tooltip title="Duplicate (hidden copy)">
                    <span>
                      <IconButton
                        aria-label={`Duplicate ${section.name}`}
                        disabled={duplicatingId === section.id}
                        onClick={() => handleDuplicate(section.id)}
                      >
                        <ContentCopyIcon />
                      </IconButton>
                    </span>
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

      {/* ── Demo classes ──────────────────────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mt: 5,
          mb: 1.5,
        }}
      >
        <Typography variant="h6" component="h2">
          Demo Classes
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setEditingDemo(undefined);
            setIsDemoFormOpen(true);
          }}
        >
          Add demo
        </Button>
      </Box>

      {(demosState.status === 'idle' || demosState.status === 'loading') && (
        <TableLoadingSkeleton headers={DEMO_HEADERS} size="small" rows={2} />
      )}
      {demosState.status === 'error' && (
        <Alert severity="error">{demosState.error}</Alert>
      )}
      {demosState.status === 'success' && demosState.data.length === 0 && (
        <Typography color="text.secondary">
          No demo classes yet. Add a free try-a-class (often offsite) — it shows
          on the demo RSVP widget and the public calendar.
        </Typography>
      )}
      {demosState.status === 'success' && demosState.data.length > 0 && (
        <Table size="small">
          <TableHead>
            <TableRow>
              {DEMO_HEADERS.map((h, i) => (
                <TableCell
                  key={h}
                  align={i === DEMO_HEADERS.length - 1 ? 'right' : 'left'}
                >
                  {h}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {demosState.data.map((demo) => {
              const counts = countsByDemo[demo.id];
              const confirmed = counts?.confirmed ?? 0;
              const waitlisted = counts?.waitlisted ?? 0;
              return (
                <TableRow key={demo.id}>
                  <TableCell>
                    <NameLink
                      onClick={() => {
                        setFocusedDemoId(demo.id);
                        setIsDemoRsvpsOpen(true);
                      }}
                    >
                      {fmtDate(demo.dateTime)}
                    </NameLink>
                  </TableCell>
                  <TableCell>{demo.location}</TableCell>
                  <TableCell>{mtDemoDurationMinutes(demo)} min</TableCell>
                  <TableCell>{demo.capacityFamilies} families</TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {confirmed} / {demo.capacityFamilies} confirmed
                    </Typography>
                    {waitlisted > 0 && (
                      <Typography variant="caption" color="text.secondary">
                        {waitlisted} waitlisted
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={demo.visible ? 'visible' : 'hidden'}
                      color={demo.visible ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Edit">
                      <IconButton
                        aria-label={`Edit demo ${demo.location}`}
                        onClick={() => {
                          setEditingDemo(demo);
                          setIsDemoFormOpen(true);
                        }}
                      >
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        aria-label={`Delete demo ${demo.location}`}
                        onClick={() => handleDeleteDemo(demo)}
                      >
                        <DeleteOutlineIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
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
        onCancelRegistration={cancelRegistration}
      />

      <InterestListDialog
        open={isInterestOpen}
        onClose={() => setIsInterestOpen(false)}
        interestState={interestState}
      />

      <DemoFormDialog
        open={isDemoFormOpen}
        onClose={() => {
          setIsDemoFormOpen(false);
          setEditingDemo(undefined);
        }}
        onSubmit={handleDemoSubmit}
        demo={editingDemo}
        isSubmitting={isDemoSubmitting}
      />

      <DemoRsvpsDialog
        open={isDemoRsvpsOpen}
        onClose={() => {
          setIsDemoRsvpsOpen(false);
          setFocusedDemoId(undefined);
        }}
        demoRsvpsState={demoRsvpsState}
        focusedDemoId={focusedDemoId}
      />
    </>
  );
}
