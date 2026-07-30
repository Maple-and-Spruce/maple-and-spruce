export { callDeduped } from './lib/call-deduped';
export { useProducts } from './lib/useProducts';
export { useArtists } from './lib/useArtists';
export { useCategories } from './lib/useCategories';
export { useSyncConflicts } from './lib/useSyncConflicts';
export { useLessonRatesConfig } from './lib/useLessonRatesConfig';
export { useMyDay } from './lib/useMyDay';
export { useBusinessPaymentConfig } from './lib/useBusinessPaymentConfig';
export { useSyncConflictSummary } from './lib/useSyncConflictSummary';
export { usePosLessonAttributions } from './lib/usePosLessonAttributions';
export { usePosLessonAttributionSummary } from './lib/usePosLessonAttributionSummary';
export { usePosLessonConfig } from './lib/usePosLessonConfig';

// Phase 3: Classes & Workshops
export { useInstructors } from './lib/useInstructors';
export { useClasses, type UseClassesFilters } from './lib/useClasses';
export {
  useMusicTogetherSections,
  type UseMusicTogetherSectionsFilters,
} from './lib/useMusicTogetherSections';
export { useMusicTogetherSemesters } from './lib/useMusicTogetherSemesters';
export { useMusicTogetherRoster } from './lib/useMusicTogetherRoster';
export { useMusicTogetherInterest } from './lib/useMusicTogetherInterest';
export { useMusicTogetherDemos } from './lib/useMusicTogetherDemos';
export { useMusicTogetherDemoRsvps } from './lib/useMusicTogetherDemoRsvps';
export { useClassCategories } from './lib/useClassCategories';

// Phase 4: Music Lessons
export { useStudents } from './lib/useStudents';
export { useLessons, type UseLessonsOptions } from './lib/useLessons';
export {
  useLessonBlocks,
  type UseLessonBlocksOptions,
} from './lib/useLessonBlocks';
export { useMyWeek } from './lib/useMyWeek';
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
export { useRoomSchedule } from './lib/useRoomSchedule';

// Phase 5: Etsy Integration
export { useEtsyConnection } from './lib/useEtsyConnection';
export {
  useEtsyListings,
  type UseEtsyListingsOptions,
} from './lib/useEtsyListings';
export { useEtsyImport } from './lib/useEtsyImport';
export { useEtsyPush } from './lib/useEtsyPush';

// Phase 5: Sales
export { useSales, type UseSalesOptions } from './lib/useSales';

// Phase 5: Artist Payouts
export {
  useArtistPayouts,
  type UseArtistPayoutsOptions,
} from './lib/useArtistPayouts';

// Agreements & Waivers
export {
  useAgreementTemplates,
  type UseAgreementTemplatesFilters,
} from './lib/useAgreementTemplates';
export {
  useAgreementRequests,
  type UseAgreementRequestsFilters,
} from './lib/useAgreementRequests';
export {
  useSignedAgreement,
  type SignedAgreementDetail,
} from './lib/useSignedAgreement';

// Craft Club (recurring studio-access membership)
export {
  useCraftClubMembers,
  type UseCraftClubMembersFilters,
} from './lib/useCraftClubMembers';

// Feature Flags
export { useFeatureFlags } from './lib/useFeatureFlags';

// Phase 3c: Registration & Discounts
export { useDiscounts, type UseDiscountsFilters } from './lib/useDiscounts';
export {
  useRegistrations,
  type UseRegistrationsFilters,
} from './lib/useRegistrations';
export { useClassWaitlist } from './lib/useClassWaitlist';
export { useClassWaitlistCounts } from './lib/useClassWaitlistCounts';

// User & role administration
export { useUsers } from './lib/useUsers';
