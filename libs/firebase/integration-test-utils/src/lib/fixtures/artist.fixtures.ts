import type { CreateArtistRequest } from '@maple/ts/firebase/api-types';

export const SAMPLE_ARTIST: CreateArtistRequest = {
  name: 'Test Artist',
  email: 'artist@test.com',
  status: 'active',
  defaultCommissionRate: 0.4,
};

export const SECOND_ARTIST: CreateArtistRequest = {
  name: 'Another Artist',
  email: 'another-artist@test.com',
  status: 'active',
  defaultCommissionRate: 0.35,
  phone: '555-0100',
  notes: 'Integration test artist',
};
