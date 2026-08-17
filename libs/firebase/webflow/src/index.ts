// Webflow utility and constants
export {
  Webflow,
  WEBFLOW_SECRET_NAMES,
  WEBFLOW_STRING_NAMES,
  type WebflowSecrets,
  type WebflowStrings,
} from './lib/webflow.utility';

// Artist service
export {
  ArtistService,
  type SyncArtistInput,
  type SyncArtistResult,
  type WebflowFieldData,
  // Exported for testing
  generateSlug,
  mapArtistToFieldData,
} from './lib/artist.service';

// Class service
export {
  ClassService,
  type SyncClassInput,
  type SyncClassResult,
  type ClassWebflowFieldData,
  generateClassSlug,
  mapClassToFieldData,
} from './lib/class.service';

// Class category service
export {
  ClassCategoryService,
  type SyncClassCategoryInput,
  type SyncClassCategoryResult,
  type ClassCategoryWebflowFieldData,
  mapClassCategoryToFieldData,
} from './lib/class-category.service';

// Instructor service
export {
  InstructorService,
  type SyncInstructorInput,
  type SyncInstructorResult,
  type InstructorWebflowFieldData,
  mapInstructorToFieldData,
} from './lib/instructor.service';

// Music Together section service
export {
  MtSectionService,
  type SyncSectionInput,
  type SyncSectionResult,
  type MtSectionWebflowFieldData,
  mapSectionToFieldData,
} from './lib/mt-section.service';

// Music Together semester service
export {
  MtSemesterService,
  type SyncSemesterInput,
  type SyncSemesterResult,
  type MtSemesterWebflowFieldData,
  mapSemesterToFieldData,
} from './lib/mt-semester.service';

// Music Together demo service
export {
  MtDemoWebflowService,
  type SyncDemoInput,
  type SyncDemoResult,
  type MtDemoWebflowFieldData,
  mapDemoToFieldData,
} from './lib/mt-demo.service';
