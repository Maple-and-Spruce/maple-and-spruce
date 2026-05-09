/**
 * API Types library
 *
 * Request and response types for Firebase Cloud Functions.
 * These are shared between client and server for type-safe API calls.
 *
 * @example
 * // Client-side usage
 * import { CreateArtistRequest, CreateArtistResponse } from '@maple/ts/firebase/api-types';
 * import { httpsCallable } from 'firebase/functions';
 *
 * const createArtist = httpsCallable<CreateArtistRequest, CreateArtistResponse>(
 *   functions,
 *   'createArtist'
 * );
 * const result = await createArtist({ name: 'John', email: 'john@example.com', ... });
 *
 * @example
 * // Server-side usage
 * import { CreateArtistRequest, CreateArtistResponse } from '@maple/ts/firebase/api-types';
 * import { createAdminFunction } from '@maple/firebase/functions';
 *
 * export const createArtist = createAdminFunction<CreateArtistRequest, CreateArtistResponse>(
 *   async (data, context) => {
 *     // data is typed as CreateArtistRequest
 *     const artist = await ArtistRepository.create(data);
 *     return { artist }; // return type is CreateArtistResponse
 *   }
 * );
 */

// Artist types
export type {
  GetArtistsRequest,
  GetArtistsResponse,
  GetArtistRequest,
  GetArtistResponse,
  CreateArtistRequest,
  CreateArtistResponse,
  UpdateArtistRequest,
  UpdateArtistResponse,
  DeleteArtistRequest,
  DeleteArtistResponse,
  UploadArtistImageRequest,
  UploadArtistImageResponse,
} from './artist.types';

// Category types
export type {
  GetCategoriesRequest,
  GetCategoriesResponse,
  GetCategoryRequest,
  GetCategoryResponse,
  CreateCategoryRequest,
  CreateCategoryResponse,
  UpdateCategoryRequest,
  UpdateCategoryResponse,
  DeleteCategoryRequest,
  DeleteCategoryResponse,
  ReorderCategoriesRequest,
  ReorderCategoriesResponse,
} from './category.types';

// Product types
export type {
  GetProductsRequest,
  GetProductsResponse,
  GetProductRequest,
  GetProductResponse,
  CreateProductRequest,
  CreateProductResponse,
  UpdateProductRequest,
  UpdateProductResponse,
  DeleteProductRequest,
  DeleteProductResponse,
  UploadProductImageRequest,
  UploadProductImageResponse,
  SyncEtsyProductsRequest,
  SyncEtsyProductsResponse,
} from './product.types';

// Sale types
export type {
  GetSalesRequest,
  GetSalesResponse,
  GetSaleRequest,
  GetSaleResponse,
  RecordSaleRequest,
  RecordSaleResponse,
  RecordProductSaleRequest,
  RecordProductSaleResponse,
  SyncEtsySalesRequest,
  SyncEtsySalesResponse,
} from './sale.types';

// Payout types
export type {
  GetPayoutsRequest,
  GetPayoutsResponse,
  GetPayoutRequest,
  GetPayoutResponse,
  GeneratePayoutRequest,
  GeneratePayoutResponse,
  PreviewPayoutRequest,
  PreviewPayoutResponse,
  MarkPayoutPaidRequest,
  MarkPayoutPaidResponse,
  GetArtistPayoutSummaryRequest,
  GetArtistPayoutSummaryResponse,
} from './payout.types';

// Sync Conflict types
export type {
  GetSyncConflictsRequest,
  GetSyncConflictsResponse,
  GetSyncConflictSummaryRequest,
  GetSyncConflictSummaryResponse,
  ResolveSyncConflictRequest,
  ResolveSyncConflictResponse,
  DetectSyncConflictsRequest,
  DetectSyncConflictsResponse,
} from './sync-conflict.types';

// Phase 3: Classes & Workshops

