/**
 * getSquareCardCandidates (#81)
 *
 * The cards already on file in Square, each with enough of its customer to
 * match it to a student.
 *
 * Katie saves cards in the Square app, in person — that is the starting point,
 * not something the portal gets to design. So this is a read of what she
 * already did, and the ranking that turns it into a suggestion lives in
 * `rankCardsForStudent`, pure and shared with the client.
 *
 * Nothing here links anything. A wrong link charges the wrong family.
 */
import { Functions, Role } from '@maple/firebase/functions';
import {
  Square,
  SQUARE_SECRET_NAMES,
  SQUARE_STRING_NAMES,
} from '@maple/firebase/square';
import { StudentRepository } from '@maple/firebase/database';
import type { SquareCardOnFile } from '@maple/ts/domain';
import type {
  GetSquareCardCandidatesRequest,
  GetSquareCardCandidatesResponse,
} from '@maple/ts/firebase/api-types';

export const getSquareCardCandidates = Functions.endpoint
  .requiringRole(Role.Admin)
  .usingSecrets(...SQUARE_SECRET_NAMES)
  .usingStrings(...SQUARE_STRING_NAMES)
  .handle<GetSquareCardCandidatesRequest, GetSquareCardCandidatesResponse>(
    async (_data, _context, secrets, strings) => {
      const square = new Square(secrets, strings);

      const cards = await square.cardsService.listCardsOnFile();

      // One customer read per distinct customer, not per card — a family with
      // two cards is one customer.
      const customerIds = [...new Set(cards.map((c) => c.customerId))];
      const customers = new Map(
        await Promise.all(
          customerIds.map(
            async (id) =>
              [id, await square.customersService.get(id)] as const
          )
        )
      );

      const enriched: SquareCardOnFile[] = cards.map((card) => {
        const customer = customers.get(card.customerId);
        return {
          ...card,
          customerEmail: customer?.emailAddress,
          customerPhone: customer?.phoneNumber,
          customerGivenName: customer?.givenName,
          customerFamilyName: customer?.familyName,
        };
      });

      // Which cards are already spoken for, so the UI can say so rather than
      // offering one family's card to another student.
      const students = await StudentRepository.findAll();
      const linkedBy = new Map(
        students
          .filter((s) => s.squareCardId)
          .map((s) => [s.squareCardId as string, { id: s.id, name: s.name }])
      );

      return {
        cards: enriched,
        linkedTo: Object.fromEntries(linkedBy),
      };
    }
  );
