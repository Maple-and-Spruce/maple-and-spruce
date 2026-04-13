import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClassForm } from './ClassForm';

// Mock firebase functions - not needed for validation tests
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(),
}));

vi.mock('@maple/ts/firebase/firebase-config', () => ({
  getMapleFunctions: vi.fn(),
}));

// A future date that won't expire during tests
const futureDate = new Date('2099-06-15T14:00:00');

describe('ClassForm', () => {
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
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent('Please fix the following errors');

      // Name is empty - should show error
      expect(alert).toHaveTextContent('Class Name');

      // onSubmit should NOT have been called
      expect(defaultProps.onSubmit).not.toHaveBeenCalled();
    });

    it('shows inline field errors on individual fields after submit attempt', async () => {
      const user = userEvent.setup();

      render(<ClassForm {...defaultProps} />);

      const addButton = screen.getByRole('button', { name: 'Add' });
      await user.click(addButton);

      // The Class Name field should show an error
      const nameField = screen.getByLabelText(/Class Name/);
      expect(nameField).toHaveAttribute('aria-invalid', 'true');
    });

    it('shows instructor error when status is published and no instructor is selected', async () => {
      const user = userEvent.setup();

      render(<ClassForm {...defaultProps} />);

      // Change status to Published
      const statusSelect = screen.getByLabelText('Status');
      await user.click(statusSelect);
      const publishedOption = screen.getByRole('option', {
        name: 'Published',
      });
      await user.click(publishedOption);

      // Fill in required fields to isolate the instructor error
      const nameField = screen.getByLabelText(/Class Name/);
      await user.clear(nameField);
      await user.type(nameField, 'A Valid Class Name');

      const descField = screen.getByLabelText(/Full Description/);
      await user.clear(descField);
      await user.type(
        descField,
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
      expect(errorAlert).toHaveTextContent('Instructor');
      expect(errorAlert).toHaveTextContent(
        'Instructor is required for published classes'
      );

      // The instructor field should now be visible even with no instructors passed
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
      const statusSelect = screen.getByLabelText('Status');
      await user.click(statusSelect);
      await user.click(screen.getByRole('option', { name: 'Published' }));

      // Before clicking Add, instructor field should not be visible
      expect(screen.queryByLabelText('Instructor')).not.toBeInTheDocument();

      // Click Add to trigger validation
      await user.click(screen.getByRole('button', { name: 'Add' }));

      // Now instructor field should appear with error
      const instructorField = screen.getByLabelText('Instructor');
      expect(instructorField).toBeInTheDocument();
    });

    it('does not show error summary when form is valid', async () => {
      const user = userEvent.setup();

      render(
        <ClassForm
          {...defaultProps}
          instructors={[{ id: 'inst-1', name: 'Jane Doe' }]}
        />
      );

      // Fill in all required fields
      const nameField = screen.getByLabelText(/Class Name/);
      await user.clear(nameField);
      await user.type(nameField, 'Pottery Workshop');

      const descField = screen.getByLabelText(/Full Description/);
      await user.clear(descField);
      await user.type(
        descField,
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
      expect(
        screen.getByText('Please fix the following errors:')
      ).toBeInTheDocument();

      // Fix name
      const nameField = screen.getByLabelText(/Class Name/);
      await user.type(nameField, 'A Valid Class Name');

      // Fix description
      const descField = screen.getByLabelText(/Full Description/);
      await user.clear(descField);
      await user.type(
        descField,
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
});