// Instructor types
export type {
  GetInstructorsRequest,
  GetInstructorsResponse,
  GetInstructorRequest,
  GetInstructorResponse,
  CreateInstructorRequest,
  CreateInstructorResponse,
  UpdateInstructorRequest,
  UpdateInstructorResponse,
  DeleteInstructorRequest,
  DeleteInstructorResponse,
  UploadInstructorImageRequest,
  UploadInstructorImageResponse,
  GetPublicInstructorsRequest,
  GetPublicInstructorsResponse,
} from './instructor.types';

// Class types
export type {
  GetClassesRequest,
  GetClassesResponse,
  GetClassRequest,
  GetClassResponse,
  CreateClassRequest,
  CreateClassResponse,
  UpdateClassRequest,
  UpdateClassResponse,
  DeleteClassRequest,
  DeleteClassResponse,
  UploadClassImageRequest,
  UploadClassImageResponse,
  UploadClassGalleryImageRequest,
  UploadClassGalleryImageResponse,
  DuplicateClassRequest,
  DuplicateClassResponse,
  GetPublicClassRequest,
  GetPublicClassResponse,
} from './class.types';

// Class Category types
export type {
  GetClassCategoriesRequest,
  GetClassCategoriesResponse,
  GetClassCategoryRequest,
  GetClassCategoryResponse,
  CreateClassCategoryRequest,
  CreateClassCategoryResponse,
  UpdateClassCategoryRequest,
  UpdateClassCategoryResponse,
  DeleteClassCategoryRequest,
  DeleteClassCategoryResponse,
  ReorderClassCategoriesRequest,
  ReorderClassCategoriesResponse,
  UploadCategoryGalleryImageRequest,
  UploadCategoryGalleryImageResponse,
} from './class-category.types';

// Class Waitlist + Related Classes (public widget endpoints)
export type {
  AddToClassWaitlistRequest,
  AddToClassWaitlistResponse,
  GetRelatedPublicClassesRequest,
  GetRelatedPublicClassesResponse,
} from './class-waitlist.types';

// Phase 3c: Discount types
export type {
  GetDiscountsRequest,
  GetDiscountsResponse,
  CreateDiscountRequest,
  CreateDiscountResponse,
  UpdateDiscountRequest,
  UpdateDiscountResponse,
  DeleteDiscountRequest,
  DeleteDiscountResponse,
  LookupDiscountRequest,
  LookupDiscountResponse,
} from './discount.types';

// Auth types
export type {
  CheckAdminStatusRequest,
  CheckAdminStatusResponse,
} from './auth.types';

// User & role administration
export type {
  GetUsersRequest,
  GetUsersResponse,
  GrantAdminRoleRequest,
  GrantAdminRoleResponse,
  RevokeAdminRoleRequest,
  RevokeAdminRoleResponse,
} from './user.types';

// Phase 4.5: Calendar Event types
export type {
  GetCalendarEventsRequest,
  GetCalendarEventsResponse,
  GetCalendarEventRequest,
  GetCalendarEventResponse,
  CreateCalendarEventRequest,
  CreateCalendarEventResponse,
  UpdateCalendarEventRequest,
  UpdateCalendarEventResponse,
  DeleteCalendarEventRequest,
  DeleteCalendarEventResponse,
} from './calendar-event.types';

// Phase 3c: Registration types
export type {
  GetRegistrationsRequest,
  GetRegistrationsResponse,
  GetRegistrationRequest,
  GetRegistrationResponse,
  UpdateRegistrationRequest,
  UpdateRegistrationResponse,
  CancelRegistrationRequest,
  CancelRegistrationResponse,
  CalculateRegistrationCostRequest,
  CalculateRegistrationCostResponse,
  CreateRegistrationRequest,
  CreateRegistrationResponse,
} from './registration.types';

// Phase 4: Music Lessons - Student types
export type {
  GetStudentsRequest,
  GetStudentsResponse,
  GetStudentRequest,
  GetStudentResponse,
  CreateStudentRequest,
  CreateStudentResponse,
  UpdateStudentRequest,
  UpdateStudentResponse,
  DeleteStudentRequest,
  DeleteStudentResponse,
} from './student.types';

