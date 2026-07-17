/**
 * Get Invoices Cloud Function
 *
 * Lists private-pay invoices, filterable by studentId or status. Ordered
 * newest-created first.
 */
import {
  createRoleFunction,
  Role,
} from '@maple/firebase/functions';
import { InvoiceRepository } from '@maple/firebase/database';
import type {
  GetInvoicesRequest,
  GetInvoicesResponse,
} from '@maple/ts/firebase/api-types';

export const getInvoices = createRoleFunction<
  GetInvoicesRequest,
  GetInvoicesResponse
>(async (data) => {
  const invoices = await InvoiceRepository.findAll({
    studentId: data.studentId,
    status: data.status,
  });

  return { invoices };
}, [Role.Admin, Role.LessonTeacher]);
