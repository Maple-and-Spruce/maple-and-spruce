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
import type { LessonInquiry } from '@maple/ts/domain';
import { LessonInquiryList } from '@maple/react/lessons';
import { useLessonInquiries, useStudents } from '../../../hooks';

/**
 * Lesson inquiries queue (#795).
 *
 * Before this page, an inquiry lived in Tally and in Katie's inbox. The one
 * question a paid funnel has to answer — who asked us about lessons and never
 * heard back — had no answer at all.
 */
export default function LeadsPage() {
  const { inquiriesState, updateStatus, updatingId } = useLessonInquiries();
  const { studentsState } = useStudents();
  const [enrolling, setEnrolling] = useState<LessonInquiry | null>(null);
  const [studentId, setStudentId] = useState('');

  const students =
    studentsState.status === 'success' ? studentsState.data : [];

  const closeEnroll = () => {
    setEnrolling(null);
    setStudentId('');
  };

  const confirmEnroll = async () => {
    if (!enrolling || !studentId) return;
    await updateStatus(enrolling.id, 'enrolled', { studentId });
    closeEnroll();
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
        />
      )}

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
