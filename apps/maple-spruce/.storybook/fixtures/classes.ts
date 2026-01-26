import type { Class, ClassCategory } from '@maple/ts/domain';

/**
 * Mock class data for Storybook stories
 */

// Helper to get a future date
const futureDate = (daysFromNow: number, hour = 10): Date => {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, 0, 0, 0);
  return date;
};

// Helper to get a past date
const pastDate = (daysAgo: number, hour = 10): Date => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return date;
};

export const mockClass: Class = {
  id: 'class-001',
  name: 'Introduction to Weaving',
  description:
    'Learn the fundamentals of weaving in this beginner-friendly workshop. You will create a small wall hanging using a rigid heddle loom. All materials are included, and you will take home your finished piece along with resources to continue learning.',
  shortDescription:
    'Create your first woven wall hanging in this hands-on beginner workshop.',
  instructorId: 'instructor-001',
  dateTime: futureDate(14, 10), // 2 weeks from now at 10am
  durationMinutes: 180,
  capacity: 8,
  priceCents: 7500,
  imageUrl: 'https://picsum.photos/seed/weaving/800/600',
  categoryId: 'cat-fiber',
  skillLevel: 'beginner',
  status: 'published',
  location: 'Maple & Spruce Studio',
  materialsIncluded: 'Rigid heddle loom (loaner), yarn, shuttle, tapestry needle',
  whatToBring: 'Notebook for notes, reading glasses if needed',
  createdAt: new Date('2024-01-15T10:00:00Z'),
  updatedAt: new Date('2024-06-20T14:30:00Z'),
};

export const mockClass2: Class = {
  id: 'class-002',
  name: 'Wheel Throwing Basics',
  description:
    'Discover the meditative art of wheel throwing in this introductory pottery class. You will learn to center clay, pull walls, and create simple forms like bowls and cups. Your pieces will be bisque-fired and ready for pickup in 2 weeks.',
  shortDescription: 'Learn to throw pottery on the wheel in this hands-on intro class.',
  instructorId: 'instructor-002',
  dateTime: futureDate(7, 14), // 1 week from now at 2pm
  durationMinutes: 150,
  capacity: 6,
  priceCents: 6500,
  imageUrl: 'https://picsum.photos/seed/pottery/800/600',
  categoryId: 'cat-pottery',
  skillLevel: 'beginner',
  status: 'published',
  location: 'Maple & Spruce Studio',
  materialsIncluded: 'Clay, glazes, firing',
  whatToBring: 'Clothes that can get dirty, hair tie if needed',
  minimumAge: 16,
  createdAt: new Date('2024-02-10T09:00:00Z'),
  updatedAt: new Date('2024-05-15T16:45:00Z'),
};

export const mockClassDraft: Class = {
  id: 'class-003',
  name: 'Advanced Tapestry Techniques',
  description:
    'Take your weaving to the next level with advanced tapestry techniques including color blending, hatching, and pictorial design. This workshop is designed for weavers with experience who want to explore more complex patterns.',
  shortDescription: 'Explore advanced tapestry weaving techniques.',
  instructorId: 'instructor-001',
  dateTime: futureDate(30, 10), // 1 month from now
  durationMinutes: 240,
  capacity: 6,
  priceCents: 12500,
  categoryId: 'cat-fiber',
  skillLevel: 'advanced',
  status: 'draft',
  location: 'Maple & Spruce Studio',
  materialsIncluded: 'Specialty yarns, tapestry loom rental',
  createdAt: new Date('2024-08-01T10:00:00Z'),
  updatedAt: new Date('2024-08-01T10:00:00Z'),
};

export const mockClassCancelled: Class = {
  id: 'class-004',
  name: 'Natural Dyeing Workshop',
  description:
    'Learn to create beautiful, sustainable colors using plants, minerals, and other natural materials. This workshop covers mordanting, dye extraction, and creating a personal color palette.',
  shortDescription: 'Create natural dyes from plants and minerals.',
  instructorId: 'instructor-005',
  dateTime: futureDate(10, 10),
  durationMinutes: 180,
  capacity: 10,
  priceCents: 8500,
  categoryId: 'cat-fiber',
  skillLevel: 'all-levels',
  status: 'cancelled',
  createdAt: new Date('2024-07-15T10:00:00Z'),
  updatedAt: new Date('2024-07-20T11:00:00Z'),
};

