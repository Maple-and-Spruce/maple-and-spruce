/**
 * The contractor-readiness part of the instructor form, as flat strings (what
 * inputs hold) and the conversion to and from the nested domain record.
 */
import type {
  Instructor,
  InstructorPaymentSetupMethod,
  InstructorReadiness,
} from '@maple/ts/domain';

export interface ReadinessFormValues {
  isContractor: boolean;
  /** `YYYY-MM-DD`, or '' when not done. */
  agreementSignedOn: string;
  agreementReference: string;
  backgroundCheckClearedOn: string;
  paymentSetupCompletedOn: string;
  paymentSetupMethod: InstructorPaymentSetupMethod | '';
}

/**
 * Form values for an instructor being edited, or a new one. A new instructor
 * starts as a contractor: that is who is being onboarded, and an unticked box
 * would silently skip every warning.
 */
export function readinessFormValuesFrom(
  instructor?: Pick<Instructor, 'isContractor' | 'readiness'>
): ReadinessFormValues {
  const r = instructor?.readiness;
  return {
    isContractor: instructor ? !!instructor.isContractor : true,
    agreementSignedOn: r?.contractorAgreement?.signedOn ?? '',
    agreementReference: r?.contractorAgreement?.reference ?? '',
    backgroundCheckClearedOn: r?.backgroundCheck?.clearedOn ?? '',
    paymentSetupCompletedOn: r?.paymentSetup?.completedOn ?? '',
    paymentSetupMethod: r?.paymentSetup?.method ?? '',
  };
}

/**
 * The domain record for these values. An item is present once any of its
 * inputs is filled, so a half-filled item (a method with no date) reaches
 * validation and is reported, rather than being quietly dropped.
 *
 * Always returns an object: the update replaces the stored record, so an
 * item cleared in the form is cleared in Firestore.
 */
export function readinessFromFormValues(v: ReadinessFormValues): {
  isContractor: boolean;
  readiness: InstructorReadiness;
} {
  const readiness: InstructorReadiness = {};
  const reference = v.agreementReference.trim();

  if (v.agreementSignedOn || reference) {
    readiness.contractorAgreement = {
      signedOn: v.agreementSignedOn,
      ...(reference ? { reference } : {}),
    };
  }
  if (v.backgroundCheckClearedOn) {
    readiness.backgroundCheck = { clearedOn: v.backgroundCheckClearedOn };
  }
  if (v.paymentSetupCompletedOn || v.paymentSetupMethod) {
    readiness.paymentSetup = {
      completedOn: v.paymentSetupCompletedOn,
      method: v.paymentSetupMethod as InstructorPaymentSetupMethod,
    };
  }

  return { isContractor: v.isContractor, readiness };
}
