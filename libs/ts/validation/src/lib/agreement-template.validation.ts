/**
 * Agreement Template validation suite
 *
 * Vest validation for agreement template creation and editing.
 * Used server-side in Cloud Functions.
 *
 * @see https://vestjs.dev/
 */
import { staticSuite, test, enforce, only } from 'vest';

export interface AgreementTemplateValidationInput {
  name?: string;
  description?: string;
  sections?: Array<{
    id?: string;
    title?: string;
    content?: string;
    responseType?: string;
  }>;
  classCategoryIds?: string[];
  autoAttach?: boolean;
  supportsMinor?: boolean;
}

export const agreementTemplateValidation = staticSuite(
  (data: AgreementTemplateValidationInput, field?: string | string[]) => {
    only(field);

    test('name', 'Name is required', () => {
      enforce(data.name).isNotBlank();
    });

    test('name', 'Name must be less than 200 characters', () => {
      if (data.name) {
        enforce(data.name).shorterThan(200);
      }
    });

    test('description', 'Description must be less than 1000 characters', () => {
      if (data.description) {
        enforce(data.description).shorterThanOrEquals(1000);
      }
    });

    test('sections', 'At least one section is required', () => {
      enforce(data.sections).isArray();
      enforce(data.sections).longerThanOrEquals(1);
    });

    test('sections', 'Each section must have an id, title, and content', () => {
      if (Array.isArray(data.sections)) {
        for (const section of data.sections) {
          enforce(section.id).isNotBlank();
          enforce(section.title).isNotBlank();
          enforce(section.content).isNotBlank();
        }
      }
    });

    test(
      'sections',
      'Section response type must be acknowledgment or media-release',
      () => {
        if (Array.isArray(data.sections)) {
          for (const section of data.sections) {
            if (section.responseType) {
              enforce(section.responseType).inside([
                'acknowledgment',
                'media-release',
              ]);
            }
          }
        }
      }
    );

    test('sections', 'Section IDs must be unique', () => {
      if (Array.isArray(data.sections)) {
        const ids = data.sections.map((s) => s.id).filter(Boolean);
        enforce(ids.length).equals(new Set(ids).size);
      }
    });
  }
);
