'use client';

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Skeleton,
  Typography,
} from '@mui/material';
import type { CreateStudentInput, LessonInquiry } from '@maple/ts/domain';
import { studentDraftFromInquiry } from '@maple/ts/domain';
import { LessonInquiryList } from '@maple/react/lessons';
import { StudentForm } from '@maple/react/students';
import {
  useInstructors,
  useLessonInquiries,
  useStudents,
} from '../../../hooks';

/**
 * Lesson inquiries queue (#795, #819).
 *
 * Before this page, an inquiry lived in Tally and in Katie's inbox. The one
 * question a paid funnel has to answer — who asked us about lessons and never
 * heard back — had no answer at all.
 *
 * It answered that and stopped there, which made it a tracking tool: the moment
 * a family said yes, the person working the queue retyped a name, an email and
 * a phone number that were already on their screen into a different page, then
 * came back here to link the two by hand. Three chances to typo an email and
 * one to forget the link entirely, which is how a lead ends up enrolled in real
 * life and `new` in the portal forever.
 *
 * "Create student…" closes that: the inquiry seeds the student form, and saving
 * marks the inquiry enrolled against the student it just made. One action, and
 * the connection is a consequence of the flow rather than a thing to remember.
 */
export default function LeadsPage() {
  const { inquiriesState, updateStatus, updatingId } = useLessonInquiries();
  const { studentsState, createStudent } = useStudents();
  const { instructorsState } = useInstructors();

  const [enrolling, setEnrolling] = useState<LessonInquiry | null>(null);
  const [studentId, setStudentId] = useState('');

  /** The inquiry whose "Create student…" form is open, if any. */
  const [creatingFrom, setCreatingFrom] = useState<LessonInquiry | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const students = studentsState.status === 'success' ? studentsState.data : [];
  const instructors =
    instructorsState.status === 'success' ? instructorsState.data : [];

  const closeEnroll = () => {
    setEnrolling(null);
    setStudentId('');
  };

  const confirmEnroll = async () => {
    if (!enrolling || !studentId) return;
    await updateStatus(enrolling.id, 'enrolled', { studentId });
    closeEnroll();
  };

  /**
   * Create the student, then link the inquiry to it.
   *
   * Ordered deliberately, and the failure between the two steps is the reason:
   * if the link fails after the student is created, the student still exists
   * and the inquiry is merely still open — visible, obviously unfinished, and
   * fixable with "Mark enrolled…". The reverse order could mark an inquiry
   * enrolled against a student that was never created, which is the one state
   * the queue cannot show you.
   */
  const handleCreateStudent = async (data: CreateStudentInput) => {
    if (!creatingFrom) return;
    setCreating(true);
    setCreateError(null);
    try {
      const student = await createStudent(data);
      try {
        await updateStatus(creatingFrom.id, 'enrolled', {
          studentId: student.id,
        });
      } catch {
        setCreateError(
          `${student.name} was created, but linking the inquiry failed. ` +
            `Use "Mark enrolled…" on this row to finish the link.`
        );
        return;
      }
      setCreatingFrom(null);
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : 'Could not create the student.'
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Lesson inquiries
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Families who asked about music lessons, pulled in from the website forms
        every 15 minutes.
      </Typography>

      {createError && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setCreateError(null)}>
          {createError}
        </Alert>
      )}

      {inquiriesState.status === 'loading' && (
        <Skeleton variant="rectangular" height={280} />
      )}

      {inquiriesState.status === 'error' && (
        <Alert severity="error">{inquiriesState.error}</Alert>
      )}

      {inquiriesState.status === 'success' && (
        <LessonInquiryList
          inquiries={inquiriesState.data}
          updatingId={updatingId}
          onUpdateStatus={(id, status) => updateStatus(id, status)}
          onEnroll={(inquiry) => setEnrolling(inquiry)}
          onCreateStudent={(inquiry) => {
            setCreateError(null);
            setCreatingFrom(inquiry);
          }}
        />
      )}

      <StudentForm
        open={Boolean(creatingFrom)}
        onClose={() => setCreatingFrom(null)}
        onSubmit={handleCreateStudent}
        instructors={instructors}
        isSubmitting={creating}
        prefill={
          creatingFrom ? studentDraftFromInquiry(creatingFrom) : undefined
        }
        prefillNote={
          creatingFrom
            ? `Prefilled from ${creatingFrom.contactName}'s inquiry of ` +
              `${creatingFrom.submittedAt.toLocaleDateString()}. Saving also ` +
              `marks that inquiry enrolled.`
            : undefined
        }
      />

      <Dialog open={Boolean(enrolling)} onClose={closeEnroll} fullWidth maxWidth="xs">
        <DialogTitle>Mark enrolled</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Link {enrolling?.contactName} to the student record they became, so
            the inquiry and the enrolment stay connected.
          </Typography>
          <FormControl fullWidth>
            <InputLabel id="enroll-student-label">Student</InputLabel>
            <Select
              labelId="enroll-student-label"
              label="Student"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            >
              {students.map((student) => (
                <MenuItem key={student.id} value={student.id}>
                  {student.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEnroll}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!studentId || updatingId === enrolling?.id}
            onClick={confirmEnroll}
          >
            Mark enrolled
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
