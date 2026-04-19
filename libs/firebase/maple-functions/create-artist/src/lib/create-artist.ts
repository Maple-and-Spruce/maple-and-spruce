import { Functions, Role } from '@maple/firebase/functions';
import { ArtistRepository } from '@maple/firebase/database';
import { artistValidation } from '@maple/ts/validation';
import type {
  CreateArtistRequest,
  CreateArtistResponse,
} from '@maple/ts/firebase/api-types';

export const createArtist = Functions.endpoint
  .requiringRole(Role.Admin)
  .validating(artistValidation)
  .ensuringUnique<CreateArtistRequest>({
    entity: 'Artist',
    field: 'email',
    exists: async (email) =>
      (await ArtistRepository.findByEmail(email)) !== undefined,
  })
  .handle<CreateArtistRequest, CreateArtistResponse>(async (data) => {
    const artist = await ArtistRepository.create(data);
    return { artist };
  });
