import type { Instructor } from '@maple/ts/domain';

/**
 * Mock instructor data for Storybook stories
 */

export const mockInstructor: Instructor = {
  id: 'instructor-001',
  name: 'Sarah Miller',
  email: 'sarah.miller@example.com',
  phone: '304-555-1234',
  photoUrl: 'https://picsum.photos/seed/instructor1/200/200',
  status: 'active',
  bio: 'Master weaver with over 20 years of experience in natural fiber arts. Sarah specializes in traditional Appalachian weaving patterns and teaches workshops on both floor loom and rigid heddle techniques.',
  specialties: ['weaving', 'natural dyeing', 'fiber arts'],
  payRate: 7500, // $75 flat rate per class
  payRateType: 'flat',
  notes: 'Prefers weekend classes. Has own loom for demonstrations.',
  payoutMethod: 'venmo',
  payoutDetails: '@sarah-miller-weaver',
  createdAt: new Date('2024-01-15T10:00:00Z'),
  updatedAt: new Date('2024-06-20T14:30:00Z'),
};

export const mockInstructor2: Instructor = {
  id: 'instructor-002',
  name: 'James Wilson',
  email: 'james@claystudio.com',
  phone: '304-555-5678',
  photoUrl: 'https://picsum.photos/seed/instructor2/200/200',
  status: 'active',
  bio: 'Ceramic artist and potter specializing in functional stoneware. James brings 15 years of studio experience and a passion for teaching beginners the fundamentals of wheel throwing.',
  specialties: ['pottery', 'ceramics', 'wheel throwing'],
  payRate: 3500, // $35/hour
  payRateType: 'hourly',
  payoutMethod: 'check',
  createdAt: new Date('2024-02-10T09:00:00Z'),
  updatedAt: new Date('2024-05-15T16:45:00Z'),
};

export const mockInstructorPercentage: Instructor = {
  id: 'instructor-003',
  name: 'Maria Santos',
  email: 'maria@artworkshops.com',
  photoUrl: 'https://picsum.photos/seed/instructor3/200/200',
  status: 'active',
  bio: 'Jewelry designer and metalsmith creating one-of-a-kind pieces. Maria teaches wire wrapping, basic metalsmithing, and jewelry design workshops.',
  specialties: ['jewelry making', 'metalsmithing', 'wire wrapping'],
  payRate: 0.6, // 60% of class revenue
  payRateType: 'percentage',
  notes: 'Brings all materials. Price includes supplies.',
  payoutMethod: 'paypal',
  payoutDetails: 'maria@artworkshops.com',
  createdAt: new Date('2024-03-01T11:00:00Z'),
  updatedAt: new Date('2024-07-10T13:00:00Z'),
};

export const mockInstructorInactive: Instructor = {
  id: 'instructor-004',
  name: 'Robert Chen',
  email: 'robert.chen@email.com',
  phone: '304-555-9012',
  status: 'inactive',
  bio: 'Woodworker and furniture maker with expertise in hand tools and traditional joinery.',
  specialties: ['woodworking', 'furniture making'],
  notes: 'On sabbatical - will return Spring 2025.',
  createdAt: new Date('2023-06-01T11:00:00Z'),
  updatedAt: new Date('2024-09-01T08:00:00Z'),
};

export const mockInstructorNoPhoto: Instructor = {
  id: 'instructor-005',
  name: 'Emily Johnson',
  email: 'emily.j@example.com',
  status: 'active',
  bio: 'Textile artist specializing in natural dyes and eco-printing techniques.',
  specialties: ['natural dyeing', 'eco-printing', 'textile arts'],
  payRate: 5000, // $50 flat
  payRateType: 'flat',
  createdAt: new Date('2024-08-05T12:00:00Z'),
  updatedAt: new Date('2024-08-05T12:00:00Z'),
};

export const mockInstructorMinimal: Instructor = {
  id: 'instructor-006',
  name: 'Alex Thompson',
  email: 'alex@example.com',
  status: 'active',
  createdAt: new Date('2024-10-01T10:00:00Z'),
  updatedAt: new Date('2024-10-01T10:00:00Z'),
};

/**
 * A contract instructor who has been cleared to teach: every readiness item
 * recorded.
 */
export const mockContractorReady: Instructor = {
  id: 'instructor-007',
  name: 'Robin Ashfield',
  email: 'robin@example.com',
  phone: '304-555-0142',
  status: 'active',
  bio: 'Stained glass artist teaching copper-foil suncatchers and small panels.',
  specialties: ['stained glass'],
  payRate: 6000,
  payRateType: 'flat',
  isContractor: true,
  readiness: {
    contractorAgreement: {
      signedOn: '2026-09-01',
      reference: 'https://example.com/agreements/robin-ashfield.pdf',
    },
    backgroundCheck: { clearedOn: '2026-09-08' },
    paymentSetup: { completedOn: '2026-09-10', method: 'square-payroll' },
  },
  createdAt: new Date('2026-08-20T10:00:00Z'),
  updatedAt: new Date('2026-09-10T10:00:00Z'),
};

/**
 * A contract instructor partway through onboarding: agreement signed, still
 * waiting on the background check and payment setup.
 */
export const mockContractorNotReady: Instructor = {
  id: 'instructor-008',
  name: 'Olive Thompson',
  email: 'olive@example.com',
  phone: '304-555-0143',
  status: 'active',
  bio: 'Block printer and bookbinder, new to teaching at the studio.',
  specialties: ['block printing', 'bookbinding'],
  payRate: 0.6,
  payRateType: 'percentage',
  isContractor: true,
  readiness: {
    contractorAgreement: { signedOn: '2026-09-20' },
  },
  createdAt: new Date('2026-09-15T10:00:00Z'),
  updatedAt: new Date('2026-09-20T10:00:00Z'),
};

/** A contract instructor with nothing recorded yet. */
export const mockContractorNothingRecorded: Instructor = {
  id: 'instructor-009',
  name: 'Test Contractor',
  email: 'test.contractor@example.com',
  status: 'active',
  isContractor: true,
  createdAt: new Date('2026-09-25T10:00:00Z'),
  updatedAt: new Date('2026-09-25T10:00:00Z'),
};

export const mockInstructors: Instructor[] = [
  mockInstructor,
  mockInstructor2,
  mockInstructorPercentage,
  mockInstructorInactive,
  mockInstructorNoPhoto,
  mockInstructorMinimal,
];

export const mockActiveInstructors: Instructor[] = mockInstructors.filter(
  (i) => i.status === 'active'
);
