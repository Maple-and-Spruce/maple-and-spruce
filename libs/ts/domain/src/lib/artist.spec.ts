import { describe, it, expect } from 'vitest';
import { toPublicArtist } from './artist';
import type { Artist } from './artist';

describe('toPublicArtist', () => {
  const mockArtist: Artist = {
    id: 'artist-123',
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '555-1234',
    defaultCommissionRate: 0.4,
    status: 'active',
    notes: 'Internal notes about this artist',
    photoUrl: 'https://storage.example.com/artists/jane.jpg',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-06-15'),
  };

  it('includes only public fields: id, name, photoUrl', () => {
    const publicArtist = toPublicArtist(mockArtist);

    expect(publicArtist).toEqual({
      id: 'artist-123',
      name: 'Jane Doe',
      photoUrl: 'https://storage.example.com/artists/jane.jpg',
    });
  });

  it('excludes sensitive fields: email, phone, commission, status, notes, timestamps', () => {
    const publicArtist = toPublicArtist(mockArtist);

    expect(publicArtist).not.toHaveProperty('email');
    expect(publicArtist).not.toHaveProperty('phone');
    expect(publicArtist).not.toHaveProperty('defaultCommissionRate');
    expect(publicArtist).not.toHaveProperty('status');
    expect(publicArtist).not.toHaveProperty('notes');
    expect(publicArtist).not.toHaveProperty('createdAt');
    expect(publicArtist).not.toHaveProperty('updatedAt');
  });

  it('handles artist without optional photoUrl', () => {
    const artistWithoutPhoto: Artist = {
      ...mockArtist,
      photoUrl: undefined,
    };

    const publicArtist = toPublicArtist(artistWithoutPhoto);

    expect(publicArtist).toEqual({
      id: 'artist-123',
      name: 'Jane Doe',
      photoUrl: undefined,
    });
  });

  it('handles artist without optional phone and notes', () => {
    const minimalArtist: Artist = {
      id: 'artist-456',
      name: 'John Smith',
      email: 'john@example.com',
      defaultCommissionRate: 0.35,
      status: 'active',
      createdAt: new Date('2025-03-01'),
      updatedAt: new Date('2025-03-01'),
    };

    const publicArtist = toPublicArtist(minimalArtist);

    expect(publicArtist).toEqual({
      id: 'artist-456',
      name: 'John Smith',
      photoUrl: undefined,
    });
  });

  it('works with inactive artists (filtering should happen at query level)', () => {
    const inactiveArtist: Artist = {
      ...mockArtist,
      status: 'inactive',
    };

    // Function still works - filtering is caller's responsibility
    const publicArtist = toPublicArtist(inactiveArtist);

    expect(publicArtist.id).toBe('artist-123');
    expect(publicArtist).not.toHaveProperty('status');
  });
});
