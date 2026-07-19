'use client';

import { Autocomplete, TextField } from '@mui/material';
import type { Student } from '@maple/ts/domain';

interface StudentPickerProps {
  students: Student[];
  /** Selected student id, or null. */
  value: string | null;
  onChange: (studentId: string | null) => void;
  label?: string;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
}

/**
 * Reusable student autocomplete. Options show the student name plus the
 * primary contact so payers/parents are easy to disambiguate.
 */
export function StudentPicker({
  students,
  value,
  onChange,
  label = 'Student',
  disabled,
  error,
  helperText,
}: StudentPickerProps) {
  const selected = students.find((s) => s.id === value) ?? null;

  return (
    <Autocomplete
      options={students}
      value={selected}
      disabled={disabled}
      onChange={(_e, next) => onChange(next?.id ?? null)}
      getOptionLabel={(s) =>
        s.primaryContactName && s.primaryContactName !== s.name
          ? `${s.name} — ${s.primaryContactName}`
          : s.name
      }
      isOptionEqualToValue={(opt, val) => opt.id === val.id}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          error={error}
          helperText={helperText}
        />
      )}
    />
  );
}
