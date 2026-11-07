import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for getAgreementForSigning: what the public signing page is
 * shown for an instructor's contractor agreement.
 */

const mocks = vi.hoisted(() => ({
  findByToken: vi.fn(),
  templateFindById: vi.fn(),
  classFindById: vi.fn(),
  instructorFindById: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  createPublicFunction: (handler: unknown) => handler,
  throwFailedPrecondition: (message: string) => {
    throw new Error(`failed-precondition: ${message}`);
  },
}));

vi.mock('@maple/firebase/database', () => ({
  AgreementRequestRepository: { findByToken: mocks.findByToken },
  AgreementTemplateRepository: { findById: mocks.templateFindById },
  ClassRepository: { findById: mocks.classFindById },
  InstructorRepository: { findById: mocks.instructorFindById },
}));

import { getAgreementForSigning } from './get-agreement-for-signing';

const handler = getAgreementForSigning as unknown as (
  data: unknown
) => Promise<{ sections: Array<{ content: string }> }>;

const request = {
  id: 'req-1',
  templateId: 'tpl-1',
  signerEmail: 'robin@example.com',
  signerName: 'Robin Ashfield',
  status: 'pending',
  expiresAt: new Date(Date.now() + 86_400_000),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.templateFindById.mockResolvedValue({
    id: 'tpl-1',
    name: 'Class Instructor Agreement (1099)',
    supportsMinor: false,
    sections: [
      { id: 'pay', title: 'Pay', content: '<p>You receive {{instructorSharePercent}}%.</p>' },
    ],
  });
});

describe('getAgreementForSigning', () => {
  it("shows an instructor their own pay split", async () => {
    mocks.findByToken.mockResolvedValue({ ...request, instructorId: 'inst-1' });
    mocks.instructorFindById.mockResolvedValue({
      id: 'inst-1',
      payRate: 0.75,
      payRateType: 'percentage',
    });

    const result = await handler({ token: 'tok' });

    expect(result.sections[0].content).toBe('<p>You receive 75%.</p>');
  });

  it('refuses to show an agreement with a term it cannot fill', async () => {
    mocks.findByToken.mockResolvedValue({ ...request, instructorId: 'inst-1' });
    mocks.instructorFindById.mockResolvedValue({ id: 'inst-1' });

    await expect(handler({ token: 'tok' })).rejects.toThrow(/failed-precondition/);
  });

  it('shows a template without placeholders unchanged, with no instructor lookup', async () => {
    mocks.templateFindById.mockResolvedValue({
      id: 'tpl-1',
      name: 'Waiver',
      supportsMinor: true,
      sections: [{ id: 'a', title: 'A', content: '<p>Plain</p>' }],
    });
    mocks.findByToken.mockResolvedValue(request);

    const result = await handler({ token: 'tok' });

    expect(result.sections[0].content).toBe('<p>Plain</p>');
    expect(mocks.instructorFindById).not.toHaveBeenCalled();
  });
});