export const mockClassCompleted: Class = {
  id: 'class-005',
  name: 'Wire Wrapping Jewelry',
  description:
    'Create beautiful wire-wrapped jewelry in this beginner-friendly workshop. You will make a pendant and a pair of earrings using copper and silver-plated wire.',
  shortDescription: 'Make wire-wrapped jewelry to wear or gift.',
  instructorId: 'instructor-003',
  dateTime: pastDate(14, 14), // 2 weeks ago
  durationMinutes: 120,
  capacity: 8,
  priceCents: 5500,
  imageUrl: 'https://picsum.photos/seed/jewelry/800/600',
  categoryId: 'cat-jewelry',
  skillLevel: 'beginner',
  status: 'completed',
  location: 'Maple & Spruce Studio',
  materialsIncluded: 'Wire, beads, findings, tools (loaner)',
  createdAt: new Date('2024-05-01T10:00:00Z'),
  updatedAt: new Date('2024-06-01T16:00:00Z'),
};

export const mockClassNoImage: Class = {
  id: 'class-006',
  name: 'Hand Building Clay Workshop',
  description:
    'Explore clay without the wheel! Learn hand building techniques including pinch pots, coil building, and slab construction. Perfect for all skill levels.',
  shortDescription: 'Create pottery without a wheel using hand building techniques.',
  instructorId: 'instructor-002',
  dateTime: futureDate(21, 18), // 3 weeks from now, evening
  durationMinutes: 150,
  capacity: 10,
  priceCents: 5500,
  categoryId: 'cat-pottery',
  skillLevel: 'all-levels',
  status: 'published',
  location: 'Maple & Spruce Studio',
  materialsIncluded: 'Clay, glazes, firing',
  createdAt: new Date('2024-09-01T10:00:00Z'),
  updatedAt: new Date('2024-09-01T10:00:00Z'),
};

export const mockClassIntermediate: Class = {
  id: 'class-007',
  name: 'Color Theory in Weaving',
  description:
    'Deepen your understanding of color relationships and how they translate to woven textiles. This intermediate workshop covers color mixing, value contrast, and creating harmonious palettes for your weaving projects.',
  shortDescription: 'Learn color theory principles for weavers.',
  instructorId: 'instructor-001',
  dateTime: futureDate(28, 10),
  durationMinutes: 180,
  capacity: 8,
  priceCents: 8500,
  imageUrl: 'https://picsum.photos/seed/colorweave/800/600',
  categoryId: 'cat-fiber',
  skillLevel: 'intermediate',
  status: 'published',
  location: 'Maple & Spruce Studio',
  createdAt: new Date('2024-09-15T10:00:00Z'),
  updatedAt: new Date('2024-09-15T10:00:00Z'),
};

export const mockClassNoInstructor: Class = {
  id: 'class-008',
  name: 'Open Studio Time',
  description:
    'Use our studio space and equipment for your own projects. Staff available for questions but this is not an instructed class.',
  shortDescription: 'Independent studio time with equipment access.',
  dateTime: futureDate(5, 12),
  durationMinutes: 180,
  capacity: 12,
  priceCents: 2500,
  skillLevel: 'all-levels',
  status: 'published',
  location: 'Maple & Spruce Studio',
  createdAt: new Date('2024-10-01T10:00:00Z'),
  updatedAt: new Date('2024-10-01T10:00:00Z'),
};

export const mockClasses: Class[] = [
  mockClass,
  mockClass2,
  mockClassDraft,
  mockClassCancelled,
  mockClassCompleted,
  mockClassNoImage,
  mockClassIntermediate,
  mockClassNoInstructor,
];

export const mockPublishedClasses: Class[] = mockClasses.filter(
  (c) => c.status === 'published'
);

export const mockUpcomingClasses: Class[] = mockClasses.filter(
  (c) => c.status === 'published' && c.dateTime > new Date()
);

/**
 * Mock class categories
 */
export const mockClassCategory: ClassCategory = {
  id: 'cat-fiber',
  name: 'Fiber Arts',
  description: 'Weaving, spinning, dyeing, and other textile arts.',
  order: 0,
  createdAt: new Date('2024-01-01T10:00:00Z'),
  updatedAt: new Date('2024-01-01T10:00:00Z'),
};

export const mockClassCategory2: ClassCategory = {
  id: 'cat-pottery',
  name: 'Pottery & Ceramics',
  description: 'Wheel throwing, hand building, glazing, and firing techniques.',
  order: 1,
  createdAt: new Date('2024-01-01T10:00:00Z'),
  updatedAt: new Date('2024-01-01T10:00:00Z'),
};

export const mockClassCategory3: ClassCategory = {
  id: 'cat-jewelry',
  name: 'Jewelry Making',
  description: 'Wire wrapping, metalsmithing, and jewelry design.',
  order: 2,
  createdAt: new Date('2024-01-01T10:00:00Z'),
  updatedAt: new Date('2024-01-01T10:00:00Z'),
};

export const mockClassCategories: ClassCategory[] = [
  mockClassCategory,
  mockClassCategory2,
  mockClassCategory3,
];
