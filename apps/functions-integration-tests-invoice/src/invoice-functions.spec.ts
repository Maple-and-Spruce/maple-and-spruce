import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  callFunction,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import {
  ADMIN_USER,
  NON_ADMIN_USER,
} from '@maple/firebase/integration-test-utils';
import type {
  CreateStudentRequest,
  CreateStudentResponse,
  CreateInvoiceRequest,
  CreateInvoiceResponse,
  GetInvoicesRequest,
  GetInvoicesResponse,
  UpdateInvoiceRequest,
  UpdateInvoiceResponse,
  DeleteInvoiceRequest,
  DeleteInvoiceResponse,
} from '@maple/ts/firebase/api-types';

const privatePayStudent: CreateStudentRequest = {
  name: 'Private-pay Kid',
  instrument: 'violin',
  isAdultStudent: false,
  primaryTeacherId: 'instructor-test',
  isHopeScholarship: false,
  primaryContactName: 'Parent',
  primaryContactEmail: 'parent@test.com',
  status: 'active',
};

const hopeStudent: CreateStudentRequest = {
  name: 'Hope Kid',
  instrument: 'piano',
  isAdultStudent: false,
  primaryTeacherId: 'instructor-test',
  isHopeScholarship: true,
  primaryContactName: 'Hope Parent',
  primaryContactEmail: 'hope@test.com',
  status: 'active',
};

