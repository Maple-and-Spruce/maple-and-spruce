'use client';

/**
 * "Start from an inquiry" for the students page (#817).
 *
 * The other half of the same seam as `/leads` → "Create student…". Which page
 * you happen to be on when a family says yes is an accident, and before this
 * the two paths were not equivalent: from `/leads` you had the family's details
 * in front of you, and from `/students` you had a blank form and a memory.
 *
 * Deliberately a *suggestion*, not a required step. Plenty of students arrive
 * by word of mouth and never fill a form in, so the plain "Add Student" button
 * stays exactly where it was and this sits beside it — and disappears entirely
 * when there is nothing to suggest, rather than sitting there empty.
 *
 * WHAT IS FILTERED OUT, AND WHY
 * -----------------------------
 * Closed inquiries (enrolled, lost) are gone: an enrolled one already has its
 * student, and offering it again is how you get two records for one child.
 * Inquiries whose email already belongs to a student are gone for the same
 * reason — that is a family coming back for a second instrument or a second
 * child, and the right move is editing the household you have, not making a
 * rival copy of it.
 */
import { useMemo, useState } from 'react';
import { Button, Chip, ListItemText, Menu, MenuItem, Stack } from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import type { LessonInquiry, Student } from '@maple/ts/domain';
import { inquiryMatchesContact } from '@maple/ts/domain';

export interface InquirySuggestionsProps {
  inquiries: LessonInquiry[];
  students: Student[];
  onPick: (inquiry: LessonInquiry) => void;
  disabled?: boolean;
}

/**
 * The inquiries worth offering as a new student, newest first.
 *
 * Exported so the filtering can be tested without a DOM — it is the part with
 * actual judgement in it, and the part that quietly causes duplicate families
 * if it is wrong.
 */
export function suggestableInquiries(
  inquiries: LessonInquiry[],
  students: Student[]
): LessonInquiry[] {
  const contactEmails = new Set(
    students.map((s) => s.primaryContactEmail.trim().toLowerCase())
  );

  return inquiries
    .filter((i) => i.status !== 'enrolled' && i.status !== 'lost')
    .filter((i) => !inquiryMatchesContact(i, contactEmails))
    .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());
}

export function InquirySuggestions({
  inquiries,
  students,
  onPick,
  disabled = false,
}: InquirySuggestionsProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const candidates = useMemo(
    () => suggestableInquiries(inquiries, students),
    [inquiries, students]
  );

  // Nothing to suggest is not a disabled button, it is no button.
  if (candidates.length === 0) return null;

  return (
    <>
      <Button
        variant="outlined"
        startIcon={<PersonAddIcon />}
        disabled={disabled}
        onClick={(e) => setAnchorEl(e.currentTarget)}
      >
        Start from an inquiry ({candidates.length})
      </Button>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        {candidates.map((inquiry) => (
          <MenuItem
            key={inquiry.id}
            onClick={() => {
              setAnchorEl(null);
              onPick(inquiry);
            }}
          >
            <ListItemText
              primary={
                <Stack direction="row" spacing={1} alignItems="center">
                  <span>{inquiry.contactName}</span>
                  {inquiry.interest && (
                    <Chip size="small" label={inquiry.interest} />
                  )}
                </Stack>
              }
              secondary={`${inquiry.email} · ${inquiry.submittedAt.toLocaleDateString()}`}
            />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
