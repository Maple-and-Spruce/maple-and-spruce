/**
 * The pure rules half of the Firestore composite-index analyzer.
 *
 * Split out from `check-firestore-indexes.ts` (which is all TypeScript-AST
 * walking and filesystem work) so the rules that decide *whether* an index is
 * needed — and *what shape* it takes — are directly unit-testable. See
 * `firestore-index-rules.spec.ts`.
 */

// Equality-style operators don't have ranges; array-contains is its own beast.
export const ARRAY_OPS = new Set(['array-contains', 'array-contains-any']);

export type IndexField =
  | { fieldPath: string; order: 'ASCENDING' | 'DESCENDING' }
  | { fieldPath: string; arrayConfig: 'CONTAINS' };

export interface IndexSpec {
  collectionGroup: string;
  queryScope: 'COLLECTION' | 'COLLECTION_GROUP';
  fields: IndexField[];
}

/** The parts of a query chain the rules below actually reason about. */
export interface QueryShape {
  filters: Array<{ field: string; op: string }>;
  orderBys: Array<{ field: string; dir: 'asc' | 'desc' }>;
}

/**
 * Firestore composite-index rules in plain terms:
 *  - A single `.where()` with no `.orderBy()` on a different field: no composite needed.
 *  - 2+ `.where()` calls on *different* fields: composite needed.
 *  - `.where()` + `.orderBy()` on a different field: composite needed.
 *  - Any `array-contains` / `array-contains-any` + any other filter/orderBy: composite needed.
 *  - Range/inequality on a different field than `.orderBy()`: usually composite needed (we conservatively flag).
 *
 * Firestore indexes *fields*, not clauses. A two-sided range written as two
 * `.where()` calls on the same field (`scheduledAt >= from`, `scheduledAt <= to`,
 * ordered by `scheduledAt`) is still a single-field query, served by the
 * auto-created single-field index. Declaring it is not merely redundant —
 * `firebase deploy --only firestore:indexes` fails the whole job with
 * `HTTP Error: 400, this index is not necessary, configure using single field
 * index controls`, which is how #818 broke the dev index deploy. So we count
 * distinct fields, and `deriveIndexFields` is the final authority: anything
 * that collapses to fewer than two fields needs no composite index.
 */
export function needsCompositeIndex(chain: QueryShape): boolean {
  // Fewer than two distinct fields in the derived shape => no composite index
  // exists to declare. This guard is what keeps a rejected single-field entry
  // from ever being emitted, whatever the clause counting below concludes.
  if (deriveIndexFields(chain).length < 2) return false;

  const filterFields = new Set(chain.filters.map((f) => f.field));
  const orderByFields = new Set(chain.orderBys.map((o) => o.field));
  const filterCount = filterFields.size;
  const orderByCount = orderByFields.size;
  const hasArray = chain.filters.some((f) => ARRAY_OPS.has(f.op));

  if (filterCount === 0 && orderByCount <= 1) return false;
  if (filterCount >= 2) return true;
  if (hasArray && (filterCount + orderByCount) >= 2) return true;
  if (filterCount === 1 && orderByCount >= 1) {
    const [filterField] = filterFields;
    return chain.orderBys.some((o) => o.field !== filterField);
  }
  if (filterCount === 0 && orderByCount >= 2) return true;
  return false;
}

/**
 * Build the index shape Firestore wants. Field order:
 *   1. array-contains field (if any)
 *   2. equality / range fields, in source order
 *   3. orderBy fields, in source order
 */
export function deriveIndexFields(chain: QueryShape): IndexField[] {
  const fields: IndexField[] = [];
  const seen = new Set<string>();

  for (const f of chain.filters) {
    if (ARRAY_OPS.has(f.op)) {
      fields.push({ fieldPath: f.field, arrayConfig: 'CONTAINS' });
      seen.add(f.field);
    }
  }
  for (const f of chain.filters) {
    if (!ARRAY_OPS.has(f.op) && !seen.has(f.field)) {
      fields.push({ fieldPath: f.field, order: 'ASCENDING' });
      seen.add(f.field);
    }
  }
  for (const o of chain.orderBys) {
    if (seen.has(o.field)) continue;
    fields.push({
      fieldPath: o.field,
      order: o.dir === 'desc' ? 'DESCENDING' : 'ASCENDING',
    });
    seen.add(o.field);
  }
  return fields;
}

/**
 * Entries Firestore will refuse at deploy time. A COLLECTION-scoped index over
 * a single field duplicates the automatic single-field index, and
 * `firebase deploy --only firestore:indexes` rejects the *whole file* for it:
 *
 *   HTTP Error: 400, this index is not necessary, configure using single field
 *   index controls
 *
 * One bad entry therefore blocks every other index in the file from deploying
 * (#818). The analyzer's main job is "every required index is declared"; this
 * is the other direction — "every declared index is legal" — so a hand-added
 * or pasted entry gets caught at PR time instead of at merge-time deploy.
 */
export function findRejectedDeclarations(declared: IndexSpec[]): IndexSpec[] {
  return declared.filter(
    (d) => d.queryScope === 'COLLECTION' && (d.fields?.length ?? 0) < 2
  );
}

