'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  Invoice,
  CreateInvoiceInput,
  UpdateInvoiceInput,
  RequestState,
} from '@maple/ts/domain';
import type {
  GetInvoicesRequest,
  GetInvoicesResponse,
  CreateInvoiceRequest,
  CreateInvoiceResponse,
  UpdateInvoiceRequest,
  UpdateInvoiceResponse,
  DeleteInvoiceRequest,
  DeleteInvoiceResponse,
} from '@maple/ts/firebase/api-types';

export interface UseInvoicesOptions {
  /** Scope the list to a single student. */
  studentId?: string;
  /** Autofetch on mount. Defaults to true. */
  autoFetch?: boolean;
}

function hydrateInvoice(invoice: Invoice): Invoice {
  return {
    ...invoice,
    issuedAt: invoice.issuedAt ? new Date(invoice.issuedAt) : undefined,
    paidAt: invoice.paidAt ? new Date(invoice.paidAt) : undefined,
    createdAt: new Date(invoice.createdAt),
    updatedAt: new Date(invoice.updatedAt),
  };
}

/**
 * Hook for managing private-pay music lesson invoices. Hope Scholarship
 * students must NOT flow through this hook — the cloud function rejects
 * them server-side (#282). UI callers should use the
 * `student.isHopeScholarship` flag to hide invoice actions.
 */
export function useInvoices({
  studentId,
  autoFetch = true,
}: UseInvoicesOptions = {}) {
  const [invoicesState, setInvoicesState] = useState<
    RequestState<Invoice[]>
  >({ status: 'idle' });

  const fetchInvoices = useCallback(async () => {
    setInvoicesState({ status: 'loading' });

    try {
      const functions = getMapleFunctions();
      const getInvoices = httpsCallable<
        GetInvoicesRequest,
        GetInvoicesResponse
      >(functions, 'getInvoices');

      const result = await getInvoices({ studentId });
      setInvoicesState({
        status: 'success',
        data: result.data.invoices.map(hydrateInvoice),
      });
    } catch (error) {
      console.error('Failed to fetch invoices:', error);
      setInvoicesState({
        status: 'error',
        error:
          error instanceof Error ? error.message : 'Failed to fetch invoices',
      });
    }
  }, [studentId]);

  const createInvoice = useCallback(
    async (input: CreateInvoiceInput): Promise<Invoice> => {
      const functions = getMapleFunctions();
      const create = httpsCallable<
        CreateInvoiceRequest,
        CreateInvoiceResponse
      >(functions, 'createInvoice');

      const result = await create(input);
      const invoice = hydrateInvoice(result.data.invoice);

      setInvoicesState((prev) => {
        if (prev.status !== 'success') return prev;
        // newest first (matches server ordering)
        return { ...prev, data: [invoice, ...prev.data] };
      });

      return invoice;
    },
    []
  );

  const updateInvoice = useCallback(
    async (input: UpdateInvoiceInput): Promise<Invoice> => {
      const functions = getMapleFunctions();
      const update = httpsCallable<
        UpdateInvoiceRequest,
        UpdateInvoiceResponse
      >(functions, 'updateInvoice');

      const result = await update(input);
      const invoice = hydrateInvoice(result.data.invoice);

      setInvoicesState((prev) => {
        if (prev.status !== 'success') return prev;
        return {
          ...prev,
          data: prev.data.map((i) => (i.id === invoice.id ? invoice : i)),
        };
      });

      return invoice;
    },
    []
  );

  const deleteInvoice = useCallback(async (id: string): Promise<void> => {
    const functions = getMapleFunctions();
    const del = httpsCallable<DeleteInvoiceRequest, DeleteInvoiceResponse>(
      functions,
      'deleteInvoice'
    );
    await del({ id });

    setInvoicesState((prev) => {
      if (prev.status !== 'success') return prev;
      return { ...prev, data: prev.data.filter((i) => i.id !== id) };
    });
  }, []);

  useEffect(() => {
    if (autoFetch) {
      fetchInvoices();
    }
  }, [fetchInvoices, autoFetch]);

  return {
    invoicesState,
    fetchInvoices,
    createInvoice,
    updateInvoice,
    deleteInvoice,
  };
}
