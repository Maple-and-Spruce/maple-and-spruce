export { useProducts } from './lib/useProducts';
export { useArtists } from './lib/useArtists';
export { useCategories } from './lib/useCategories';
export { useSyncConflicts } from './lib/useSyncConflicts';
export { useSyncConflictSummary } from './lib/useSyncConflictSummary';

// Phase 3: Classes & Workshops
export { useInstructors } from './lib/useInstructors';
export { useClasses, type UseClassesFilters } from './lib/useClasses';
export { useClassCategories } from './lib/useClassCategories';

// Phase 4: Music Lessons
export { useStudents } from './lib/useStudents';
export { useLessons, type UseLessonsOptions } from './lib/useLessons';
export { useInvoices, type UseInvoicesOptions } from './lib/useInvoices';
export {
  useTeacherPayouts,
  type UseTeacherPayoutsOptions,
} from './lib/useTeacherPayouts';

// Phase 4.5: Calendar
export {
  useCalendarEvents,
  type UseCalendarEventsFilters,
} from './lib/useCalendarEvents';
export { useCalendarEmbedConfig } from './lib/useCalendarEmbedConfig';

// Phase 5: Etsy Integration
export { useEtsyConnection } from './lib/useEtsyConnection';
export {
  useEtsyListings,
  type UseEtsyListingsOptions,
} from './lib/useEtsyListings';
export { useEtsyImport } from './lib/useEtsyImport';

// Phase 3c: Registration & Discounts
export {
  useDiscounts,
  type UseDiscountsFilters,
} from './lib/useDiscounts';
export {
  useRegistrations,
  type UseRegistrationsFilters,
} from './lib/useRegistrations';
