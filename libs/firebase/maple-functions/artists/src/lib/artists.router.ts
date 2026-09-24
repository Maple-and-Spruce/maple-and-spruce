/**
 * artists — the artists domain as one Cloud Function (ADR-029, #122).
 *
 * Five single-purpose functions (`getArtists`, `getArtist`, `createArtist`,
 * `updateArtist`, `deleteArtist`) become five routes on one deployable. The
 * reason is deploy time, not elegance: the gen-2 write quota is 60 per 60
 * seconds and **cannot be raised**, so 243 functions put a ~4-minute floor under
 * every deploy before any work happens, and a wide deploy breaches the
 * per-minute CPU rate on top of that (`Container Healthcheck failed`).
 *
 * WHAT IS AND IS NOT DIFFERENT
 * ----------------------------
 * Each route keeps its own role gate, Vest suite and uniqueness check, applied
 * per request by the same pipeline a standalone function uses — so this is a
 * routing change, not a change to how anything authenticates or validates. The
 * response is the same `{ data: … }` envelope, so clients keep `httpsCallable`
 * ergonomics via `httpsCallableFromURL`.
 *
 * What does change: `memory`/`timeoutSeconds`/`secrets` are now shared across
 * these five (they are properties of a function), and an unhandled crash takes
 * down the instance serving the artists routes rather than one endpoint. Artists
 * is chosen first precisely because that blast radius is small — admin-only
 * consignment CRUD, no payments, no customer-facing path.
 *
 * Handlers are the originals, moved not rewritten, so a behaviour change cannot
 * hide in this diff.
 */
import {
  Functions,
  Role,
  assertValid,
  throwAlreadyExists,
  throwNotFound,
} from '@maple/firebase/functions';
import { ArtistRepository } from '@maple/firebase/database';
import { artistValidation } from '@maple/ts/validation';
import type {
  CreateArtistRequest,
  CreateArtistResponse,
  DeleteArtistRequest,
  DeleteArtistResponse,
  GetArtistRequest,
  GetArtistResponse,
  GetArtistsRequest,
  GetArtistsResponse,
  UpdateArtistRequest,
  UpdateArtistResponse,
} from '@maple/ts/firebase/api-types';

/*
 * Every route spells its gate out in full rather than sharing an `admin()`
 * helper. That is not style: `tools/check-callable-roles.ts` reads the gate off
 * the AST, and a helper returning the builder hides `requiringRole` behind a
 * call it cannot follow — so a router built that way would report as ungated,
 * and the natural "fix" is to allowlist it, which is exactly how an ungated
 * route would slip through. Verbose and checkable beats terse and invisible.
 *
 * Admin-only throughout, matching what each function declared on its own.
 * Artists is an Admin-group area in the scoped-roles matrix (epic #49); the
 * singular read was auth-only until the analyzer caught it (legacy #620), so the
 * gate on `getArtist` is deliberate rather than copied.
 */

export const artists = Functions.router('artists', {
  getArtists: Functions.endpoint.requiringRole(Role.Admin).asRoute<GetArtistsRequest, GetArtistsResponse>(
    async (data) => {
      const found = await ArtistRepository.findAll({ status: data.status });
      return { artists: found };
    }
  ),

  getArtist: Functions.endpoint.requiringRole(Role.Admin).asRoute<GetArtistRequest, GetArtistResponse>(
    async (data) => {
      const artist = await ArtistRepository.findById(data.id);
      if (!artist) {
        throwNotFound('Artist', data.id);
      }
      return { artist };
    }
  ),

  createArtist: Functions.endpoint
    .requiringRole(Role.Admin)
    .validating(artistValidation)
    .ensuringUnique<CreateArtistRequest>({
      entity: 'Artist',
      field: 'email',
      exists: async (email) =>
        (await ArtistRepository.findByEmail(email)) !== undefined,
    })
    .asRoute<CreateArtistRequest, CreateArtistResponse>(async (data) => {
      const artist = await ArtistRepository.create(data);
      return { artist };
    }),

  updateArtist: Functions.endpoint.requiringRole(Role.Admin).asRoute<UpdateArtistRequest, UpdateArtistResponse>(
    async (data) => {
      const existing = await ArtistRepository.findById(data.id);
      if (!existing) {
        throwNotFound('Artist', data.id);
      }

      // Validate against the merged record so partial updates still pass
      // full-record validation rules.
      assertValid(artistValidation({ ...existing, ...data }));

      if (data.email && data.email !== existing.email) {
        const conflict = await ArtistRepository.findByEmail(data.email);
        if (conflict) {
          throwAlreadyExists('Artist', 'email', data.email);
        }
      }

      const artist = await ArtistRepository.update(data);
      return { artist };
    }
  ),

  deleteArtist: Functions.endpoint.requiringRole(Role.Admin).asRoute<DeleteArtistRequest, DeleteArtistResponse>(
    async (data) => {
      const existing = await ArtistRepository.findById(data.id);
      if (!existing) {
        throwNotFound('Artist', data.id);
      }

      await ArtistRepository.delete(data.id);
      return { success: true };
    }
  ),
});
