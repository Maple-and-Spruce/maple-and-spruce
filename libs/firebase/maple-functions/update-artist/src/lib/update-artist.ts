import {
  Functions,
  Role,
  assertValid,
  throwAlreadyExists,
  throwNotFound,
} from '@maple/firebase/functions';
import { ArtistRepository } from '@maple/firebase/database';
import { artistValidation } from '@maple/ts/validation';
import type {
  UpdateArtistRequest,
  UpdateArtistResponse,
} from '@maple/ts/firebase/api-types';

export const updateArtist = Functions.endpoint
  .requiringRole(Role.Admin)
  .handle<UpdateArtistRequest, UpdateArtistResponse>(async (data) => {
    const existing = await ArtistRepository.findById(data.id);
    if (!existing) {
      throwNotFound('Artist', data.id);
    }

    // Validate against the merged record so partial updates still pass
    // full-record validation rules.
    assertValid(artistValidation({ ...existing, ...data }));

    if (data.email && data.email !== existing.email) {
      const conflict = await ArtistRepository.findByEmail(data.email);
      if (conflict) {
        throwAlreadyExists('Artist', 'email', data.email);
      }
    }

    const artist = await ArtistRepository.update(data);
    return { artist };
  });
