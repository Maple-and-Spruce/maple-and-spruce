// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Class, RequestState } from '@maple/ts/domain';
import { ClassTable } from './ClassTable';

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

describe('ClassTable', () => {
  it('renders the class name and a 0/capacity cell when no registrations are passed', () => {
    render(
      <ClassTable
        classesState={asState([baseClass])}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText('Hand-Building Pottery')).toBeInTheDocument();
    expect(screen.getByText('0/8')).toBeInTheDocument();
  });

  it('shows filled/capacity from registrationCounts and highlights when full', () => {
    render(
      <ClassTable
        classesState={asState([baseClass])}
        registrationCounts={new Map([[baseClass.id, 8]])}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText('8/8')).toBeInTheDocument();
  });

  it('renders a draft with no sessions without crashing', () => {
    const draftCopy: Class = { ...baseClass, id: 'class-copy', sessions: [] };
    expect(() =>
      render(
        <ClassTable
          classesState={asState([draftCopy])}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      )
    ).not.toThrow();
    expect(screen.getByText('No dates set')).toBeInTheDocument();
  });

  it('shows the empty-state message when filters cull every class', () => {
    render(
      <ClassTable
        classesState={asState([])}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(
      screen.getByText('No classes match your filters')
    ).toBeInTheDocument();
  });
});
