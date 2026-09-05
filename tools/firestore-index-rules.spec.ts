import { describe, it, expect } from 'vitest';
import {
  needsCompositeIndex,
  deriveIndexFields,
  findRejectedDeclarations,
  type IndexSpec,
  type QueryShape,
} from './firestore-index-rules';

function chain(
  filters: Array<{ field: string; op: string }>,
  orderBys: Array<{ field: string; dir: 'asc' | 'desc' }> = []
): QueryShape {
  return { filters, orderBys };
}

describe('needsCompositeIndex', () => {
  it('does not flag a two-sided range on the field it orders by', () => {
    // `LessonRepository.findAll({ from, to })` — two `.where()` calls, one
    // field. Firestore serves this from the auto-created single-field index
    // and rejects a declaration for it at deploy time with
    // "400, this index is not necessary" (the #818 dev-deploy failure).
    expect(
      needsCompositeIndex(
        chain(
          [
            { field: 'scheduledAt', op: '>=' },
            { field: 'scheduledAt', op: '<=' },
          ],
          [{ field: 'scheduledAt', dir: 'asc' }]
        )
      )
    ).toBe(false);
  });

  it('flags two filters on different fields', () => {
    expect(
      needsCompositeIndex(
        chain([
          { field: 'studentId', op: '==' },
          { field: 'status', op: '==' },
        ])
      )
    ).toBe(true);
  });

  it('still flags a same-field range once another field joins it', () => {
    expect(
      needsCompositeIndex(
        chain(
          [
            { field: 'scheduledAt', op: '>=' },
            { field: 'scheduledAt', op: '<=' },
            { field: 'teacherId', op: '==' },
          ],
          [{ field: 'scheduledAt', dir: 'asc' }]
        )
      )
    ).toBe(true);
  });

  it('flags a filter ordered by a different field', () => {
    expect(
      needsCompositeIndex(
        chain([{ field: 'studentId', op: '==' }], [
          { field: 'scheduledAt', dir: 'desc' },
        ])
      )
    ).toBe(true);
  });

  it('does not flag a filter ordered by that same field', () => {
    expect(
      needsCompositeIndex(
        chain([{ field: 'scheduledAt', op: '>=' }], [
          { field: 'scheduledAt', dir: 'asc' },
        ])
      )
    ).toBe(false);
  });

  it('does not flag a bare single-field order', () => {
    expect(
      needsCompositeIndex(chain([], [{ field: 'scheduledAt', dir: 'asc' }]))
    ).toBe(false);
  });

  it('flags two orderBys on different fields', () => {
    expect(
      needsCompositeIndex(
        chain([], [
          { field: 'status', dir: 'asc' },
          { field: 'scheduledAt', dir: 'asc' },
        ])
      )
    ).toBe(true);
  });

  it('flags array-contains combined with another field', () => {
    expect(
      needsCompositeIndex(
        chain([{ field: 'tags', op: 'array-contains' }], [
          { field: 'scheduledAt', dir: 'asc' },
        ])
      )
    ).toBe(true);
  });
});

describe('deriveIndexFields', () => {
  it('collapses repeated filters on one field to a single index field', () => {
    expect(
      deriveIndexFields(
        chain(
          [
            { field: 'scheduledAt', op: '>=' },
            { field: 'scheduledAt', op: '<=' },
          ],
          [{ field: 'scheduledAt', dir: 'asc' }]
        )
      )
    ).toEqual([{ fieldPath: 'scheduledAt', order: 'ASCENDING' }]);
  });

  it('puts the array-contains field first, then filters, then orderBys', () => {
    expect(
      deriveIndexFields(
        chain(
          [
            { field: 'studentId', op: '==' },
            { field: 'tags', op: 'array-contains' },
          ],
          [{ field: 'scheduledAt', dir: 'desc' }]
        )
      )
    ).toEqual([
      { fieldPath: 'tags', arrayConfig: 'CONTAINS' },
      { fieldPath: 'studentId', order: 'ASCENDING' },
      { fieldPath: 'scheduledAt', order: 'DESCENDING' },
    ]);
  });
});

describe('findRejectedDeclarations', () => {
  const declared: IndexSpec[] = [
    {
      collectionGroup: 'lessons',
      queryScope: 'COLLECTION',
      fields: [
        { fieldPath: 'studentId', order: 'ASCENDING' },
        { fieldPath: 'scheduledAt', order: 'ASCENDING' },
      ],
    },
    {
      collectionGroup: 'lessons',
      queryScope: 'COLLECTION',
      fields: [{ fieldPath: 'scheduledAt', order: 'ASCENDING' }],
    },
  ];

  it('catches the one-field entry that fails the whole index deploy', () => {
    // Firestore answers a COLLECTION-scoped single-field declaration with
    // "400, this index is not necessary" and deploys nothing else in the file.
    expect(findRejectedDeclarations(declared)).toEqual([declared[1]]);
  });

  it('leaves real composite indexes alone', () => {
    expect(findRejectedDeclarations([declared[0]])).toEqual([]);
  });

  it('does not touch collection-group scope, where one field is legal', () => {
    const groupScoped: IndexSpec[] = [
      {
        collectionGroup: 'lessons',
        queryScope: 'COLLECTION_GROUP',
        fields: [{ fieldPath: 'scheduledAt', order: 'ASCENDING' }],
      },
    ];

    expect(findRejectedDeclarations(groupScoped)).toEqual([]);
  });
});
