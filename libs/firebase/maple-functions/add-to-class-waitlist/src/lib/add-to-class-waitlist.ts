/**
 * Add to Class Waitlist Cloud Function
 *
 * Public (no auth) endpoint called from the embedded Webflow registration
 * widget when a class is full. Stores the email under
 * `classes/{classId}/waitlist/{emailKey}`. Idempotent — re-signing up with
 * the same email returns `added: false` without changing the record.
 *
 * The class is verified to be published (we don't want random IDs to
 * create empty subcollections). Beyond that, no capacity check — a
 * customer may legitimately want to be notified even if the class is
 * currently marked available.
 *
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  Functions,
  throwInvalidArgument,
  throwNotFound,
  throwValidationError,
} from '@maple/firebase/functions';
import {
  ClassRepository,
  ClassWaitlistRepository,
} from '@maple/firebase/database';
import { classWaitlistValidation } from '@maple/ts/validation';
import type {
  AddToClassWaitlistRequest,
  AddToClassWaitlistResponse,
} from '@maple/ts/firebase/api-types';

export const addToClassWaitlist = Functions.endpoint
  .withOptions({ concurrency: 80 })
  .handle<AddToClassWaitlistRequest, AddToClassWaitlistResponse>(
    async (data) => {
      const result = classWaitlistValidation({
        classId: data.classId,
        email: data.email,
      });
      if (result.hasErrors()) {
        throwValidationError(result.getErrors());
      }

      const classEntity = await ClassRepository.findById(data.classId);
      if (!classEntity) throwNotFound('Class', data.classId);
      if (classEntity!.status !== 'published') {
        throwInvalidArgument(
          'This class is not available for waitlist signup'
        );
      }

      const { created } = await ClassWaitlistRepository.add({
        classId: data.classId,
        email: data.email,
      });

      return { added: created };
    }
  );
