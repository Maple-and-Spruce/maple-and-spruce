'use client';

import {
  Card,
  CardContent,
  CardMedia,
  Typography,
  Box,
  Chip,
  Button,
} from '@mui/material';
import EventIcon from '@mui/icons-material/Event';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PersonIcon from '@mui/icons-material/Person';
import type { PublicClass } from '@maple/ts/domain';

interface PublicClassCardProps {
  publicClass: PublicClass;
  onRegister: (classId: string) => void;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatPrice(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

function getSpotsColor(
  remaining: number
): 'success' | 'warning' | 'error' {
  if (remaining > 5) return 'success';
  if (remaining > 0) return 'warning';
  return 'error';
}

export function PublicClassCard({
  publicClass,
  onRegister,
}: PublicClassCardProps) {
  const isFull = publicClass.spotsRemaining <= 0;

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        opacity: isFull ? 0.7 : 1,
      }}
    >
      {publicClass.imageUrl && (
        <CardMedia
          component="img"
          height={180}
          image={publicClass.imageUrl}
          alt={publicClass.name}
        />
      )}
      <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
          <Typography variant="h6" component="h2" gutterBottom>
            {publicClass.name}
          </Typography>
          <Typography variant="h6" color="primary" fontWeight={600}>
            {formatPrice(publicClass.priceCents)}
          </Typography>
        </Box>

        {publicClass.shortDescription && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {publicClass.shortDescription}
          </Typography>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <EventIcon fontSize="small" color="action" />
            <Typography variant="body2">
              {formatDate(publicClass.dateTime)}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <AccessTimeIcon fontSize="small" color="action" />
            <Typography variant="body2">
              {formatTime(publicClass.dateTime)} ({publicClass.durationMinutes}{' '}
              min)
            </Typography>
          </Box>
          {publicClass.instructorName && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <PersonIcon fontSize="small" color="action" />
              <Typography variant="body2">
                {publicClass.instructorName}
              </Typography>
            </Box>
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          {publicClass.skillLevel && (
            <Chip label={publicClass.skillLevel} size="small" variant="outlined" />
          )}
          {publicClass.categoryName && (
            <Chip label={publicClass.categoryName} size="small" />
          )}
        </Box>

        <Box sx={{ mt: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Chip
            label={
              isFull
                ? 'Full'
                : `${publicClass.spotsRemaining} spot${publicClass.spotsRemaining === 1 ? '' : 's'} left`
            }
            size="small"
            color={getSpotsColor(publicClass.spotsRemaining)}
          />
          <Button
            variant="contained"
            size="small"
            disabled={isFull}
            onClick={() => onRegister(publicClass.id)}
          >
            {isFull ? 'Full' : 'Register'}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
