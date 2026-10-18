'use client';

/**
 * The instructor form's "send contractor agreement" panel, wired to the
 * agreements router. Signing is recorded on the instructor by the server; this
 * only mirrors a signature that landed while the form was open into the form,
 * so saving it doesn't clear the date.
 */
import { useCallback, useEffect } from 'react';
import { InstructorAgreementPanel } from '@maple/react/agreements';
import type { AgreementFormContext } from '@maple/react/instructors';
import {
  contractorAgreementSignedOnline,
  instructorAgreementState,
  type Instructor,
} from '@maple/ts/domain';
import { useAgreementRequests, useAgreementTemplates } from '../../../hooks';

export function InstructorAgreementActions({
  instructor,
  form,
}: {
  instructor: Instructor;
  form: AgreementFormContext;
}) {
  const { requestsState, sendRequest, resendRequest } = useAgreementRequests({
    instructorId: instructor.id,
  });
  const { templatesState } = useAgreementTemplates({ status: 'active' });

  const signed =
    requestsState.status === 'success'
      ? instructorAgreementState(requestsState.data)
      : undefined;
  const { agreementSignedOn, recordSigned } = form;
  useEffect(() => {
    if (signed?.kind !== 'signed' || agreementSignedOn) return;
    const { updatedAt, signedAgreementId } = signed.request;
    if (!signedAgreementId) return;
    recordSigned(
      contractorAgreementSignedOnline(new Date(updatedAt), signedAgreementId)
    );
  }, [signed, agreementSignedOn, recordSigned]);

  const handleSend = useCallback(
    async (templateId: string) => {
      if (!instructor.email) return;
      await sendRequest({
        templateId,
        signerEmail: instructor.email,
        signerName: instructor.name,
        deliveryMethod: 'email',
        instructorId: instructor.id,
      });
    },
    [instructor, sendRequest]
  );

  return (
    <InstructorAgreementPanel
      signerName={instructor.name}
      signerEmail={instructor.email}
      requestsState={requestsState}
      templatesState={templatesState}
      onSend={handleSend}
      onResend={resendRequest}
    />
  );
}
