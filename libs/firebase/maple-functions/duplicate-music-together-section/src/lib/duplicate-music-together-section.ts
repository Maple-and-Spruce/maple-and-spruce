/**
 * Duplicate Music Together Section Cloud Function (admin)
 *
 * Clones an existing section into a new HIDDEN, enrollment-paused draft so an
 * admin can pre-build overflow / "reach-goal" sections (e.g. an extra 11:15
 * Thursday class) and keep them completely secret until they're actually
 * needed — then release each one with the `visible` + `enrollmentActive`
 * toggles.
 *
 * Behaviour:
 * - Copied: description, sessions (the weekly pattern — the admin usually just
 *   edits the time), capacityFamilies, priceFullCents, installmentPlan,
 *   location, room, semesterId.
 * - `name` gets a " (Copy)" suffix so the duplicate is easy to spot.
 * - `visible` and `enrollmentActive` are forced to `false`, and the enrollment
 *   window (`enrollmentOpensAt` / `enrollmentClosesAt`) is cleared, so the copy
 *   is invisible everywhere and accepts no registrations until released.
 * - `webflowItemId` is omitted, so the next sync creates a fresh Webflow item
 *   rather than overwriting the source's.
 *
 * Unlike duplicate-class (which clears sessions), MT sections keep the source's
 * sessions: overflow sections mirror an existing class and differ only by time,
 * so pre-filling the schedule is the point.
 */
import {
  createRoleFunction,
  throwInvalidArgument,
  throwNotFound,
  Role,
} from '@maple/firebase/functions';
import { MusicTogetherSectionRepository } from '@maple/firebase/database';
import type { CreateMusicTogetherSectionInput } from '@maple/ts/domain';
import type {
  DuplicateMusicTogetherSectionRequest,
  DuplicateMusicTogetherSectionResponse,
} from '@maple/ts/firebase/api-types';

export const duplicateMusicTogetherSection = createRoleFunction<
  DuplicateMusicTogetherSectionRequest,
  DuplicateMusicTogetherSectionResponse
>(async (data) => {
  if (!data.sourceSectionId) {
    throwInvalidArgument('Source section ID is required');
  }

  const source = await MusicTogetherSectionRepository.findById(
    data.sourceSectionId
  );
  if (!source) {
    throwNotFound('Music Together section', data.sourceSectionId);
  }

  const input: CreateMusicTogetherSectionInput = {
    name: `${source.name} (Copy)`,
    description: source.description,
    sessions: source.sessions.map((s) => ({ dateTime: new Date(s.dateTime) })),
    capacityFamilies: source.capacityFamilies,
    priceFullCents: source.priceFullCents,
    installmentPlan: source.installmentPlan
      ? source.installmentPlan.map((i) => ({ ...i }))
      : undefined,
    // Reach-goal copy: hidden + paused until explicitly released.
    visible: false,
    enrollmentActive: false,
    location: source.location,
    room: source.room,
    semesterId: source.semesterId,
  };

  const created = await MusicTogetherSectionRepository.create(input);

  return { section: created };
}, [Role.Admin, Role.MtTeacher]);
