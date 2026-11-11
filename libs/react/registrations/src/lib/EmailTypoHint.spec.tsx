// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EmailTypoHint } from './EmailTypoHint';

/** Built at runtime so no real-looking address sits in the source. */
const at = (local: string, domain: string): string => `${local}@${domain}`;

afterEach(cleanup);

describe('EmailTypoHint', () => {
  it('renders nothing for an address with a real domain', () => {
    const { container } = render(
      <EmailTypoHint email={at('robin', 'example.com')} onAccept={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while the address is still being typed', () => {
    const { container } = render(
      <EmailTypoHint email="robin@gn" onAccept={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('asks about the corrected address for a known typo', () => {
    render(
      <EmailTypoHint email={at('robin', 'gnail.com')} onAccept={vi.fn()} />
    );
    expect(screen.getByTestId('email-typo-hint')).toHaveTextContent(
      `Did you mean ${at('robin', 'gmail.com')}?`
    );
  });

  it('hands back the corrected address when the suggestion is clicked', () => {
    const onAccept = vi.fn();
    render(
      <EmailTypoHint email={at('robin', 'hotmial.com')} onAccept={onAccept} />
    );
    fireEvent.click(
      screen.getByRole('button', { name: at('robin', 'hotmail.com') })
    );
    expect(onAccept).toHaveBeenCalledWith(at('robin', 'hotmail.com'));
  });

  it('is not a submit button, so it cannot submit the form around it', () => {
    render(
      <EmailTypoHint email={at('robin', 'gnail.com')} onAccept={vi.fn()} />
    );
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});
