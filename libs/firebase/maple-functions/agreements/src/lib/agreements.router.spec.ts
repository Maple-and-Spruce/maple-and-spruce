import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for the agreements router: each route's gate, and what it reads,
 * writes and refuses. The pipeline itself (auth, CORS, envelope) is tested in
 * `libs/firebase/functions`; the real gates are checked against the emulator
 * in the role matrix.
 */

const mocks = vi.hoisted(() => ({
  templateFindAll: vi.fn(),
  templateFindById: vi.fn(),
  templateCreate: vi.fn(),
  templateUpdate: vi.fn(),
  templateArchive: vi.fn(),
  requestFindAll: vi.fn(),
  requestFindById: vi.fn(),
  requestCreate: vi.fn(),
  requestMarkEmailSent: vi.fn(),
  signedFindAll: vi.fn(),
  signedFindById: vi.fn(),
  mailAdd: vi.fn(),
  getSignedUrl: vi.fn(),
  validation: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => {
  // Each route records its gate, the strings it asked for, and its handler.
  const chain = (strings: string[] = []) => ({
    usingStrings: (...names: string[]) => chain([...strings, ...names]),
    requiringRole: (roles: unknown) => ({
      asRoute: (handler: unknown) => ({ roles, strings, handler }),
    }),
  });
  const fail = (message: string): never => {
    throw new Error(message);
  };
  return {
    Functions: {
      endpoint: chain(),
      router: (_name: string, routes: unknown) => routes,
    },
    Role: { Admin: 'admin' },
    throwInvalidArgument: fail,
    throwNotFound: (entity: string, id: string) =>
      fail(`${entity} ${id} not found`),
    throwValidationError: (errors: unknown) =>
      fail(`invalid: ${JSON.stringify(errors)}`),
  };
});

vi.mock('@maple/firebase/database', () => ({
  AgreementTemplateRepository: {
    findAll: mocks.templateFindAll,
    findById: mocks.templateFindById,
    create: mocks.templateCreate,
    update: mocks.templateUpdate,
    archive: mocks.templateArchive,
  },
  AgreementRequestRepository: {
    findAll: mocks.requestFindAll,
    findById: mocks.requestFindById,
    create: mocks.requestCreate,
    markEmailSent: mocks.requestMarkEmailSent,
  },
  SignedAgreementRepository: {
    findAll: mocks.signedFindAll,
    findById: mocks.signedFindById,
  },
  getDb: () => ({ collection: () => ({ add: mocks.mailAdd }) }),
}));

vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({
    bucket: () => ({
      file: (path: string) => ({
        getSignedUrl: () => mocks.getSignedUrl(path),
      }),
    }),
  }),
}));

vi.mock('@maple/ts/validation', () => ({
  agreementTemplateValidation: mocks.validation,
}));

import { agreements, getAppUrl } from './agreements.router';

type Route = {
  roles: unknown;
  strings: string[];
  handler: (
    data: unknown,
    context?: unknown,
    secrets?: unknown,
    strings?: unknown,
  ) => Promise<unknown>;
};
const routes = agreements as unknown as Record<string, Route>;
const call = (name: string, data: unknown, strings?: Record<string, string>) =>
  routes[name].handler(data, {}, {}, strings);

const ORIGINS = {
  ALLOWED_ORIGINS: 'http://localhost:3000, https://business.example.com',
};
const valid = { hasErrors: () => false, getErrors: () => ({}) };
const template = {
  id: 'tpl-1',
  name: 'Studio Waiver',
  version: 3,
  status: 'active',
  sections: [],
};
const pending = {
  id: 'req-1',
  templateId: 'tpl-1',
  signerEmail: 'signer@example.com',
  signerName: 'Test Signer',
  signingToken: 'tok123',
  status: 'pending',
  expiresAt: new Date('2026-12-01T00:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.validation.mockReturnValue(valid);
});

describe('agreements router', () => {
  it('gates every route to admins', () => {
    expect(Object.keys(routes).sort()).toEqual([
      'createAgreementTemplate',
      'deleteAgreementTemplate',
      'getAgreementRequests',
      'getAgreementTemplate',
      'getAgreementTemplates',
      'getSignedAgreement',
      'getSignedAgreements',
      'resendAgreementRequest',
      'sendAgreementRequest',
      'updateAgreementTemplate',
    ]);
    for (const [name, route] of Object.entries(routes)) {
      expect(route.roles, name).toBe('admin');
    }
  });

  it('gives the two email routes the ALLOWED_ORIGINS string, and only them', () => {
    const withStrings = Object.entries(routes)
      .filter(([, route]) => route.strings.length > 0)
      .map(([name, route]) => [name, route.strings]);
    expect(withStrings).toEqual([
      ['sendAgreementRequest', ['ALLOWED_ORIGINS']],
      ['resendAgreementRequest', ['ALLOWED_ORIGINS']],
    ]);
  });
});

