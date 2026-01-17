'use client';

import { useState, useCallback } from 'react';
import {
  Box,
  Container,
  Typography,
  Button,
  AppBar,
  Toolbar,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import type { Artist, CreateArtistInput } from '@maple/ts/domain';
import {
  ArtistList,
  ArtistForm,
  DeleteConfirmDialog,
} from '../../components/artists';
import { UserMenu } from '../../components/auth';
import { useArtists } from '../../hooks';

export default function ArtistsPage() {
  // Artist state from hook (fetches on mount)
  const {
    artistsState,
    createArtist,
    updateArtist,
    deleteArtist: deleteArtistApi,
  } = useArtists();

  // Form dialog state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingArtist, setEditingArtist] = useState<Artist | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete dialog state
  const [artistToDelete, setArtistToDelete] = useState<Artist | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleOpenForm = useCallback((artist?: Artist) => {
    setEditingArtist(artist);
    setIsFormOpen(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setIsFormOpen(false);
    setEditingArtist(undefined);
  }, []);

  const handleSubmitForm = useCallback(
    async (data: CreateArtistInput) => {
      setIsSubmitting(true);

      try {
        if (editingArtist) {
          await updateArtist({ id: editingArtist.id, ...data });
        } else {
          await createArtist(data);
        }
        handleCloseForm();
      } catch (error) {
        console.error('Failed to save artist:', error);
        throw error; // Re-throw to let the form display the error
      } finally {
        setIsSubmitting(false);
      }
    },
    [editingArtist, handleCloseForm, createArtist, updateArtist]
  );

  const handleOpenDelete = useCallback((artist: Artist) => {
    setArtistToDelete(artist);
  }, []);

  const handleCloseDelete = useCallback(() => {
    setArtistToDelete(null);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!artistToDelete) return;

    setIsDeleting(true);

    try {
      await deleteArtistApi(artistToDelete.id);
      handleCloseDelete();
    } catch (error) {
      console.error('Failed to delete artist:', error);
      // TODO: Show error toast
    } finally {
      setIsDeleting(false);
    }
  }, [artistToDelete, handleCloseDelete, deleteArtistApi]);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" color="primary" elevation={1}>
        <Toolbar>
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
            Maple & Spruce
          </Typography>
          <UserMenu />
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 3,
          }}
        >
          <Typography variant="h4" component="h2">
            Artists
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenForm()}
          >
            Add Artist
          </Button>
        </Box>

        <ArtistList
          artistsState={artistsState}
          onEdit={handleOpenForm}
          onDelete={handleOpenDelete}
        />

        <ArtistForm
          open={isFormOpen}
          onClose={handleCloseForm}
          onSubmit={handleSubmitForm}
          artist={editingArtist}
          isSubmitting={isSubmitting}
        />

        <DeleteConfirmDialog
          open={!!artistToDelete}
          artist={artistToDelete}
          onClose={handleCloseDelete}
          onConfirm={handleConfirmDelete}
          isDeleting={isDeleting}
        />
      </Container>
    </Box>
  );
}
