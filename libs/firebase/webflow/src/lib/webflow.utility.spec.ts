import { describe, it, expect } from 'vitest';
import { Webflow, WEBFLOW_SECRET_NAMES, WEBFLOW_STRING_NAMES } from './webflow.utility';

describe('WEBFLOW_SECRET_NAMES', () => {
  it('includes WEBFLOW_API_TOKEN', () => {
    expect(WEBFLOW_SECRET_NAMES).toContain('WEBFLOW_API_TOKEN');
  });

  it('has exactly one secret', () => {
    expect(WEBFLOW_SECRET_NAMES).toHaveLength(1);
  });
});

describe('WEBFLOW_STRING_NAMES', () => {
  it('includes WEBFLOW_SITE_ID', () => {
    expect(WEBFLOW_STRING_NAMES).toContain('WEBFLOW_SITE_ID');
  });

  it('includes WEBFLOW_ARTISTS_COLLECTION_ID', () => {
    expect(WEBFLOW_STRING_NAMES).toContain('WEBFLOW_ARTISTS_COLLECTION_ID');
  });

  it('has exactly two strings', () => {
    expect(WEBFLOW_STRING_NAMES).toHaveLength(2);
  });
});

describe('Webflow', () => {
  const validSecrets = {
    WEBFLOW_API_TOKEN: 'test-api-token',
  };

  const validStrings = {
    WEBFLOW_SITE_ID: 'test-site-id',
    WEBFLOW_ARTISTS_COLLECTION_ID: 'test-collection-id',
  };

  describe('constructor validation', () => {
    it('throws error when WEBFLOW_API_TOKEN is missing', () => {
      const invalidSecrets = {
        WEBFLOW_API_TOKEN: '',
      };

      expect(() => new Webflow(invalidSecrets, validStrings)).toThrow(
        'Webflow API token not configured. Set WEBFLOW_API_TOKEN secret.'
      );
    });

    it('throws error when WEBFLOW_SITE_ID is missing', () => {
      const invalidStrings = {
        WEBFLOW_SITE_ID: '',
        WEBFLOW_ARTISTS_COLLECTION_ID: 'test-collection-id',
      };

      expect(() => new Webflow(validSecrets, invalidStrings)).toThrow(
        'Webflow site ID not configured. Set WEBFLOW_SITE_ID.'
      );
    });

    it('throws error when WEBFLOW_ARTISTS_COLLECTION_ID is missing', () => {
      const invalidStrings = {
        WEBFLOW_SITE_ID: 'test-site-id',
        WEBFLOW_ARTISTS_COLLECTION_ID: '',
      };

      expect(() => new Webflow(validSecrets, invalidStrings)).toThrow(
        'Webflow artists collection ID not configured. Set WEBFLOW_ARTISTS_COLLECTION_ID.'
      );
    });

    it('succeeds with valid configuration', () => {
      const webflow = new Webflow(validSecrets, validStrings);
      expect(webflow).toBeDefined();
      expect(webflow.siteId).toBe('test-site-id');
      expect(webflow.artistsCollectionId).toBe('test-collection-id');
    });
  });

  describe('getClient', () => {
    it('returns WebflowClient instance', () => {
      const webflow = new Webflow(validSecrets, validStrings);
      const client = webflow.getClient();
      expect(client).toBeDefined();
    });
  });

  describe('artistService', () => {
    it('returns ArtistService instance', () => {
      const webflow = new Webflow(validSecrets, validStrings);
      const artistService = webflow.artistService;
      expect(artistService).toBeDefined();
    });
  });

  describe('collections', () => {
    it('returns collections API', () => {
      const webflow = new Webflow(validSecrets, validStrings);
      const collections = webflow.collections;
      expect(collections).toBeDefined();
    });
  });
});
