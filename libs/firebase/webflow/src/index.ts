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
