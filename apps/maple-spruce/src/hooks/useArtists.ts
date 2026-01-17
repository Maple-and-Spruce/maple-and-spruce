'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  Artist,
  CreateArtistInput,
  UpdateArtistInput,
  RequestState,
} from '@maple/ts/domain';
import type {
  GetArtistsRequest,
  GetArtistsResponse,
  CreateArtistRequest,
  CreateArtistResponse,
  UpdateArtistRequest,
  UpdateArtistResponse,
  DeleteArtistRequest,
  DeleteArtistResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Hook for managing artist CRUD operations
 *
 * Provides state management and API calls for the artist management system.
 */
export function useArtists() {
  const [artistsState, setArtistsState] = useState<RequestState<Artist[]>>({
    status: 'idle',
  });

  const fetchArtists = useCallback(async () => {
    setArtistsState({ status: 'loading' });

    try {
      const functions = getMapleFunctions();
      const getArtists = httpsCallable<GetArtistsRequest, GetArtistsResponse>(
        functions,
        'getArtists'
      );

      const result = await getArtists({});
      setArtistsState({
        status: 'success',
        data: result.data.artists,
      });
    } catch (error) {
      console.error('Failed to fetch artists:', error);
      setArtistsState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to fetch artists',
      });
    }
  }, []);

  const createArtist = useCallback(
    async (input: CreateArtistInput): Promise<Artist> => {
      const functions = getMapleFunctions();
      const create = httpsCallable<CreateArtistRequest, CreateArtistResponse>(
        functions,
        'createArtist'
      );

      const result = await create(input);

      // Add the new artist to state
      setArtistsState((prev) => {
        if (prev.status !== 'success') return prev;
        // Sort by name after adding
        const newData = [...prev.data, result.data.artist].sort((a, b) =>
          a.name.localeCompare(b.name)
        );
        return {
          ...prev,
          data: newData,
        };
      });

      return result.data.artist;
    },
    []
  );

  const updateArtist = useCallback(
    async (input: UpdateArtistInput): Promise<Artist> => {
      const functions = getMapleFunctions();
      const update = httpsCallable<UpdateArtistRequest, UpdateArtistResponse>(
        functions,
        'updateArtist'
      );

      const result = await update(input);

      // Update the artist in state and re-sort
      setArtistsState((prev) => {
        if (prev.status !== 'success') return prev;
        const newData = prev.data
          .map((a) => (a.id === result.data.artist.id ? result.data.artist : a))
          .sort((a, b) => a.name.localeCompare(b.name));
        return {
          ...prev,
          data: newData,
        };
      });

      return result.data.artist;
    },
    []
  );

  const deleteArtist = useCallback(async (id: string): Promise<void> => {
    const functions = getMapleFunctions();
    const del = httpsCallable<DeleteArtistRequest, DeleteArtistResponse>(
      functions,
      'deleteArtist'
    );

    await del({ id });

    // Remove the artist from state
    setArtistsState((prev) => {
      if (prev.status !== 'success') return prev;
      return {
        ...prev,
        data: prev.data.filter((a) => a.id !== id),
      };
    });
  }, []);

  // Fetch artists on mount
  useEffect(() => {
    fetchArtists();
  }, [fetchArtists]);

  return {
    artistsState,
    fetchArtists,
    createArtist,
    updateArtist,
    deleteArtist,
  };
}
