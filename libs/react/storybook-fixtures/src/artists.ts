import type { Artist } from '@maple/ts/domain';

/**
 * Mock artist data for Storybook stories
 */

export const mockArtist: Artist = {
  id: 'artist-001',
  name: 'Sarah Johnson',
  email: 'sarah@example.com',
  phone: '304-555-0123',
  defaultCommissionRate: 0.4,
  status: 'active',
  notes: 'Specializes in hand-thrown pottery and ceramic art.',
  photoUrl: 'https://picsum.photos/seed/artist1/200/200',
  createdAt: new Date('2024-01-15T10:00:00Z'),
  updatedAt: new Date('2024-06-20T14:30:00Z'),
};

export const mockArtist2: Artist = {
  id: 'artist-002',
  name: 'Michael Chen',
  email: 'michael@example.com',
  defaultCommissionRate: 0.35,
  status: 'active',
  photoUrl: 'https://picsum.photos/seed/artist2/200/200',
  createdAt: new Date('2024-02-10T09:00:00Z'),
  updatedAt: new Date('2024-05-15T16:45:00Z'),
};

export const mockArtistInactive: Artist = {
  id: 'artist-003',
  name: 'Emily Rodriguez',
  email: 'emily@example.com',
  phone: '304-555-0456',
  defaultCommissionRate: 0.45,
  status: 'inactive',
  notes: 'On sabbatical until spring 2025.',
  createdAt: new Date('2023-06-01T11:00:00Z'),
  updatedAt: new Date('2024-09-01T08:00:00Z'),
};

export const mockArtistNoPhoto: Artist = {
  id: 'artist-004',
  name: 'David Thompson',
  email: 'david@example.com',
  defaultCommissionRate: 0.4,
  status: 'active',
  createdAt: new Date('2024-08-05T12:00:00Z'),
  updatedAt: new Date('2024-08-05T12:00:00Z'),
};

export const mockArtists: Artist[] = [
  mockArtist,
  mockArtist2,
  mockArtistInactive,
  mockArtistNoPhoto,
];

export const mockActiveArtists: Artist[] = mockArtists.filter(
  (a) => a.status === 'active'
);