describe('getAppUrl', () => {
  it('prefers the first HTTPS origin', () => {
    expect(getAppUrl(ORIGINS.ALLOWED_ORIGINS)).toBe(
      'https://business.example.com',
    );
  });

  it('falls back to the first origin, then to localhost', () => {
    expect(getAppUrl('http://localhost:4200')).toBe('http://localhost:4200');
    expect(getAppUrl('')).toBe('');
  });
});

describe('templates', () => {
  it('lists templates by status', async () => {
    mocks.templateFindAll.mockResolvedValue([template]);
    await expect(
      call('getAgreementTemplates', { status: 'active' }),
    ).resolves.toEqual({
      templates: [template],
    });
    expect(mocks.templateFindAll).toHaveBeenCalledWith({ status: 'active' });
  });

  it('gets one template, or refuses a missing id or an unknown template', async () => {
    mocks.templateFindById.mockResolvedValueOnce(template);
    await expect(
      call('getAgreementTemplate', { id: 'tpl-1' }),
    ).resolves.toEqual({ template });
    await expect(call('getAgreementTemplate', {})).rejects.toThrow(
      /Template ID is required/,
    );
    mocks.templateFindById.mockResolvedValueOnce(undefined);
    await expect(call('getAgreementTemplate', { id: 'nope' })).rejects.toThrow(
      /not found/,
    );
  });

  it('creates a template only when it validates', async () => {
    mocks.templateCreate.mockResolvedValue(template);
    await expect(
      call('createAgreementTemplate', { name: 'Studio Waiver' }),
    ).resolves.toEqual({
      template,
    });

    mocks.validation.mockReturnValue({
      hasErrors: () => true,
      getErrors: () => ({ name: ['required'] }),
    });
    await expect(call('createAgreementTemplate', {})).rejects.toThrow(
      /invalid/,
    );
    expect(mocks.templateCreate).toHaveBeenCalledTimes(1);
  });

  it('validates only the changed fields of an update, against the merged record', async () => {
    mocks.templateFindById.mockResolvedValue(template);
    mocks.templateUpdate.mockResolvedValue({
      ...template,
      name: 'New Name',
      version: 4,
    });

    await call('updateAgreementTemplate', { id: 'tpl-1', name: 'New Name' });

    expect(mocks.validation).toHaveBeenCalledWith(
      { ...template, name: 'New Name' },
      ['name'],
    );
    expect(mocks.templateUpdate).toHaveBeenCalledWith({
      id: 'tpl-1',
      name: 'New Name',
    });
  });

  it('refuses to update an unknown template', async () => {
    mocks.templateFindById.mockResolvedValue(undefined);
    await expect(
      call('updateAgreementTemplate', { id: 'nope', name: 'x' }),
    ).rejects.toThrow(/not found/);
    expect(mocks.templateUpdate).not.toHaveBeenCalled();
  });

  it('archives rather than deletes', async () => {
    mocks.templateFindById.mockResolvedValue(template);
    await expect(
      call('deleteAgreementTemplate', { id: 'tpl-1' }),
    ).resolves.toEqual({ success: true });
    expect(mocks.templateArchive).toHaveBeenCalledWith('tpl-1');

    mocks.templateFindById.mockResolvedValue(undefined);
    await expect(
      call('deleteAgreementTemplate', { id: 'nope' }),
    ).rejects.toThrow(/not found/);
  });
});

