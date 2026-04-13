// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Helper to set an input's value in one shot (avoids per-keystroke
 * simulation with userEvent.type which times out on CI).
 */
function setInputValue(element: HTMLElement, value: string): void {
  fireEvent.change(element, { target: { value } });
}

// Mock all external @maple/* and firebase deps so vitest doesn't need
// to resolve cross-library imports (matches existing test patterns).
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(),
}));

vi.mock('@maple/ts/firebase/firebase-config', () => ({
  getMapleFunctions: vi.fn(),
}));

vi.mock('@maple/react/ui', () => ({
  ImageUpload: (props: Record<string, unknown>) => (
    <div data-testid="image-upload">{String(props['label'] ?? '')}</div>
  ),
}));

import { ClassForm } from './ClassForm';

// A future date that won't expire during tests
const futureDate = new Date('2099-06-15T14:00:00');

// MUI + DateTimePicker + Preact Signals rendering is slow on CI
describe('ClassForm', { timeout: 30_000 }, () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(undefined),
    defaultDateTime: futureDate,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validation error display', () => {
    it('shows validation error summary when submitting with empty required fields', async () => {
      const user = userEvent.setup();

      render(<ClassForm {...defaultProps} />);

      const addButton = screen.getByRole('button', { name: 'Add' });
      await user.click(addButton);

      // Should show the error summary alert
      const alerts = screen.getAllByRole('alert');
      const errorAlert = alerts.find((a) =>
        a.textContent?.includes('Please fix the following errors')
      );
      expect(errorAlert).toBeDefined();
      expect(errorAlert!.textContent).toContain('Class Name');

      // onSubmit should NOT have been called
      expect(defaultProps.onSubmit).not.toHaveBeenCalled();
    });

    it('shows inline field errors on individual fields after submit attempt', async () => {
      const user = userEvent.setup();

      render(<ClassForm {...defaultProps} />);

      const addButton = screen.getByRole('button', { name: 'Add' });
      await user.click(addButton);

      // The Class Name input should be marked invalid
      const nameInput = screen.getByRole('textbox', { name: /Class Name/ });
      expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    });

    it('shows instructor error when status is published and no instructor is selected', async () => {
      const user = userEvent.setup();

      render(<ClassForm {...defaultProps} />);

      // Change status to Published via the combobox
      const statusSelect = screen.getByRole('combobox', { name: /Status/ });
      await user.click(statusSelect);
      const publishedOption = screen.getByRole('option', {
        name: 'Published',
      });
      await user.click(publishedOption);

      // Fill in required fields to isolate the instructor error
      setInputValue(
        screen.getByRole('textbox', { name: /Class Name/ }),
        'A Valid Class Name'
      );
      setInputValue(
        screen.getByRole('textbox', { name: /Full Description/ }),
        'This is a detailed description that is at least twenty characters long.'
      );

      // Click Add
      const addButton = screen.getByRole('button', { name: 'Add' });
      await user.click(addButton);

      // Error summary should mention Instructor
      const alerts = screen.getAllByRole('alert');
      const errorAlert = alerts.find((a) =>
        a.textContent?.includes('Please fix the following errors')
      );
      expect(errorAlert).toBeDefined();
      expect(errorAlert!.textContent).toContain('Instructor');
      expect(errorAlert!.textContent).toContain(
        'Instructor is required for published classes'
      );

      // The instructor error should also appear inline
      expect(
        screen.getByText('Instructor is required for published classes')
      ).toBeInTheDocument();

      expect(defaultProps.onSubmit).not.toHaveBeenCalled();
    });

    it('shows instructor dropdown with error even when no instructors are loaded', async () => {
      const user = userEvent.setup();

      // Render WITHOUT instructors prop (empty array is default)
      render(<ClassForm {...defaultProps} />);

      // Change status to Published
      const statusSelect = screen.getByRole('combobox', { name: /Status/ });
      await user.click(statusSelect);
      await user.click(screen.getByRole('option', { name: 'Published' }));

      // Before clicking Add, instructor combobox should not be visible
      expect(
        screen.queryByRole('combobox', { name: /Instructor/ })
      ).not.toBeInTheDocument();

      // Click Add to trigger validation
      await user.click(screen.getByRole('button', { name: 'Add' }));

      // Now instructor field should appear with error
      const instructorSelect = screen.getByRole('combobox', {
        name: /Instructor/,
      });
      expect(instructorSelect).toBeInTheDocument();
    });

    it('does not show error summary when form is valid', async () => {
      const user = userEvent.setup();

      render(
        <ClassForm
          {...defaultProps}
          instructors={[
            {
              id: 'inst-1',
              name: 'Jane Doe',
              email: 'jane@example.com',
              status: 'active' as const,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]}
        />
      );

      // Fill in all required fields
      setInputValue(
        screen.getByRole('textbox', { name: /Class Name/ }),
        'Pottery Workshop'
      );
      setInputValue(
        screen.getByRole('textbox', { name: /Full Description/ }),
        'Learn the basics of pottery in this hands-on workshop.'
      );

      // Click Add
      const addButton = screen.getByRole('button', { name: 'Add' });
      await user.click(addButton);

      // Should not show validation error summary
      const alerts = screen.queryAllByRole('alert');
      const errorAlert = alerts.find((a) =>
        a.textContent?.includes('Please fix the following errors')
      );
      expect(errorAlert).toBeUndefined();
    });

    it('clears error summary when errors are fixed', async () => {
      const user = userEvent.setup();

      render(<ClassForm {...defaultProps} />);

      // Submit with empty name to trigger errors
      const addButton = screen.getByRole('button', { name: 'Add' });
      await user.click(addButton);

      // Should show errors
      const errorAlerts = screen
        .getAllByRole('alert')
        .filter((a) =>
          a.textContent?.includes('Please fix the following errors')
        );
      expect(errorAlerts.length).toBeGreaterThan(0);

      // Fix name and description
      setInputValue(
        screen.getByRole('textbox', { name: /Class Name/ }),
        'A Valid Class Name'
      );
      setInputValue(
        screen.getByRole('textbox', { name: /Full Description/ }),
        'This is a detailed description that is at least twenty characters long.'
      );

      // Error summary should update reactively (name error gone)
      const alerts = screen.queryAllByRole('alert');
      const errorAlert = alerts.find((a) =>
        a.textContent?.includes('Class Name')
      );
      expect(errorAlert).toBeUndefined();
    });
  });

  describe('form rendering', () => {
    it('renders all form fields', () => {
      render(<ClassForm {...defaultProps} />);

      // Required fields
      expect(
        screen.getByRole('textbox', { name: /Class Name/ })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('textbox', { name: /Full Description/ })
      ).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: /Status/ })).toBeInTheDocument();
      expect(
        screen.getByRole('combobox', { name: /Skill Level/ })
      ).toBeInTheDocument();

      // Optional fields
      expect(
        screen.getByRole('textbox', { name: /Short Description/ })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('textbox', { name: /Location/ })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('textbox', { name: /Materials Included/ })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('textbox', { name: /What to Bring/ })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('spinbutton', { name: /Minimum Age/ })
      ).toBeInTheDocument();

      // Buttons
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    });

    it('renders in edit mode with pre-filled values', () => {
      const classItem = {
        id: 'class-1',
        name: 'Existing Class',
        description: 'A description for an existing class.',
        shortDescription: 'Short desc',
        instructorId: undefined,
        dateTime: new Date('2099-06-15T14:00:00'),
        durationMinutes: 90,
        capacity: 15,
        priceCents: 5000,
        skillLevel: 'beginner' as const,
        status: 'draft' as const,
        location: '123 Main St',
        materialsIncluded: 'Clay, tools',
        whatToBring: 'Apron',
        minimumAge: 12,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      render(
        <ClassForm {...defaultProps} classItem={classItem} />
      );

      expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument();
      expect(
        screen.getByRole('textbox', { name: /Class Name/ })
      ).toHaveValue('Existing Class');
      expect(
        screen.getByRole('textbox', { name: /Location/ })
      ).toHaveValue('123 Main St');
      expect(
        screen.getByRole('spinbutton', { name: /Minimum Age/ })
      ).toHaveValue(12);
    });

    it('calls onClose when Cancel is clicked', async () => {
      const user = userEvent.setup();

      render(<ClassForm {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(defaultProps.onClose).toHaveBeenCalledOnce();
    });

    it('renders category dropdown when categories are provided', () => {
      render(
        <ClassForm
          {...defaultProps}
          categories={[
            {
              id: 'cat-1',
              name: 'Pottery',
              order: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]}
        />
      );

      expect(
        screen.getByRole('combobox', { name: /Category/ })
      ).toBeInTheDocument();
    });
  });
});
