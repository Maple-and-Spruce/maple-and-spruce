import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the shared inline-agreement processor. Verifies it uploads the
 * signature, creates the request + signed-agreement records, moves the image
 * under the real signed-agreement id, marks the request signed, and short-
 * circuits when there's nothing to sign.
 */

const mocks = vi.hoisted(() => ({
  createRequest: vi.fn(),
  createSigned: vi.fn(),
  markSigned: vi.fn(),
  save: vi.fn(),
  move: vi.fn(),
}));

vi.mock('@maple/firebase/database', () => ({
  AgreementRequestRepository: {
    create: mocks.createRequest,
    markSigned: mocks.markSigned,
  },
  SignedAgreementRepository: { create: mocks.createSigned },
}));

vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({
    bucket: () => ({
      file: () => ({ save: mocks.save, move: mocks.move }),
    }),
  }),
}));

import { processInlineAgreements } from './inline-agreements.utility';

const template = {
  id: 'tpl-1',
  version: 3,
  name: 'Studio Waiver',
  sections: [{ title: 'Risk', content: 'You agree.' }],
} as never;

const signer = { email: 'a@test.com', name: 'Ada Signer', phone: '+1304' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createRequest.mockResolvedValue({ id: 'req-1' });
  mocks.createSigned.mockResolvedValue({ id: 'signed-1' });
});

describe('processInlineAgreements', () => {
  it('returns false and does nothing when there are no required templates', async () => {
    const result = await processInlineAgreements({
      registrationId: 'reg-1',
      classId: 'class-1',
      requiredTemplates: [],
      agreements: [{ templateId: 'tpl-1' } as never],
      signer,
    });
    expect(result).toBe(false);
    expect(mocks.createRequest).not.toHaveBeenCalled();
  });

  it('returns false when no agreements were submitted', async () => {
    const result = await processInlineAgreements({
      registrationId: 'reg-1',
      classId: 'class-1',
      requiredTemplates: [template],
      agreements: undefined,
      signer,
    });
    expect(result).toBe(false);
    expect(mocks.createSigned).not.toHaveBeenCalled();
  });

  it('persists a signed agreement: request + signed record + file move + markSigned', async () => {
    const result = await processInlineAgreements({
      registrationId: 'reg-1',
      classId: 'class-1',
      requiredTemplates: [template],
      agreements: [
        {
          templateId: 'tpl-1',
          signatureData: 'data:image/png;base64,AAAA',
          printedName: '  Ada Signer  ',
        } as never,
      ],
      signer,
    });

    expect(result).toBe(true);
    expect(mocks.save).toHaveBeenCalled(); // signature uploaded
    expect(mocks.createRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: 'tpl-1',
        registrationId: 'reg-1',
        classId: 'class-1',
        signerEmail: 'a@test.com',
      })
    );
    expect(mocks.createSigned).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-1',
        printedName: 'Ada Signer', // trimmed
        signerEmail: 'a@test.com',
      })
    );
    // Image moved under the real signed-agreement id, then request marked signed.
    expect(mocks.move).toHaveBeenCalledWith(
      'agreements/signed-1/signature.png'
    );
    expect(mocks.markSigned).toHaveBeenCalledWith('req-1', 'signed-1');
  });

  it('uploads a guardian signature for a minor', async () => {
    await processInlineAgreements({
      registrationId: 'reg-1',
      classId: 'class-1',
      requiredTemplates: [template],
      agreements: [
        {
          templateId: 'tpl-1',
          signatureData: 'AAAA',
          printedName: 'Parent',
          isMinor: true,
          minorName: 'Kid',
          guardianName: 'Parent',
          guardianSignatureData: 'BBBB',
        } as never,
      ],
      signer,
    });

    // Two uploads (signature + guardian), two moves under signed-1.
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(mocks.move).toHaveBeenCalledWith(
      'agreements/signed-1/guardian-signature.png'
    );
  });

  it('ignores submitted agreements that do not match a required template', async () => {
    const result = await processInlineAgreements({
      registrationId: 'reg-1',
      classId: 'class-1',
      requiredTemplates: [template],
      agreements: [{ templateId: 'other-tpl', signatureData: 'x' } as never],
      signer,
    });
    expect(result).toBe(true); // required set was non-empty
    expect(mocks.createSigned).not.toHaveBeenCalled();
  });
});
