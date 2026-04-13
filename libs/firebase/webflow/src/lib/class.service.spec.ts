import { describe, it, expect } from 'vitest';
import { generateClassSlug, mapClassToFieldData } from './class.service';
import type { Class } from '@maple/ts/domain';

describe('generateClassSlug', () => {
  it('converts name to lowercase with hyphens', () => {
    expect(generateClassSlug('Pottery 101')).toBe('pottery-101');
  });

  it('removes special characters', () => {
    expect(generateClassSlug("Beginner's Knitting")).toBe('beginner-s-knitting');
    expect(generateClassSlug('Weaving & Dyeing')).toBe('weaving-dyeing');
  });

  it('handles multiple spaces and hyphens', () => {
    expect(generateClassSlug('Intro to  Woodworking')).toBe(
      'intro-to-woodworking'
    );
    expect(generateClassSlug('---Test Class---')).toBe('test-class');
  });

  it('handles empty strings', () => {
    expect(generateClassSlug('')).toBe('');
  });
});

describe('mapClassToFieldData', () => {
  const mockClass: Class = {
    id: 'class-abc',
    name: 'Pottery 101',
    description: 'Learn the basics of pottery',
    shortDescription: 'Intro to pottery',
    instructorId: 'inst-1',
    dateTime: new Date('2026-05-15T14:00:00.000Z'),
    durationMinutes: 120,
    capacity: 10,
    priceCents: 4500,
    imageUrl: 'https://storage.example.com/pottery.jpg',
    categoryId: 'cat-1',
    skillLevel: 'beginner',
    status: 'published',
    location: 'Main Studio',
    materialsIncluded: 'Clay, glazes, tools',
    whatToBring: 'Apron, towel',
    minimumAge: 12,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  it('maps required fields', () => {
    const result = mapClassToFieldData(mockClass, { isDev: false });

    expect(result['firebase-id']).toBe('class-abc');
    expect(result.name).toBe('Pottery 101');
    expect(result.slug).toBe('pottery-101');
    expect(result['is-dev-environment']).toBe(false);
    expect(result['date-time']).toBe('2026-05-15T14:00:00.000Z');
    expect(result['duration-minutes']).toBe(120);
    expect(result['price-cents']).toBe(4500);
    expect(result.capacity).toBe(10);
  });

  it('formats date and time display correctly', () => {
    const result = mapClassToFieldData(mockClass, { isDev: false });
    // Date should be formatted as a readable date string
    expect(result['date-display']).toContain('2026');
    expect(result['date-display']).toContain('May');
    expect(result['date-display']).toContain('15');
    // Time should be formatted as readable time
    expect(result['time-display']).toMatch(/\d{1,2}:\d{2}\s*(AM|PM)/);
  });

  it('formats price display correctly', () => {
    expect(mapClassToFieldData(mockClass, { isDev: false })['price-display']).toBe('$45');

    const freeClass = { ...mockClass, priceCents: 0 };
    expect(mapClassToFieldData(freeClass, { isDev: false })['price-display']).toBe('Free');

    const decimalClass = { ...mockClass, priceCents: 4550 };
    expect(mapClassToFieldData(decimalClass, { isDev: false })['price-display']).toBe('$45.50');
  });

  it('formats duration display correctly', () => {
    expect(mapClassToFieldData(mockClass, { isDev: false })['duration-display']).toBe('2 hours');

    const oneHour = { ...mockClass, durationMinutes: 60 };
    expect(mapClassToFieldData(oneHour, { isDev: false })['duration-display']).toBe('1 hour');

    const ninety = { ...mockClass, durationMinutes: 90 };
    expect(mapClassToFieldData(ninety, { isDev: false })['duration-display']).toBe('1.5 hours');

    const short = { ...mockClass, durationMinutes: 45 };
    expect(mapClassToFieldData(short, { isDev: false })['duration-display']).toBe('45 min');
  });

  it('formats spots display correctly', () => {
    expect(
      mapClassToFieldData(mockClass, { isDev: false, registrationCount: 9 })['spots-display']
    ).toBe('1 spot remaining');

    expect(
      mapClassToFieldData(mockClass, { isDev: false, registrationCount: 3 })['spots-display']
    ).toBe('7 spots remaining');

    expect(
      mapClassToFieldData(mockClass, { isDev: false, registrationCount: 10 })['spots-display']
    ).toBe('Class Full');
  });

  it('sets isDev flag correctly', () => {
    const result = mapClassToFieldData(mockClass, { isDev: true });
    expect(result['is-dev-environment']).toBe(true);
  });

  it('calculates spots remaining from registration count', () => {
    const result = mapClassToFieldData(mockClass, {
      isDev: false,
      registrationCount: 3,
    });
    expect(result['spots-remaining']).toBe(7);
  });

  it('defaults spots remaining to full capacity when no registration count', () => {
    const result = mapClassToFieldData(mockClass, { isDev: false });
    expect(result['spots-remaining']).toBe(10);
  });

  it('maps skill level with proper capitalization', () => {
    expect(
      mapClassToFieldData(mockClass, { isDev: false })['skill-level']
    ).toBe('Beginner');

    const advancedClass = { ...mockClass, skillLevel: 'all-levels' as const };
    expect(
      mapClassToFieldData(advancedClass, { isDev: false })['skill-level']
    ).toBe('All Levels');
  });

  it('includes optional fields when present', () => {
    const result = mapClassToFieldData(mockClass, {
      isDev: false,
      instructorName: 'Jane Doe',
      instructorBio: 'Jane has been teaching pottery for 15 years.',
      instructorImage: 'https://storage.example.com/instructors/jane.jpg',
      categoryName: 'Ceramics',
    });

    expect(result['short-description']).toBe('Intro to pottery');
    expect(result.description).toBe('Learn the basics of pottery');
    expect(result.location).toBe('Main Studio');
    expect(result['materials-included']).toBe('Clay, glazes, tools');
    expect(result['what-to-bring']).toBe('Apron, towel');
    expect(result['minimum-age']).toBe(12);
    expect(result['instructor-name']).toBe('Jane Doe');
    expect(result['instructor-bio']).toBe(
      'Jane has been teaching pottery for 15 years.'
    );
    expect(result['instructor-image']).toEqual({
      url: 'https://storage.example.com/instructors/jane.jpg',
      alt: 'Jane Doe profile photo',
    });
    expect(result['category-name']).toBe('Ceramics');
    expect(result['class-image']).toEqual({
      url: 'https://storage.example.com/pottery.jpg',
      alt: 'Pottery 101 class image',
    });
  });

  it('uses fallback alt text for instructor image when no name provided', () => {
    const result = mapClassToFieldData(mockClass, {
      isDev: false,
      instructorImage: 'https://storage.example.com/instructors/jane.jpg',
    });

    expect(result['instructor-image']).toEqual({
      url: 'https://storage.example.com/instructors/jane.jpg',
      alt: 'Instructor profile photo',
    });
  });

  it('omits optional fields when not present', () => {
    const minimalClass: Class = {
      id: 'class-min',
      name: 'Basic Class',
      description: 'A basic class',
      dateTime: new Date('2026-06-01T10:00:00.000Z'),
      durationMinutes: 60,
      capacity: 8,
      priceCents: 2500,
      skillLevel: 'all-levels',
      status: 'published',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = mapClassToFieldData(minimalClass, { isDev: false });

    expect(result['short-description']).toBeUndefined();
    expect(result['class-image']).toBeUndefined();
    expect(result.location).toBeUndefined();
    expect(result['materials-included']).toBeUndefined();
    expect(result['what-to-bring']).toBeUndefined();
    expect(result['minimum-age']).toBeUndefined();
    expect(result['instructor-name']).toBeUndefined();
    expect(result['instructor-bio']).toBeUndefined();
    expect(result['instructor-image']).toBeUndefined();
    expect(result['category-name']).toBeUndefined();
  });
});
