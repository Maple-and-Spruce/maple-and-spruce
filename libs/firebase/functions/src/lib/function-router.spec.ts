import { describe, expect, it } from 'vitest';
import { routeNameFromPath } from './functions.utility';

/**
 * Route resolution is the one piece of a domain router that has no equivalent in
 * a single-purpose function, so it carries the whole risk of ADR-029: get it
 * wrong and either every call 404s, or worse, a call lands on the wrong handler.
 *
 * The cases are the three shapes `req.path` actually takes — the emulator, a
 * direct `cloudfunctions.net` call, and a Hosting rewrite — which is why the
 * implementation reads the last segment rather than stripping a known prefix.
 */
describe('resolving which route a request is for', () => {
  it('reads a bare route path, as the emulator sends it', () => {
    expect(routeNameFromPath('/getArtists', 'artists')).toBe('getArtists');
  });

  it('reads a path that repeats the function name', () => {
    expect(routeNameFromPath('/artists/getArtists', 'artists')).toBe('getArtists');
  });

  it('reads a path nested under a Hosting rewrite', () => {
    expect(routeNameFromPath('/api/artists/getArtists', 'artists')).toBe(
      'getArtists'
    );
  });

  it('tolerates a trailing slash', () => {
    expect(routeNameFromPath('/artists/getArtists/', 'artists')).toBe(
      'getArtists'
    );
  });

  it('has no route for a bare call to the router', () => {
    // Calling the function with no route is a client bug, and a 404 naming it is
    // more use than dispatching to some default.
    expect(routeNameFromPath('/artists', 'artists')).toBeUndefined();
    expect(routeNameFromPath('/', 'artists')).toBeUndefined();
    expect(routeNameFromPath('', 'artists')).toBeUndefined();
  });

  it('does not invent a route from the function name alone', () => {
    expect(routeNameFromPath('/artists/', 'artists')).toBeUndefined();
  });

  it('returns an unknown segment rather than guessing', () => {
    // The router turns this into a 404 that lists the routes it does have; the
    // resolver's job is only to report what was asked for.
    expect(routeNameFromPath('/artists/nope', 'artists')).toBe('nope');
  });
});
