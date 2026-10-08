import {
  ADMIN_USER,
  NON_ADMIN_USER,
  callFunction,
  clearAuthEmulator,
  clearFirestoreEmulator,
  createTestUser,
  getFirestoreDoc,
  listFirestoreDocs,
  setFirestoreDoc,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import type {
  CreateAgreementTemplateRequest,
  CreateAgreementTemplateResponse,
  GetAgreementRequestsResponse,
  GetAgreementTemplateResponse,
  GetAgreementTemplatesResponse,
  GetSignedAgreementsResponse,
  ResendAgreementRequestResponse,
  SendAgreementRequestResponse,
  UpdateAgreementTemplateResponse,
} from '@maple/ts/firebase/api-types';

/**
 * The agreements router (ADR-029, #66), end to end against the emulator.
 *
 * This domain had no integration coverage while it was ten standalone
 * functions. The suite pins what the admin Agreements page relies on: the
 * gate on every route, template CRUD with archive-not-delete, and that sending
 * a request stores it and queues a signing email whose link opens the signing
 * page with the request's own token.
 *
 * `getSignedAgreement` mints Cloud Storage signed URLs, which the emulator
 * cannot sign, so only its gate and not-found path are covered here; the URL
 * handling is unit-tested.
 */

const route = (name: string) => `agreements/${name}`;

function message(result: { error?: unknown }): string {
  return (result.error as { message?: string } | undefined)?.message ?? '';
}

const created = new Date('2026-01-01T12:00:00Z');

const waiver: CreateAgreementTemplateRequest = {
  name: 'Test Studio Waiver',
  description: 'For integration tests',
  sections: [{ id: 'liability', title: 'Liability', content: '<p>I accept the risks.</p>' }],
  classCategoryIds: [],
  autoAttach: false,
  signingRequirement: 'deferred',
  supportsMinor: false,
};

describe('agreements router', () => {
  let admin: TestUser;
  let nonAdmin: TestUser;
  let templateId: string;

  async function call<Req, Res>(name: string, data: Req, user: TestUser | null = admin) {
    return callFunction<Req, Res>({ functionName: route(name), data, idToken: user?.idToken });
  }

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();

    admin = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    nonAdmin = await createTestUser(NON_ADMIN_USER.email, NON_ADMIN_USER.password);
    await setFirestoreDoc('admins', admin.uid, { userId: admin.uid, email: admin.email });
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  it('gates every route to admins', async () => {
    const routes: Array<[string, unknown]> = [
      ['getAgreementTemplates', {}],
      ['getAgreementTemplate', { id: 'irrelevant' }],
      ['createAgreementTemplate', waiver],
      ['updateAgreementTemplate', { id: 'irrelevant', name: 'x' }],
      ['deleteAgreementTemplate', { id: 'irrelevant' }],
      ['getAgreementRequests', {}],
      ['sendAgreementRequest', { templateId: 'irrelevant', signerEmail: 'a@example.com', signerName: 'A' }],
      ['resendAgreementRequest', { id: 'irrelevant' }],
      ['getSignedAgreements', {}],
      ['getSignedAgreement', { id: 'irrelevant' }],
    ];
    for (const [name, data] of routes) {
      expect((await call(name, data, null)).status, `${name} unauthenticated`).toBe(401);
      expect((await call(name, data, nonAdmin)).status, `${name} non-admin`).toBe(403);
    }
    expect(await listFirestoreDocs('agreementTemplates')).toHaveLength(0);
    expect(await listFirestoreDocs('mail')).toHaveLength(0);
  });

  it('creates, reads, and updates a template, bumping its version', async () => {
    const createdTemplate = await call<CreateAgreementTemplateRequest, CreateAgreementTemplateResponse>(
      'createAgreementTemplate',
      waiver
    );
    expect(createdTemplate.status).toBe(200);
    templateId = createdTemplate.data!.template.id;
    expect(createdTemplate.data!.template).toMatchObject({ name: waiver.name, status: 'active', version: 1 });

    const fetched = await call<{ id: string }, GetAgreementTemplateResponse>('getAgreementTemplate', {
      id: templateId,
    });
    expect(fetched.data!.template.name).toBe(waiver.name);

    const updated = await call<{ id: string; name: string }, UpdateAgreementTemplateResponse>(
      'updateAgreementTemplate',
      { id: templateId, name: 'Test Studio Waiver v2' }
    );
    expect(updated.status).toBe(200);
    expect(updated.data!.template).toMatchObject({ name: 'Test Studio Waiver v2', version: 2 });

    const listed = await call<{ status: string }, GetAgreementTemplatesResponse>('getAgreementTemplates', {
      status: 'active',
    });
    expect(listed.data!.templates.map((t) => t.id)).toEqual([templateId]);
  });

  it('refuses an invalid template, and an update that blanks the name', async () => {
    const noSections = await call('createAgreementTemplate', { ...waiver, sections: [] });
    expect(noSections.status).toBe(400);
    expect(message(noSections)).toMatch(/section/i);

    const blankName = await call('updateAgreementTemplate', { id: templateId, name: '' });
    expect(blankName.status).toBe(400);
    expect(message(blankName)).toMatch(/Name is required/);
  });

  it('sends a request: stores it pending, and queues a signing email carrying its token', async () => {
    const sent = await call<unknown, SendAgreementRequestResponse>('sendAgreementRequest', {
      templateId,
      signerEmail: 'signer@example.com',
      signerName: 'Test Signer',
    });
    expect(sent.status).toBe(200);
    const request = sent.data!.request;
    expect(request).toMatchObject({
      templateId,
      templateVersion: 2,
      signerEmail: 'signer@example.com',
      status: 'pending',
      deliveryMethod: 'email',
    });

    const stored = await getFirestoreDoc('agreementRequests', request.id);
    expect(stored?.['emailSentAt']).toBeTruthy();

    const mail = await listFirestoreDocs('mail');
    expect(mail).toHaveLength(1);
    const email = mail[0].data as { to: string; template: { name: string; data: Record<string, string> } };
    expect(email.to).toBe('signer@example.com');
    expect(email.template.name).toBe('agreement-signing-request');
    expect(email.template.data['templateName']).toBe('Test Studio Waiver v2');
    expect(email.template.data['signingUrl']).toMatch(new RegExp(`/sign/${request.signingToken}$`));

    const requests = await call<unknown, GetAgreementRequestsResponse>('getAgreementRequests', {
      signerEmail: 'signer@example.com',
    });
    expect(requests.data!.requests.map((r) => r.id)).toEqual([request.id]);

    const resent = await call<unknown, ResendAgreementRequestResponse>('resendAgreementRequest', {
      id: request.id,
    });
    expect(resent.status).toBe(200);
    expect(await listFirestoreDocs('mail')).toHaveLength(2);
  });

  it('refuses to resend a request that is no longer pending', async () => {
    await setFirestoreDoc('agreementRequests', 'req-signed', {
      templateId,
      templateVersion: 2,
      signerEmail: 'signed@example.com',
      signerName: 'Already Signed',
      deliveryMethod: 'email',
      signingToken: 'signed-token',
      expiresAt: new Date('2099-01-01T00:00:00Z'),
      status: 'signed',
      createdAt: created,
      updatedAt: created,
    });
    const resend = await call('resendAgreementRequest', { id: 'req-signed' });
    expect(resend.status).toBe(400);
    expect(message(resend)).toMatch(/only resend emails for pending/);
  });

  it('archives a template on delete, and will not send from an archived one', async () => {
    const deleted = await call('deleteAgreementTemplate', { id: templateId });
    expect(deleted.status).toBe(200);
    expect((await getFirestoreDoc('agreementTemplates', templateId))?.['status']).toBe('archived');

    const send = await call('sendAgreementRequest', {
      templateId,
      signerEmail: 'late@example.com',
      signerName: 'Late Signer',
    });
    expect(send.status).toBe(400);
    expect(message(send)).toMatch(/archived templates/);
  });

  it('lists signed agreements by signer, and reports an unknown one', async () => {
    await setFirestoreDoc('signedAgreements', 'signed-1', {
      requestId: 'req-signed',
      templateId,
      templateVersion: 2,
      agreementHtmlSnapshot: '<p>I accept the risks.</p>',
      signerEmail: 'signed@example.com',
      printedName: 'Already Signed',
      signatureImagePath: 'agreements/signed-1/signature.png',
      isMinor: false,
      signedAt: created,
      createdAt: created,
    });

    const listed = await call<unknown, GetSignedAgreementsResponse>('getSignedAgreements', {
      signerEmail: 'signed@example.com',
    });
    expect(listed.status).toBe(200);
    expect(listed.data!.agreements.map((a) => a.id)).toEqual(['signed-1']);

    const unknown = await call('getSignedAgreement', { id: 'nope' });
    expect(unknown.status).toBe(400);
    expect(message(unknown)).toMatch(/not found/);
  });
});
