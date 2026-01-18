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
import type { Artist } from '@maple/ts/domain';
import type { RequestState } from '@maple/ts/domain';

interface ArtistListProps {
  artistsState: RequestState<Artist[]>;
  onEdit: (artist: Artist) => void;
  onDelete: (artist: Artist) => void;
}

const statusColors: Record<string, 'success' | 'default'> = {
  active: 'success',
  inactive: 'default',
};

/**
 * Format commission rate as percentage
 */
function formatCommission(rate: number): string {
  return `${(rate * 100).toFixed(0)}% store / ${((1 - rate) * 100).toFixed(0)}% artist`;
}

function ArtistCard({
  artist,
  onEdit,
  onDelete,
}: {
  artist: Artist;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card>
      {/* Artist Photo */}
      {artist.photoUrl ? (
        <CardMedia
          component="img"
          height="200"
          image={artist.photoUrl}
          alt={artist.name}
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
              {artist.name}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {artist.email}
            </Typography>
            {artist.phone && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {artist.phone}
              </Typography>
            )}
            <Typography variant="body2" sx={{ mb: 1 }}>
              Commission: {formatCommission(artist.defaultCommissionRate)}
            </Typography>
            {artist.notes && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mb: 1, fontStyle: 'italic' }}
              >
                {artist.notes}
              </Typography>
            )}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip
                label={artist.status}
                size="small"
                color={statusColors[artist.status]}
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

export function ArtistList({
  artistsState,
  onEdit,
  onDelete,
}: ArtistListProps) {
  if (artistsState.status === 'loading') {
    return <LoadingSkeleton />;
  }

  if (artistsState.status === 'error') {
    return (
      <Alert severity="error">
        Failed to load artists: {artistsState.error}
      </Alert>
    );
  }

  if (artistsState.status === 'idle') {
    return null;
  }

  const artists = artistsState.data;

  if (artists.length === 0) {
    return (
      <Box
        sx={{
          textAlign: 'center',
          py: 8,
          color: 'text.secondary',
        }}
      >
        <Typography variant="h6">No artists yet</Typography>
        <Typography>Click "Add Artist" to get started</Typography>
      </Box>
    );
  }

  return (
    <Grid container spacing={2}>
      {artists.map((artist) => (
        <Grid size={{ xs: 12, sm: 6, md: 4 }} key={artist.id}>
          <ArtistCard
            artist={artist}
            onEdit={() => onEdit(artist)}
            onDelete={() => onDelete(artist)}
          />
        </Grid>
      ))}
    </Grid>
  );
}
