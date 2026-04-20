/**
 * Agreement Template domain types
 *
 * Versioned waiver/agreement templates managed by admin.
 * Each template has ordered sections (liability, safety, photo release, etc.)
 * and can be auto-attached to class registrations by category.
 *
 * Templates are also used standalone for music lesson agreements
 * or one-off waivers sent by admin.
 */

/**
 * Interactive response type for a section.
 * - 'acknowledgment': signer must check a box to acknowledge
 * - 'media-release': signer must choose from 3 options (grant, grant-without-name, deny)
 */
export type AgreementSectionResponseType = 'acknowledgment' | 'media-release';

/**
 * Media release choice options for the photo/media release section
 */
export type MediaReleaseChoice = 'grant' | 'grant-without-name' | 'deny';

/**
 * A single section of an agreement template.
 * Sections are rendered in order and may require interactive responses.
 */
export interface AgreementSection {
  /** Unique within the template, e.g. 'liability', 'medical', 'photo-release' */
  id: string;
  /** Display title, e.g. "Liability Waiver & Release of Claims" */
  title: string;
  /** HTML content for this section */
  content: string;
  /** If set, this section requires a specific interactive response from the signer */
  responseType?: AgreementSectionResponseType;
}

export type AgreementTemplateStatus = 'active' | 'archived';

export const AGREEMENT_TEMPLATE_STATUSES: AgreementTemplateStatus[] = [
  'active',
  'archived',
];

/**
 * Agreement Template entity
 */
export interface AgreementTemplate {
  id: string;
  /** Human-readable name, e.g. "Stained Glass Liability Waiver" */
  name: string;
  /** Internal admin description */
  description?: string;
  /** Ordered sections that make up the agreement */
  sections: AgreementSection[];
  /** Class categories this template applies to (empty = standalone/manual-only) */
  classCategoryIds: string[];
  /** Whether to auto-create agreement requests on registration for matching categories */
  autoAttach: boolean;
  /** Whether this template includes minor/guardian co-signature fields */
  supportsMinor: boolean;
  /** Version number, incremented on each edit */
  version: number;
  status: AgreementTemplateStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** Input for creating a new template. Server stamps version=1 + timestamps. */
export type CreateAgreementTemplateInput = {
  name: string;
  description?: string;
  sections: AgreementSection[];
  classCategoryIds: string[];
  autoAttach: boolean;
  supportsMinor: boolean;
};

/** Input for updating a template. Server bumps version + timestamps. */
export type UpdateAgreementTemplateInput = {
  id: string;
  name?: string;
  description?: string;
  sections?: AgreementSection[];
  classCategoryIds?: string[];
  autoAttach?: boolean;
  supportsMinor?: boolean;
  status?: AgreementTemplateStatus;
};
