/**
 * updateStudentSquareCard (#798) — link a card on file to a student, or unlink.
 *
 * Both directions in one endpoint because the interesting part is identical:
 * this is the field the billing job charges against, so it is worth being
 * careful in exactly the same way either way.
 *
 * The card is NOT captured here. Katie saves it in the Square app in person;
 * this attaches the one she already saved. Passing `squareCardId: null`
 * detaches it, which stops the billing job charging that family without
 * touching anything in Square — the card stays on file for her to use by hand.
 */
import {
  Functions,
  Role,
  throwInvalidArgument,
  throwNotFound,
} from '@maple/firebase/functions';
import {
  Square,
  SQUARE_SECRET_NAMES,
  SQUARE_STRING_NAMES,
} from '@maple/firebase/square';
import { StudentRepository } from '@maple/firebase/database';
import { isCardExpired } from '@maple/ts/domain';
import type {
  UpdateStudentSquareCardRequest,
  UpdateStudentSquareCardResponse,
} from '@maple/ts/firebase/api-types';

export const updateStudentSquareCard = Functions.endpoint
  .requiringRole(Role.Admin)
  .usingSecrets(...SQUARE_SECRET_NAMES)
  .usingStrings(...SQUARE_STRING_NAMES)
  .handle<UpdateStudentSquareCardRequest, UpdateStudentSquareCardResponse>(
    async (data, _context, secrets, strings) => {
      if (!data.studentId) throwInvalidArgument('Student ID is required');

      const student = await StudentRepository.findById(data.studentId);
      if (!student) throwNotFound('Student', data.studentId);

      // Unlink.
      if (!data.squareCardId) {
        return { student: await StudentRepository.setSquareCard(data.studentId, null) };
      }

      // Verify against Square rather than trusting the client. The id decides
      // which card gets charged, so a stale or mistyped one must not be stored.
      const square = new Square(secrets, strings);
      const cards = await square.cardsService.listCardsOnFile();
      const card = cards.find((c) => c.cardId === data.squareCardId);

      if (!card) {
        throwInvalidArgument(
          'That card is no longer on file in Square. Reload and pick again.'
        );
      }
      if (!card.enabled) {
        throwInvalidArgument(
          'That card is disabled in Square and cannot be charged.'
        );
      }
      if (isCardExpired(card)) {
        throwInvalidArgument(
          'That card has expired. Save a new one in Square, then link it here.'
        );
      }

      // A card belongs to one family. Linking it to a second student would
      // bill one family for another's lessons.
      const students = await StudentRepository.findAll();
      const alreadyLinked = students.find(
        (s) => s.squareCardId === card.cardId && s.id !== data.studentId
      );
      if (alreadyLinked) {
        throwInvalidArgument(
          `That card is already linked to ${alreadyLinked.name}. Unlink it there first.`
        );
      }

      const updated = await StudentRepository.setSquareCard(data.studentId, {
        squareCustomerId: card.customerId,
        squareCardId: card.cardId,
        cardBrand: card.cardBrand,
        cardLast4: card.last4,
      });

      return { student: updated };
    }
  );
