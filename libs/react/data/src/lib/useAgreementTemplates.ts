'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  AgreementTemplate,
  AgreementTemplateStatus,
  RequestState,
} from '@maple/ts/domain';
import type {
  GetAgreementTemplatesRequest,
  GetAgreementTemplatesResponse,
  CreateAgreementTemplateRequest,
  CreateAgreementTemplateResponse,
  UpdateAgreementTemplateRequest,
  UpdateAgreementTemplateResponse,
  DeleteAgreementTemplateRequest,
  DeleteAgreementTemplateResponse,
} from '@maple/ts/firebase/api-types';

export interface UseAgreementTemplatesFilters {
  status?: AgreementTemplateStatus;
}

export function useAgreementTemplates(
  filters?: UseAgreementTemplatesFilters
) {
  const [templatesState, setTemplatesState] = useState<
    RequestState<AgreementTemplate[]>
  >({ status: 'idle' });

  const fetchTemplates = useCallback(async () => {
    setTemplatesState({ status: 'loading' });
    try {
      const functions = getMapleFunctions();
      const getTemplates = httpsCallable<
        GetAgreementTemplatesRequest,
        GetAgreementTemplatesResponse
      >(functions, 'getAgreementTemplates');
      const result = await getTemplates({ status: filters?.status });
      setTemplatesState({ status: 'success', data: result.data.templates });
    } catch (error) {
      console.error('Failed to fetch agreement templates:', error);
      setTemplatesState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch templates',
      });
    }
  }, [filters?.status]);

  const createTemplate = useCallback(
    async (
      input: CreateAgreementTemplateRequest
    ): Promise<AgreementTemplate> => {
      const functions = getMapleFunctions();
      const create = httpsCallable<
        CreateAgreementTemplateRequest,
        CreateAgreementTemplateResponse
      >(functions, 'createAgreementTemplate');
      const result = await create(input);
      setTemplatesState((prev) => {
        if (prev.status !== 'success') return prev;
        return { ...prev, data: [...prev.data, result.data.template] };
      });
      return result.data.template;
    },
    []
  );

  const updateTemplate = useCallback(
    async (
      input: UpdateAgreementTemplateRequest
    ): Promise<AgreementTemplate> => {
      const functions = getMapleFunctions();
      const update = httpsCallable<
        UpdateAgreementTemplateRequest,
        UpdateAgreementTemplateResponse
      >(functions, 'updateAgreementTemplate');
      const result = await update(input);
      setTemplatesState((prev) => {
        if (prev.status !== 'success') return prev;
        return {
          ...prev,
          data: prev.data.map((t) =>
            t.id === result.data.template.id ? result.data.template : t
          ),
        };
      });
      return result.data.template;
    },
    []
  );

  const deleteTemplate = useCallback(async (id: string): Promise<void> => {
    const functions = getMapleFunctions();
    const del = httpsCallable<
      DeleteAgreementTemplateRequest,
      DeleteAgreementTemplateResponse
    >(functions, 'deleteAgreementTemplate');
    await del({ id });
    setTemplatesState((prev) => {
      if (prev.status !== 'success') return prev;
      return { ...prev, data: prev.data.filter((t) => t.id !== id) };
    });
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  return {
    templatesState,
    fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  };
}
