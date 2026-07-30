'use client';

/**
 * LessonBlockList — weekly lesson blocks grouped by teacher (#689).
 */
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  IconButton,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import type { Instructor, LessonBlock, RequestState } from '@maple/ts/domain';
import { WEEKDAY_LONG } from '@maple/ts/domain';
import { formatMinutes } from './block-format';

export interface LessonBlockListProps {
  lessonBlocksState: RequestState<LessonBlock[]>;
  instructors: Instructor[];
  onEdit: (block: LessonBlock) => void;
  onDelete: (block: LessonBlock) => void;
}

export function LessonBlockList({
  lessonBlocksState,
  instructors,
  onEdit,
  onDelete,
}: LessonBlockListProps) {
  if (lessonBlocksState.status === 'idle') return null;

  if (lessonBlocksState.status === 'loading') {
    return (
      <Stack spacing={2}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rectangular" height={72} />
        ))}
      </Stack>
    );
  }

  if (lessonBlocksState.status === 'error') {
    return <Alert severity="error">{lessonBlocksState.error}</Alert>;
  }

  const blocks = lessonBlocksState.data;
  if (blocks.length === 0) {
    return (
      <Typography color="text.secondary">
        No lesson blocks yet. Add one so lessons can be scheduled.
      </Typography>
    );
  }

  const nameById = new Map(instructors.map((i) => [i.id, i.name]));

  // Group by teacher, preserving the weekday/start ordering within each.
  const byTeacher = new Map<string, LessonBlock[]>();
  for (const b of blocks) {
    const list = byTeacher.get(b.teacherId) ?? [];
    list.push(b);
    byTeacher.set(b.teacherId, list);
  }

  return (
    <Stack spacing={3}>
      {[...byTeacher.entries()].map(([teacherId, teacherBlocks]) => (
        <Box key={teacherId}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            {nameById.get(teacherId) ?? 'Unknown teacher'}
          </Typography>
          <Stack spacing={1}>
            {teacherBlocks.map((block) => (
              <Card key={block.id} variant="outlined">
                <CardContent
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    py: 1.5,
                    '&:last-child': { pb: 1.5 },
                  }}
                >
                  <Box>
                    <Typography>
                      {WEEKDAY_LONG[block.dayOfWeek]}s ·{' '}
                      {formatMinutes(block.startMinutes)}–
                      {formatMinutes(block.endMinutes)}
                    </Typography>
                    {block.label && (
                      <Chip
                        label={block.label}
                        size="small"
                        sx={{ mt: 0.5 }}
                        variant="outlined"
                      />
                    )}
                  </Box>
                  <Box>
                    <IconButton
                      aria-label="Edit block"
                      onClick={() => onEdit(block)}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      aria-label="Delete block"
                      onClick={() => onDelete(block)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}
