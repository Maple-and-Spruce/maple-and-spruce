/**
 * Needs Attention API contracts (#807).
 */
import type { NeedsAttentionGroup } from '@maple/ts/domain';

export type GetNeedsAttentionRequest = Record<string, never>;

export interface GetNeedsAttentionResponse {
  /** Non-empty groups only, ordered by cost of ignoring them. */
  groups: NeedsAttentionGroup[];
  total: number;
  /**
   * True when the caller is a lesson teacher seeing only their own students.
   * The panel says so, otherwise an empty panel reads as "nothing is wrong"
   * when it may mean "nothing of yours is wrong".
   */
  scopedToSelf: boolean;
}
