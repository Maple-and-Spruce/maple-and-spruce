import { describe, it, expect } from 'vitest';
import { generateSlug, mapArtistToFieldData } from './artist.service';
import type { Artist } from '@maple/ts/domain';

describe('generateSlug', () => {
  it('converts name to lowercase', () => {
    expect(generateSlug('John Doe')).toBe('john-doe');
  });

  it('replaces spaces with hyphens', () => {
    expect(generateSlug('Jane Smith')).toBe('jane-smith');
  });

  it('removes special characters', () => {
    expect(generateSlug("O'Brien")).toBe('o-brien');
    expect(generateSlug('Smith & Sons')).toBe('smith-sons');
    expect(generateSlug('Name (Test)')).toBe('name-test');
  });

  it('handles multiple consecutive special characters', () => {
    expect(generateSlug('Test...Name')).toBe('test-name');
    expect(generateSlug('A & B & C')).toBe('a-b-c');
  });

  it('removes leading and trailing hyphens', () => {
    expect(generateSlug('  Name  ')).toBe('name');
    expect(generateSlug('-Name-')).toBe('name');
    expect(generateSlug('---Test---')).toBe('test');
  });

  it('handles names with numbers', () => {
    expect(generateSlug('Studio 54')).toBe('studio-54');
    expect(generateSlug('24Seven')).toBe('24seven');
  });

  it('handles single word names', () => {
    expect(generateSlug('Artist')).toBe('artist');
  });

  it('handles empty strings', () => {
    expect(generateSlug('')).toBe('');
  });

  it('handles names with accented characters', () => {
    // Accented characters are removed (not transliterated)
    expect(generateSlug('José García')).toBe('jos-garc-a');
  });

  it('handles complex real-world names', () => {
    expect(generateSlug('Mary Jane Watson-Parker')).toBe(
      'mary-jane-watson-parker'
    );
    expect(generateSlug("Dr. John O'Neill III")).toBe('dr-john-o-neill-iii');
  });
});

describe('mapArtistToFieldData', () => {
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

  const prodOptions = { isDev: false };
  const devOptions = { isDev: true };

  it('maps firebase-id correctly', () => {
    const fieldData = mapArtistToFieldData(mockArtist, prodOptions);
    expect(fieldData['firebase-id']).toBe('artist-123');
  });

  it('maps name correctly', () => {
    const fieldData = mapArtistToFieldData(mockArtist, prodOptions);
    expect(fieldData.name).toBe('Jane Doe');
  });

  it('generates slug from name', () => {
    const fieldData = mapArtistToFieldData(mockArtist, prodOptions);
    expect(fieldData.slug).toBe('jane-doe');
  });

  it('sets is-dev-environment to false for prod', () => {
    const fieldData = mapArtistToFieldData(mockArtist, prodOptions);
    expect(fieldData['is-dev-environment']).toBe(false);
  });

  it('sets is-dev-environment to true for dev', () => {
    const fieldData = mapArtistToFieldData(mockArtist, devOptions);
    expect(fieldData['is-dev-environment']).toBe(true);
  });

  it('includes profile-image when photoUrl is present', () => {
    const fieldData = mapArtistToFieldData(mockArtist, prodOptions);
    expect(fieldData['profile-image']).toEqual({
      url: 'https://storage.example.com/artists/jane.jpg',
      alt: 'Jane Doe profile photo',
    });
  });

  it('omits profile-image when photoUrl is undefined', () => {
    const artistWithoutPhoto: Artist = {
      ...mockArtist,
      photoUrl: undefined,
    };
    const fieldData = mapArtistToFieldData(artistWithoutPhoto, prodOptions);
    expect(fieldData['profile-image']).toBeUndefined();
  });

  it('excludes sensitive fields like email and commission rate', () => {
    const fieldData = mapArtistToFieldData(mockArtist, prodOptions);
    expect(fieldData).not.toHaveProperty('email');
    expect(fieldData).not.toHaveProperty('phone');
    expect(fieldData).not.toHaveProperty('defaultCommissionRate');
    expect(fieldData).not.toHaveProperty('notes');
    expect(fieldData).not.toHaveProperty('status');
    expect(fieldData).not.toHaveProperty('createdAt');
    expect(fieldData).not.toHaveProperty('updatedAt');
  });

  it('includes only the expected synced fields', () => {
    const fieldData = mapArtistToFieldData(mockArtist, prodOptions);
    const keys = Object.keys(fieldData);
    expect(keys).toHaveLength(5); // firebase-id, name, slug, is-dev-environment, profile-image
    expect(keys).toContain('firebase-id');
    expect(keys).toContain('name');
    expect(keys).toContain('slug');
    expect(keys).toContain('is-dev-environment');
    expect(keys).toContain('profile-image');
  });

  it('handles artist with special characters in name', () => {
    const artistWithSpecialName: Artist = {
      ...mockArtist,
      id: 'artist-special',
      name: "Mary O'Brien & Co.",
    };
    const fieldData = mapArtistToFieldData(artistWithSpecialName, prodOptions);
    expect(fieldData.name).toBe("Mary O'Brien & Co.");
    expect(fieldData.slug).toBe('mary-o-brien-co');
  });

  it('generates correct alt text for profile image', () => {
    const fieldData = mapArtistToFieldData(mockArtist, prodOptions);
    expect(fieldData['profile-image']?.alt).toBe('Jane Doe profile photo');
  });
});
