import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for submitSignedAgreement: what a signature on an instructor's
 * contractor agreement does to their readiness to teach. The storage and
 * snapshot paths are exercised by the agreements integration suite.
 */

const mocks = vi.hoisted(() => ({
  findByToken: vi.fn(),
  markSigned: vi.fn(),
  templateFindById: vi.fn(),
  signedCreate: vi.fn(),
  updateStoragePaths: vi.fn(),
  instructorFindById: vi.fn(),
  instructorUpdate: vi.fn(),
  validation: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  Functions: {
    endpoint: {
      withOptions: () => ({ handle: (handler: unknown) => handler }),
    },
  },
}));

vi.mock('@maple/firebase/database', () => ({
  AgreementRequestRepository: {
    findByToken: mocks.findByToken,
    markSigned: mocks.markSigned,
  },
  AgreementTemplateRepository: { findById: mocks.templateFindById },
  SignedAgreementRepository: {
    create: mocks.signedCreate,
    updateStoragePaths: mocks.updateStoragePaths,
  },
  InstructorRepository: {
    findById: mocks.instructorFindById,
    update: mocks.instructorUpdate,
  },
}));

vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({
    bucket: () => ({
      file: () => ({ save: vi.fn(), move: vi.fn() }),
    }),
  }),
}));

vi.mock('@maple/ts/validation', () => ({
  agreementSigningValidation: mocks.validation,
}));

import {
  recordInstructorAgreement,
  submitSignedAgreement,
} from './submit-signed-agreement';

const handler = submitSignedAgreement as unknown as (
  data: unknown
) => Promise<unknown>;

// 9pm in New York on Oct 14 is already Oct 15 in UTC: the studio day wins.
const SIGNED_AT = new Date('2026-10-15T01:00:00Z');

const backgroundCheck = { clearedOn: '2026-10-01' };
const paymentSetup = { completedOn: '2026-10-02', method: 'square-payroll' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('recordInstructorAgreement', () => {
  it('records the studio-local signing day and keeps the other readiness items', async () => {
    mocks.instructorFindById.mockResolvedValue({
      id: 'inst-1',
      isContractor: true,
      readiness: { backgroundCheck, paymentSetup },
    });

    await recordInstructorAgreement('inst-1', SIGNED_AT, 'sa-1');

    expect(mocks.instructorUpdate).toHaveBeenCalledWith({
      id: 'inst-1',
      readiness: {
        backgroundCheck,
        paymentSetup,
        contractorAgreement: {
          signedOn: '2026-10-14',
          reference: 'Signed online, agreement sa-1',
        },
      },
    });
  });

  it('records it for an instructor with no readiness yet', async () => {
    mocks.instructorFindById.mockResolvedValue({ id: 'inst-1' });

    await recordInstructorAgreement('inst-1', SIGNED_AT, 'sa-1');

    expect(mocks.instructorUpdate.mock.calls[0][0].readiness).toEqual({
      contractorAgreement: {
        signedOn: '2026-10-14',
        reference: 'Signed online, agreement sa-1',
      },
    });
  });

  it('leaves a date already on record alone', async () => {
    mocks.instructorFindById.mockResolvedValue({
      id: 'inst-1',
      readiness: {
        contractorAgreement: { signedOn: '2026-09-01', reference: 'paper, office binder' },
      },
    });

    await recordInstructorAgreement('inst-1', SIGNED_AT, 'sa-1');

    expect(mocks.instructorUpdate).not.toHaveBeenCalled();
  });

  it('does nothing when the instructor is gone', async () => {
    mocks.instructorFindById.mockResolvedValue(undefined);

    await recordInstructorAgreement('inst-gone', SIGNED_AT, 'sa-1');

    expect(mocks.instructorUpdate).not.toHaveBeenCalled();
  });

  it('never throws, because the signature is already stored', async () => {
    mocks.instructorFindById.mockResolvedValue({ id: 'inst-1' });
    mocks.instructorUpdate.mockRejectedValue(new Error('firestore down'));

    await expect(
      recordInstructorAgreement('inst-1', SIGNED_AT, 'sa-1')
    ).resolves.toBeUndefined();
  });
});

describe('submitSignedAgreement', () => {
  const request = {
    id: 'req-1',
    templateId: 'tpl-1',
    templateVersion: 2,
    signerEmail: 'robin@example.com',
    signerName: 'Robin Ashfield',
    status: 'pending',
    expiresAt: new Date(Date.now() + 86_400_000),
  };

  beforeEach(() => {
    mocks.validation.mockReturnValue({ hasErrors: () => false });
    mocks.templateFindById.mockResolvedValue({
      id: 'tpl-1',
      name: 'Class Instructor Agreement (1099)',
      sections: [{ title: 'About', content: '<p>Hi</p>' }],
    });
    mocks.signedCreate.mockImplementation(async (input) => ({
      id: 'sa-1',
      ...input,
    }));
  });

  const submit = () =>
    handler({
      token: 'tok',
      printedName: 'Robin Ashfield',
      signatureData: 'data:image/png;base64,AAAA',
    });

  it("records the agreement on the instructor's readiness once the request is signed", async () => {
    mocks.findByToken.mockResolvedValue({ ...request, instructorId: 'inst-1' });
    mocks.instructorFindById.mockResolvedValue({ id: 'inst-1' });

    await submit();

    expect(mocks.markSigned).toHaveBeenCalledWith('req-1', 'sa-1');
    expect(mocks.instructorFindById).toHaveBeenCalledWith('inst-1');
    expect(mocks.instructorUpdate.mock.calls[0][0].readiness.contractorAgreement)
      .toMatchObject({ reference: 'Signed online, agreement sa-1' });
    expect(mocks.markSigned.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.instructorUpdate.mock.invocationCallOrder[0]
    );
  });

  it('leaves instructors alone for any other agreement', async () => {
    mocks.findByToken.mockResolvedValue(request);

    await submit();

    expect(mocks.markSigned).toHaveBeenCalled();
    expect(mocks.instructorFindById).not.toHaveBeenCalled();
    expect(mocks.instructorUpdate).not.toHaveBeenCalled();
  });

  it('still succeeds when recording on the instructor fails', async () => {
    mocks.findByToken.mockResolvedValue({ ...request, instructorId: 'inst-1' });
    mocks.instructorFindById.mockRejectedValue(new Error('firestore down'));

    await expect(submit()).resolves.toMatchObject({
      signedAgreement: { id: 'sa-1' },
    });
  });
});