describe('requests', () => {
  afterEach(() => vi.useRealTimers());

  it('lists requests by every filter', async () => {
    mocks.requestFindAll.mockResolvedValue([pending]);
    const filters = {
      status: 'pending',
      signerEmail: 'signer@example.com',
      classId: 'class-1',
      registrationId: 'reg-1',
    };
    await expect(call('getAgreementRequests', filters)).resolves.toEqual({
      requests: [pending],
    });
    expect(mocks.requestFindAll).toHaveBeenCalledWith(filters);
  });

  it('sends: creates a 30-day request at the template version and emails a signing link', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
    mocks.templateFindById.mockResolvedValue(template);
    mocks.requestCreate.mockImplementation(async (input) => ({
      id: 'req-9',
      ...input,
    }));

    const result = (await call(
      'sendAgreementRequest',
      {
        templateId: 'tpl-1',
        signerEmail: 'signer@example.com',
        signerName: 'Test Signer',
      },
      ORIGINS,
    )) as { request: { signingToken: string; emailSentAt: Date } };

    const created = mocks.requestCreate.mock.calls[0][0];
    expect(created).toMatchObject({
      templateId: 'tpl-1',
      templateVersion: 3,
      deliveryMethod: 'email',
      status: 'pending',
      expiresAt: new Date('2026-10-31T12:00:00Z'),
    });
    expect(created.signingToken).toMatch(/^[0-9a-f]{64}$/);
    expect(mocks.mailAdd).toHaveBeenCalledWith({
      to: 'signer@example.com',
      template: {
        name: 'agreement-signing-request',
        data: {
          signerName: 'Test Signer',
          templateName: 'Studio Waiver',
          signingUrl: `https://business.example.com/sign/${created.signingToken}`,
        },
      },
    });
    expect(mocks.requestMarkEmailSent).toHaveBeenCalledWith('req-9');
    expect(result.request.emailSentAt).toEqual(
      new Date('2026-10-01T12:00:00Z'),
    );
  });

  it.each([
    [
      { signerEmail: 'a@example.com', signerName: 'A' },
      /Template ID is required/,
    ],
    [{ templateId: 'tpl-1', signerName: 'A' }, /Signer email is required/],
    [
      { templateId: 'tpl-1', signerEmail: 'a@example.com' },
      /Signer name is required/,
    ],
  ])('refuses to send %j', async (input, error) => {
    await expect(call('sendAgreementRequest', input, ORIGINS)).rejects.toThrow(
      error,
    );
    expect(mocks.requestCreate).not.toHaveBeenCalled();
  });

  it('refuses to send from an archived template', async () => {
    mocks.templateFindById.mockResolvedValue({
      ...template,
      status: 'archived',
    });
    await expect(
      call(
        'sendAgreementRequest',
        { templateId: 'tpl-1', signerEmail: 'a@example.com', signerName: 'A' },
        ORIGINS,
      ),
    ).rejects.toThrow(/archived templates/);
    expect(mocks.mailAdd).not.toHaveBeenCalled();
  });

  it('resends the same signing link for a pending request', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
    mocks.requestFindById.mockResolvedValue(pending);
    mocks.templateFindById.mockResolvedValue(undefined);

    await call('resendAgreementRequest', { id: 'req-1' }, ORIGINS);

    expect(mocks.mailAdd).toHaveBeenCalledWith({
      to: 'signer@example.com',
      template: {
        name: 'agreement-signing-request',
        data: {
          signerName: 'Test Signer',
          templateName: 'Agreement',
          signingUrl: 'https://business.example.com/sign/tok123',
        },
      },
    });
    expect(mocks.requestMarkEmailSent).toHaveBeenCalledWith('req-1');
  });

  it.each([
    [
      'a signed request',
      { ...pending, status: 'signed' },
      /only resend emails for pending/,
    ],
    [
      'an expired request',
      { ...pending, expiresAt: new Date('2026-09-01T00:00:00Z') },
      /expired/,
    ],
  ])('refuses to resend %s', async (_label, request, error) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
    mocks.requestFindById.mockResolvedValue(request);
    await expect(
      call('resendAgreementRequest', { id: 'req-1' }, ORIGINS),
    ).rejects.toThrow(error);
    expect(mocks.mailAdd).not.toHaveBeenCalled();
  });
});

describe('signed agreements', () => {
  it('lists by signer and template', async () => {
    mocks.signedFindAll.mockResolvedValue([]);
    await call('getSignedAgreements', {
      signerEmail: 'a@example.com',
      templateId: 'tpl-1',
    });
    expect(mocks.signedFindAll).toHaveBeenCalledWith({
      signerEmail: 'a@example.com',
      templateId: 'tpl-1',
    });
  });

  it('returns download URLs for the signature, and the guardian signature when there is one', async () => {
    mocks.getSignedUrl.mockImplementation(async (path: string) => [
      `https://storage.example.com/${path}`,
    ]);
    mocks.signedFindById.mockResolvedValueOnce({
      id: 's-1',
      signatureImagePath: 'sig/s-1.png',
    });
    await expect(call('getSignedAgreement', { id: 's-1' })).resolves.toEqual({
      agreement: { id: 's-1', signatureImagePath: 'sig/s-1.png' },
      signatureImageUrl: 'https://storage.example.com/sig/s-1.png',
      guardianSignatureImageUrl: undefined,
    });

    mocks.signedFindById.mockResolvedValueOnce({
      id: 's-2',
      signatureImagePath: 'sig/s-2.png',
      guardianSignatureImagePath: 'sig/s-2-guardian.png',
    });
    const withGuardian = (await call('getSignedAgreement', {
      id: 's-2',
    })) as Record<string, unknown>;
    expect(withGuardian['guardianSignatureImageUrl']).toBe(
      'https://storage.example.com/sig/s-2-guardian.png',
    );
  });

  it('refuses a missing id or an unknown agreement', async () => {
    await expect(call('getSignedAgreement', {})).rejects.toThrow(
      /Agreement ID is required/,
    );
    mocks.signedFindById.mockResolvedValue(undefined);
    await expect(call('getSignedAgreement', { id: 'nope' })).rejects.toThrow(
      /not found/,
    );
  });
});
