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
  Avatar,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonIcon from '@mui/icons-material/Person';
import type { Instructor } from '@maple/ts/domain';
import type { RequestState } from '@maple/ts/domain';

interface InstructorListProps {
  instructorsState: RequestState<Instructor[]>;
  onEdit: (instructor: Instructor) => void;
  onDelete: (instructor: Instructor) => void;
}

const statusColors: Record<string, 'success' | 'default'> = {
  active: 'success',
  inactive: 'default',
};

function InstructorCard({
  instructor,
  onEdit,
  onDelete,
}: {
  instructor: Instructor;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card>
      {/* Instructor Photo */}
      {instructor.photoUrl ? (
        <CardMedia
          component="img"
          height="200"
          image={instructor.photoUrl}
          alt={instructor.name}
          sx={{ objectFit: 'cover' }}
        />
      ) : (
        <Box
          sx={{
            height: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'grey.100',
          }}
        >
          <Avatar sx={{ width: 80, height: 80, bgcolor: 'grey.300' }}>
            <PersonIcon sx={{ fontSize: 48, color: 'grey.500' }} />
          </Avatar>
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
            <Typography variant="h6" component="h3">
              {instructor.name}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {instructor.email}
            </Typography>
            {instructor.phone && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {instructor.phone}
              </Typography>
            )}
            {instructor.bio && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  mb: 1,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {instructor.bio}
              </Typography>
            )}
            {instructor.specialties && instructor.specialties.length > 0 && (
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
                {instructor.specialties.slice(0, 3).map((specialty) => (
                  <Chip
                    key={specialty}
                    label={specialty}
                    size="small"
                    variant="outlined"
                  />
                ))}
                {instructor.specialties.length > 3 && (
                  <Chip
                    label={`+${instructor.specialties.length - 3}`}
                    size="small"
                    variant="outlined"
                  />
                )}
              </Box>
            )}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip
                label={instructor.status}
                size="small"
                color={statusColors[instructor.status]}
              />
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
            <Skeleton variant="rectangular" height={200} />
            <CardContent>
              <Skeleton variant="text" width="60%" height={32} />
              <Skeleton variant="text" width="80%" />
              <Skeleton variant="text" width="50%" />
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Skeleton variant="rounded" width={80} height={24} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}

export function InstructorList({
  instructorsState,
  onEdit,
  onDelete,
}: InstructorListProps) {
  if (instructorsState.status === 'loading') {
    return <LoadingSkeleton />;
  }

  if (instructorsState.status === 'error') {
    return (
      <Alert severity="error">
        Failed to load instructors: {instructorsState.error}
      </Alert>
    );
  }

  if (instructorsState.status === 'idle') {
    return null;
  }

  const instructors = instructorsState.data;

  if (instructors.length === 0) {
    return (
      <Box
        sx={{
          textAlign: 'center',
          py: 8,
          color: 'text.secondary',
        }}
      >
        <Typography variant="h6">No instructors yet</Typography>
        <Typography>Click "Add Instructor" to get started</Typography>
      </Box>
    );
  }

  return (
    <Grid container spacing={2}>
      {instructors.map((instructor) => (
        <Grid size={{ xs: 12, sm: 6, md: 4 }} key={instructor.id}>
          <InstructorCard
            instructor={instructor}
            onEdit={() => onEdit(instructor)}
            onDelete={() => onDelete(instructor)}
          />
        </Grid>
      ))}
    </Grid>
  );
}
