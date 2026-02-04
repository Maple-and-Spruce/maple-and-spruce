'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Grid2 as Grid,
  CircularProgress,
  Alert,
  Container,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import { PublicClassCard } from '@maple/react/registrations';
import type { PublicClass, ClassSkillLevel } from '@maple/ts/domain';
import type {
  GetPublicClassesRequest,
  GetPublicClassesResponse,
} from '@maple/ts/firebase/api-types';

export default function RegisterPage() {
  const router = useRouter();
  const [classes, setClasses] = useState<PublicClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skillLevelFilter, setSkillLevelFilter] = useState<string>('');

  const fetchClasses = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const functions = getMapleFunctions();
      const getPublicClasses = httpsCallable<
        GetPublicClassesRequest,
        GetPublicClassesResponse
      >(functions, 'getPublicClasses');

      const result = await getPublicClasses({
        upcoming: true,
        skillLevel: (skillLevelFilter as ClassSkillLevel) || undefined,
      });

      setClasses(result.data.classes);
    } catch (err) {
      console.error('Failed to fetch classes:', err);
      setError('Unable to load classes. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  }, [skillLevelFilter]);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  const handleRegister = useCallback(
    (classId: string) => {
      router.push(`/register/${classId}`);
    },
    [router]
  );

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        py: 4,
      }}
    >
      <Container maxWidth="lg">
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Typography variant="h3" component="h1" gutterBottom>
            Classes & Workshops
          </Typography>
          <Typography variant="h6" color="text.secondary">
            Maple & Spruce Folk Arts Collective
          </Typography>
        </Box>

        {/* Filters */}
        <Box sx={{ display: 'flex', gap: 2, mb: 3, justifyContent: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Skill Level</InputLabel>
            <Select
              value={skillLevelFilter}
              label="Skill Level"
              onChange={(e) => setSkillLevelFilter(e.target.value)}
            >
              <MenuItem value="">
                <em>All Levels</em>
              </MenuItem>
              <MenuItem value="beginner">Beginner</MenuItem>
              <MenuItem value="intermediate">Intermediate</MenuItem>
              <MenuItem value="advanced">Advanced</MenuItem>
              <MenuItem value="all-levels">All Levels</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {/* Loading State */}
        {isLoading && (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              py: 8,
            }}
          >
            <CircularProgress />
          </Box>
        )}

        {/* Error State */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Empty State */}
        {!isLoading && !error && classes.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h6" color="text.secondary">
              No upcoming classes available at this time.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Check back soon for new offerings!
            </Typography>
          </Box>
        )}

        {/* Class Grid */}
        {!isLoading && classes.length > 0 && (
          <Grid container spacing={3}>
            {classes.map((publicClass) => (
              <Grid key={publicClass.id} size={{ xs: 12, sm: 6, md: 4 }}>
                <PublicClassCard
                  publicClass={publicClass}
                  onRegister={handleRegister}
                />
              </Grid>
            ))}
          </Grid>
        )}
      </Container>
    </Box>
  );
}