// Phase 4: Music Lessons - Lesson types
export type {
  GetLessonsRequest,
  GetLessonsResponse,
  CreateLessonRequest,
  CreateLessonResponse,
  CreateLessonSeriesRequest,
  CreateLessonSeriesResponse,
  UpdateLessonRequest,
  UpdateLessonResponse,
  DeleteLessonRequest,
  DeleteLessonResponse,
} from './lesson.types';

// Phase 4: Music Lessons - Invoice types (private-pay)
export type {
  GetInvoicesRequest,
  GetInvoicesResponse,
  CreateInvoiceRequest,
  CreateInvoiceResponse,
  UpdateInvoiceRequest,
  UpdateInvoiceResponse,
  DeleteInvoiceRequest,
  DeleteInvoiceResponse,
} from './invoice.types';

// Phase 4: Music Lessons - Teacher payout aggregation
export type {
  GetTeacherPayoutsRequest,
  GetTeacherPayoutsResponse,
} from './teacher-payout.types';

// Calendar Embed Config types
export type {
  GetCalendarEmbedConfigRequest,
  GetCalendarEmbedConfigResponse,
  UpdateCalendarEmbedConfigRequest,
  UpdateCalendarEmbedConfigResponse,
  AddCalendarEmbedSourceRequest,
  AddCalendarEmbedSourceResponse,
  RemoveCalendarEmbedSourceRequest,
  RemoveCalendarEmbedSourceResponse,
} from './calendar-embed-config.types';

// Phase 5: Etsy OAuth types
export type {
  EtsyAuthUrlRequest,
  EtsyAuthUrlResponse,
  EtsyAuthCallbackRequest,
  EtsyAuthCallbackResponse,
  GetEtsyConnectionStatusRequest,
  GetEtsyConnectionStatusResponse,
  RefreshEtsyShopIdRequest,
  RefreshEtsyShopIdResponse,
} from './etsy.types';

// Etsy Template types
export type {
  GetEtsyTemplatesRequest,
  GetEtsyTemplatesResponse,
  SaveEtsyCategoryTemplateRequest,
  SaveEtsyCategoryTemplateResponse,
  SaveEtsyArtistTemplateRequest,
  SaveEtsyArtistTemplateResponse,
} from './etsy-template.types';

// Agreements & Waivers
export type {
  GetAgreementTemplatesRequest,
  GetAgreementTemplatesResponse,
  GetAgreementTemplateRequest,
  GetAgreementTemplateResponse,
  CreateAgreementTemplateRequest,
  CreateAgreementTemplateResponse,
  UpdateAgreementTemplateRequest,
  UpdateAgreementTemplateResponse,
  DeleteAgreementTemplateRequest,
  DeleteAgreementTemplateResponse,
  GetAgreementRequestsRequest,
  GetAgreementRequestsResponse,
  SendAgreementRequestRequest,
  SendAgreementRequestResponse,
  ResendAgreementRequestRequest,
  ResendAgreementRequestResponse,
  GetSignedAgreementsRequest,
  GetSignedAgreementsResponse,
  GetSignedAgreementRequest,
  GetSignedAgreementResponse,
  GetAgreementForSigningRequest,
  GetAgreementForSigningResponse,
  SubmitSignedAgreementRequest,
  SubmitSignedAgreementResponse,
  GetRequiredAgreementsForClassRequest,
  GetRequiredAgreementsForClassResponse,
  InlineAgreementSigningData,
} from './agreement.types';

// Etsy Import types (read-only pull from Etsy into our catalog)
export type {
  ListEtsyListingsRequest,
  ListEtsyListingsResponse,
  EtsyListingWithSyncInfo,
  ImportEtsyListingInput,
  ImportEtsyListingsRequest,
  ImportEtsyListingsResponse,
  ImportEtsyListingResult,
} from './etsy-import.types';

// Etsy Push types (push products from our catalog to Etsy)
export type {
  PushProductToEtsyRequest,
  PushProductToEtsyResponse,
  UpdateEtsyListingRequest,
  UpdateEtsyListingResponse,
} from './etsy-push.types';
