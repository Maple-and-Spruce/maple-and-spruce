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

// Instructor service
export {
  InstructorService,
  type SyncInstructorInput,
  type SyncInstructorResult,
  type InstructorWebflowFieldData,
  mapInstructorToFieldData,
} from './lib/instructor.service';