describe('Invoice Functions', () => {
  let adminUser: TestUser;
  let nonAdminUser: TestUser;
  let privateStudentId: string;
  let hopeStudentId: string;

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();

    adminUser = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    nonAdminUser = await createTestUser(
      NON_ADMIN_USER.email,
      NON_ADMIN_USER.password
    );

    await setFirestoreDoc('admins', adminUser.uid, {
      userId: adminUser.uid,
      email: adminUser.email,
    });

    const privateResult = await callFunction<
      CreateStudentRequest,
      CreateStudentResponse
    >({
      functionName: 'createStudent',
      data: privatePayStudent,
      idToken: adminUser.idToken,
    });
    privateStudentId = privateResult.data!.student.id;

    const hopeResult = await callFunction<
      CreateStudentRequest,
      CreateStudentResponse
    >({
      functionName: 'createStudent',
      data: hopeStudent,
      idToken: adminUser.idToken,
    });
    hopeStudentId = hopeResult.data!.student.id;
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  const sampleInvoice = (
    studentId: string
  ): CreateInvoiceRequest => ({
    studentId,
    lineItems: [
      {
        id: 'line-1',
        description: 'April tuition',
        quantity: 4,
        unitAmountCents: 3250,
        subtotalCents: 13000,
      },
    ],
  });

  describe('Auth guard', () => {
    it('rejects unauthenticated createInvoice', async () => {
      const result = await callFunction<CreateInvoiceRequest>({
        functionName: 'createInvoice',
        data: sampleInvoice(privateStudentId),
      });
      expect(result.status).toBe(401);
    });

    it('rejects non-admin createInvoice', async () => {
      const result = await callFunction<CreateInvoiceRequest>({
        functionName: 'createInvoice',
        data: sampleInvoice(privateStudentId),
        idToken: nonAdminUser.idToken,
      });
      expect([403, 500]).toContain(result.status);
    });
  });

  describe('Hope Scholarship guard', () => {
    it('rejects createInvoice for a Hope Scholarship student', async () => {
      const result = await callFunction<CreateInvoiceRequest>({
        functionName: 'createInvoice',
        data: sampleInvoice(hopeStudentId),
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });

    it('rejects createInvoice for a non-existent student', async () => {
      const result = await callFunction<CreateInvoiceRequest>({
        functionName: 'createInvoice',
        data: sampleInvoice('nonexistent-student'),
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });
  });

  describe('CRUD lifecycle', () => {
    let invoiceId: string;

    it('creates a draft invoice with server-computed total', async () => {
      const result = await callFunction<
        CreateInvoiceRequest,
        CreateInvoiceResponse
      >({
        functionName: 'createInvoice',
        data: {
          studentId: privateStudentId,
          lineItems: [
            {
              id: 'line-1',
              description: 'April tuition',
              quantity: 4,
              unitAmountCents: 3250,
              subtotalCents: 0, // client may send stale; server recomputes
            },
          ],
          notes: 'Mailed to parent 4/20',
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.invoice.status).toBe('draft');
      expect(result.data?.invoice.totalCents).toBe(13000);
      expect(result.data?.invoice.lineItems[0].subtotalCents).toBe(13000);
      expect(result.data?.invoice.issuedAt).toBeUndefined();
      expect(result.data?.invoice.paidAt).toBeUndefined();

      invoiceId = result.data!.invoice.id;
    });

    it('gets an invoice by studentId filter', async () => {
      const result = await callFunction<
        GetInvoicesRequest,
        GetInvoicesResponse
      >({
        functionName: 'getInvoices',
        data: { studentId: privateStudentId },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data!.invoices.length).toBeGreaterThanOrEqual(1);
      expect(
        result.data!.invoices.every((i) => i.studentId === privateStudentId)
      ).toBe(true);
    });

    it('edits line items and recomputes totalCents', async () => {
      const result = await callFunction<
        UpdateInvoiceRequest,
        UpdateInvoiceResponse
      >({
        functionName: 'updateInvoice',
        data: {
          id: invoiceId,
          lineItems: [
            {
              id: 'line-1',
              description: 'April tuition',
              quantity: 4,
              unitAmountCents: 3250,
              subtotalCents: 13000,
            },
            {
              id: 'line-2',
              description: 'Makeup lesson',
              quantity: 1,
              unitAmountCents: 3250,
              subtotalCents: 3250,
            },
          ],
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data!.invoice.lineItems.length).toBe(2);
      expect(result.data!.invoice.totalCents).toBe(16250);
    });

    it('transitions draft → sent and stamps issuedAt', async () => {
      const result = await callFunction<
        UpdateInvoiceRequest,
        UpdateInvoiceResponse
      >({
        functionName: 'updateInvoice',
        data: { id: invoiceId, status: 'sent' },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data!.invoice.status).toBe('sent');
      expect(result.data!.invoice.issuedAt).toBeTruthy();
      expect(result.data!.invoice.paidAt).toBeUndefined();
    });

    it('transitions sent → paid and stamps paidAt + paymentRecord (admin-manual)', async () => {
      const result = await callFunction<
        UpdateInvoiceRequest,
        UpdateInvoiceResponse
      >({
        functionName: 'updateInvoice',
        data: { id: invoiceId, status: 'paid' },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data!.invoice.status).toBe('paid');
      expect(result.data!.invoice.paidAt).toBeTruthy();
      expect(result.data!.invoice.issuedAt).toBeTruthy();
      // Manual paid transitions are attributed to the admin (#281).
      expect(result.data!.invoice.paymentRecord).toBeTruthy();
      expect(result.data!.invoice.paymentRecord?.source).toBe('admin-manual');
      expect(result.data!.invoice.paymentRecord?.squarePaymentId).toBeUndefined();
    });

    it('rejects paid → sent (invalid transition)', async () => {
      const result = await callFunction<UpdateInvoiceRequest>({
        functionName: 'updateInvoice',
        data: { id: invoiceId, status: 'sent' },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });

    it('allows paid → void (refund)', async () => {
      const result = await callFunction<
        UpdateInvoiceRequest,
        UpdateInvoiceResponse
      >({
        functionName: 'updateInvoice',
        data: { id: invoiceId, status: 'void' },
        idToken: adminUser.idToken,
      });
      expect(result.status).toBe(200);
      expect(result.data!.invoice.status).toBe('void');
    });

    it('rejects void → anything (terminal)', async () => {
      const result = await callFunction<UpdateInvoiceRequest>({
        functionName: 'updateInvoice',
        data: { id: invoiceId, status: 'draft' },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });

    it('rejects deleteInvoice once voided (must stay draft for hard delete)', async () => {
      const result = await callFunction<DeleteInvoiceRequest>({
        functionName: 'deleteInvoice',
        data: { id: invoiceId },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });
  });

  describe('Draft-only hard delete', () => {
    it('hard-deletes a draft invoice', async () => {
      const created = await callFunction<
        CreateInvoiceRequest,
        CreateInvoiceResponse
      >({
        functionName: 'createInvoice',
        data: sampleInvoice(privateStudentId),
        idToken: adminUser.idToken,
      });
      const id = created.data!.invoice.id;

      const del = await callFunction<
        DeleteInvoiceRequest,
        DeleteInvoiceResponse
      >({
        functionName: 'deleteInvoice',
        data: { id },
        idToken: adminUser.idToken,
      });
      expect(del.status).toBe(200);
      expect(del.data!.success).toBe(true);

      const get = await callFunction<GetInvoicesRequest, GetInvoicesResponse>({
        functionName: 'getInvoices',
        data: {},
        idToken: adminUser.idToken,
      });
      expect(get.data!.invoices.find((i) => i.id === id)).toBeUndefined();
    });

    it('rejects hard delete once sent', async () => {
      const created = await callFunction<
        CreateInvoiceRequest,
        CreateInvoiceResponse
      >({
        functionName: 'createInvoice',
        data: sampleInvoice(privateStudentId),
        idToken: adminUser.idToken,
      });
      const id = created.data!.invoice.id;

      await callFunction<UpdateInvoiceRequest>({
        functionName: 'updateInvoice',
        data: { id, status: 'sent' },
        idToken: adminUser.idToken,
      });

      const del = await callFunction<DeleteInvoiceRequest>({
        functionName: 'deleteInvoice',
        data: { id },
        idToken: adminUser.idToken,
      });
      expect(del.status).not.toBe(200);
    });
  });

  describe('Validation', () => {
    it('rejects an empty lineItems list', async () => {
      const result = await callFunction<Partial<CreateInvoiceRequest>>({
        functionName: 'createInvoice',
        data: {
          studentId: privateStudentId,
          lineItems: [],
        },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });

    it('rejects a line item with zero quantity', async () => {
      const result = await callFunction<Partial<CreateInvoiceRequest>>({
        functionName: 'createInvoice',
        data: {
          studentId: privateStudentId,
          lineItems: [
            {
              id: 'x',
              description: 'Test',
              quantity: 0,
              unitAmountCents: 1000,
              subtotalCents: 0,
            },
          ],
        },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });
  });

  describe('getInvoices status filter', () => {
    it('filters by status', async () => {
      const result = await callFunction<
        GetInvoicesRequest,
        GetInvoicesResponse
      >({
        functionName: 'getInvoices',
        data: { status: 'void' },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(
        result.data!.invoices.every((i) => i.status === 'void')
      ).toBe(true);
    });
  });
});
