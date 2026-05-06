// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Class, RequestState } from '@maple/ts/domain';
import { ClassList } from './ClassList';

// Vitest doesn't run testing-library cleanup between tests when many spec
// files share the same vitest run (e.g. the root coverage job), so a stray
// previous render can leak its DOM into the next test's `screen` queries.
afterEach(cleanup);

const baseClass: Class = {
  id: 'class-1',
  name: 'Hand-Building Pottery',
  description: 'Coil and slab construction techniques.',
  shortDescription: 'No wheel required.',
  instructorId: 'instructor-1',
  sessions: [{ dateTime: new Date('2099-06-15T14:00:00Z') }],
  durationMinutes: 90,
  capacity: 8,
  priceCents: 5500,
  skillLevel: 'beginner',
  status: 'draft',
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

function asState(classes: Class[]): RequestState<Class[]> {
  return { status: 'success', data: classes };
}

describe('ClassList', () => {
  it('renders an empty-sessions draft (e.g., a freshly Copied class) without crashing', () => {
    const draftCopy: Class = {
      ...baseClass,
      id: 'class-copy',
      name: 'Hand-Building Pottery (Copy)',
      sessions: [],
    };

    expect(() =>
      render(
        <ClassList
          classesState={asState([draftCopy])}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      )
    ).not.toThrow();

    // The card renders with the placeholder date line instead of the schedule
    expect(screen.getByText('Hand-Building Pottery (Copy)')).toBeInTheDocument();
    expect(screen.getByText('No dates set')).toBeInTheDocument();
  });

  it('renders a class with sessions normally', () => {
    render(
      <ClassList
        classesState={asState([baseClass])}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText('Hand-Building Pottery')).toBeInTheDocument();
    expect(screen.queryByText('No dates set')).not.toBeInTheDocument();
  });
});
