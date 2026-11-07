/**
 * Checkbox acknowledgments and per-signer variables in agreement templates.
 *
 * Shared by the public signing page (what to render) and the signing function
 * (what to require and what to record), so both read the same list.
 */
import type { AgreementSection } from './agreement-template';
import type { Instructor } from './instructor';

/** Label for an acknowledgment section that has no statements of its own. */
export const SECTION_ACKNOWLEDGMENT_TEXT = 'I have read and agree to this section.';

/** One checkbox the signer must tick before signing. */
export interface RequiredAcknowledgment {
  /** Stable within a template version: `<sectionId>:<index>`, or `<sectionId>:section`. */
  key: string;
  sectionId: string;
  text: string;
}

/** An acknowledgment as recorded on the signed agreement. */
export interface RecordedAcknowledgment {
  sectionId: string;
  text: string;
}

/**
 * Every checkbox a template asks for, in order.
 *
 * A section with `acknowledgmentItems` gets one checkbox per statement, so each
 * one is agreed to on its own and not buried in a paragraph. An acknowledgment
 * section without statements gets a single "I have read and agree" checkbox.
 */
export function requiredAcknowledgments(
  sections: readonly AgreementSection[]
): RequiredAcknowledgment[] {
  const required: RequiredAcknowledgment[] = [];
  for (const section of sections) {
    const items = (section.acknowledgmentItems ?? [])
      .map((text) => text.trim())
      .filter((text) => text.length > 0);
    if (items.length > 0) {
      items.forEach((text, index) =>
        required.push({ key: `${section.id}:${index}`, sectionId: section.id, text })
      );
    } else if (section.responseType === 'acknowledgment') {
      required.push({
        key: `${section.id}:section`,
        sectionId: section.id,
        text: SECTION_ACKNOWLEDGMENT_TEXT,
      });
    }
  }
  return required;
}

/** The required checkboxes whose keys are not in `checkedKeys`. */
export function missingAcknowledgments(
  sections: readonly AgreementSection[],
  checkedKeys: readonly string[] | undefined
): RequiredAcknowledgment[] {
  const checked = new Set(checkedKeys ?? []);
  return requiredAcknowledgments(sections).filter((a) => !checked.has(a.key));
}

/**
 * Values a template can refer to as `{{name}}`. Filled per request, so one
 * template serves instructors on different splits.
 */
export interface AgreementVariables {
  /** e.g. "75" for an instructor on 75% */
  instructorSharePercent?: string;
  /** e.g. "25" */
  studioSharePercent?: string;
}

/** The pay split for an instructor on a percentage rate. Empty otherwise. */
export function instructorAgreementVariables(
  instructor: Pick<Instructor, 'payRate' | 'payRateType'> | undefined
): AgreementVariables {
  if (
    !instructor ||
    instructor.payRateType !== 'percentage' ||
    typeof instructor.payRate !== 'number' ||
    instructor.payRate <= 0 ||
    instructor.payRate > 1
  ) {
    return {};
  }
  const share = Math.round(instructor.payRate * 1000) / 10;
  const studio = Math.round((100 - share) * 10) / 10;
  return {
    instructorSharePercent: String(share),
    studioSharePercent: String(studio),
  };
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

/**
 * Fill `{{name}}` placeholders in every section's title, content and
 * statements. Placeholders with no value are left in place and listed in
 * `unresolved`, so a caller can refuse to show an agreement with a blank term.
 */
export function applyAgreementVariables(
  sections: readonly AgreementSection[],
  variables: AgreementVariables
): { sections: AgreementSection[]; unresolved: string[] } {
  const unresolved = new Set<string>();
  const fill = (text: string): string =>
    text.replace(PLACEHOLDER, (match, name: string) => {
      const value = (variables as Record<string, string | undefined>)[name];
      if (value === undefined) {
        unresolved.add(name);
        return match;
      }
      return value;
    });

  const filled = sections.map((section) => ({
    ...section,
    title: fill(section.title),
    content: fill(section.content),
    ...(section.acknowledgmentItems
      ? { acknowledgmentItems: section.acknowledgmentItems.map(fill) }
      : {}),
  }));
  return { sections: filled, unresolved: [...unresolved] };
}
