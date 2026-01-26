'use client';

import {
  Box,
  Card,
  CardContent,
  CardMedia,
  Typography,
  Chip,
  IconButton,
  Grid2 as Grid,
  Skeleton,
  Alert,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import EventIcon from '@mui/icons-material/Event';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import GroupIcon from '@mui/icons-material/Group';
import type { Class, Instructor, ClassCategory, RequestState } from '@maple/ts/domain';
import { formatClassPrice } from '@maple/ts/domain';

interface ClassListProps {
  classesState: RequestState<Class[]>;
  instructors?: Instructor[];
  categories?: ClassCategory[];
  onEdit: (classItem: Class) => void;
  onDelete: (classItem: Class) => void;
}

const statusColors: Record<string, 'success' | 'default' | 'error' | 'warning'> = {
  published: 'success',
  draft: 'default',
  cancelled: 'error',
  completed: 'warning',
};

const skillLevelColors: Record<string, 'success' | 'warning' | 'error' | 'info'> = {
  beginner: 'success',
  intermediate: 'warning',
  advanced: 'error',
  'all-levels': 'info',
};

/**
 * Format date for display
 */
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

/**
 * Format duration in minutes to readable string
 */
function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `${hours} hr`;
  }
  return `${hours} hr ${mins} min`;
}

function ClassCard({
  classItem,
  instructorName,
  categoryName,
  onEdit,
  onDelete,
}: {
  classItem: Class;
  instructorName?: string;
  categoryName?: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const dateTime = classItem.dateTime instanceof Date
    ? classItem.dateTime
    : new Date(classItem.dateTime);
  const isPast = dateTime < new Date();

  return (
    <Card sx={{ opacity: isPast && classItem.status !== 'completed' ? 0.7 : 1 }}>
      {/* Class Image */}
      {classItem.imageUrl ? (
        <CardMedia
          component="img"
          height="160"
          image={classItem.imageUrl}
          alt={classItem.name}
          sx={{ objectFit: 'cover' }}
        />
      ) : (
        <Box
          sx={{
            height: 160,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'grey.100',
          }}
        >
          <EventIcon sx={{ fontSize: 48, color: 'grey.400' }} />
        </Box>
      )}
      <CardContent>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" component="h3" gutterBottom>
              {classItem.name}
            </Typography>

            {/* Date and Time */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <EventIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="body2" color="text.secondary">
                {formatDate(dateTime)}
              </Typography>
            </Box>

            {/* Duration */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <AccessTimeIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="body2" color="text.secondary">
                {formatDuration(classItem.durationMinutes)}
              </Typography>
            </Box>

            {/* Capacity */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
              <GroupIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="body2" color="text.secondary">
                {classItem.capacity} spots
              </Typography>
            </Box>

            {/* Instructor */}
            {instructorName && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                Instructor: {instructorName}
              </Typography>
            )}

            {/* Price */}
            <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
              {formatClassPrice(classItem.priceCents)}
            </Typography>

            {/* Chips */}
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              <Chip
                label={classItem.status}
                size="small"
                color={statusColors[classItem.status]}
              />
              <Chip
                label={classItem.skillLevel}
                size="small"
                color={skillLevelColors[classItem.skillLevel]}
                variant="outlined"
              />
              {categoryName && (
                <Chip label={categoryName} size="small" variant="outlined" />
              )}
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <IconButton onClick={onEdit} size="small" aria-label="Edit">
              <EditIcon />
            </IconButton>
            <IconButton
              onClick={onDelete}
              size="small"
              aria-label="Delete"
              color="error"
            >
              <DeleteIcon />
            </IconButton>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <Grid container spacing={2}>
      {[1, 2, 3].map((i) => (
        <Grid size={{ xs: 12, sm: 6, md: 4 }} key={i}>
          <Card>
            <Skeleton variant="rectangular" height={160} />
            <CardContent>
              <Skeleton variant="text" width="70%" height={32} />
              <Skeleton variant="text" width="60%" />
              <Skeleton variant="text" width="40%" />
              <Skeleton variant="text" width="50%" />
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Skeleton variant="rounded" width={70} height={24} />
                <Skeleton variant="rounded" width={80} height={24} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}

export function ClassList({
  classesState,
  instructors = [],
  categories = [],
  onEdit,
  onDelete,
}: ClassListProps) {
  if (classesState.status === 'loading') {
    return <LoadingSkeleton />;
  }

  if (classesState.status === 'error') {
    return (
      <Alert severity="error">
        Failed to load classes: {classesState.error}
      </Alert>
    );
  }

  if (classesState.status === 'idle') {
    return null;
  }

  const classes = classesState.data;

  // Create lookup maps for enrichment
  const instructorMap = new Map(instructors.map((i) => [i.id, i.name]));
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  if (classes.length === 0) {
    return (
      <Box
        sx={{
          textAlign: 'center',
          py: 8,
          color: 'text.secondary',
        }}
      >
        <Typography variant="h6">No classes yet</Typography>
        <Typography>Click "Add Class" to get started</Typography>
      </Box>
    );
  }

  return (
    <Grid container spacing={2}>
      {classes.map((classItem) => (
        <Grid size={{ xs: 12, sm: 6, md: 4 }} key={classItem.id}>
          <ClassCard
            classItem={classItem}
            instructorName={
              classItem.instructorId
                ? instructorMap.get(classItem.instructorId)
                : undefined
            }
            categoryName={
              classItem.categoryId
                ? categoryMap.get(classItem.categoryId)
                : undefined
            }
            onEdit={() => onEdit(classItem)}
            onDelete={() => onDelete(classItem)}
          />
        </Grid>
      ))}
    </Grid>
  );
}
