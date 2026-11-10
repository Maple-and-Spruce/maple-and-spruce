'use client';

import type { CSSProperties, ReactNode } from 'react';
import { brandColors, borders, colors, fonts, text } from '@maple/react/theme';
import { formatCentsAsDollars, giftCardEndingText } from '@maple/ts/domain';
import type { PreviewGiftCardForClassResponse } from '@maple/ts/firebase/api-types';

/**
 * Where the gift card stands at checkout (#301).
 *
 * `closed` is the dark default: just a "Have a gift card?" link. Once open,
 * the four states of anything fetched: idle (`open`), `applying`, `error`
 * and `applied`.
 */
export type GiftCardStatus =
  | { kind: 'closed' }
  | { kind: 'open' }
  | { kind: 'applying' }
  | { kind: 'error'; message: string }
  | { kind: 'applied'; preview: PreviewGiftCardForClassResponse };

interface GiftCardSectionProps {
  status: GiftCardStatus;
  /** Reveal the gift card field. */
  onOpen: () => void;
  /** Read the card and work out what it pays. */
  onApply: () => void;
  /** Stop using a gift card. */
  onRemove: () => void;
  /** Receives the element Square draws its gift card field into. */
  fieldRef: (el: HTMLDivElement | null) => void;
  /** True while the registration is being submitted. */
  disabled?: boolean;
}

/**
 * The gift card part of the checkout: a link, Square's gift card number
 * field, an Apply button and what the card pays.
 *
 * Plain elements with inline styles on purpose: on Webflow this renders
 * inside the card form's `afterCardContent`, which is portaled out of the
 * widget's Shadow DOM, where MUI's injected styles do not reach (the pay
 * button below it is styled the same way).
 */
export function GiftCardSection({
  status,
  onOpen,
  onApply,
  onRemove,
  fieldRef,
  disabled = false,
}: GiftCardSectionProps) {
  if (status.kind === 'closed') {
    return (
      <div style={{ marginBottom: 16 }}>
        <button
          type="button"
          onClick={onOpen}
          disabled={disabled}
          style={linkStyle}
        >
          Have a gift card?
        </button>
      </div>
    );
  }

  const applying = status.kind === 'applying';
  const applied = status.kind === 'applied' ? status.preview : null;

  return (
    <section
      aria-label="Gift card"
      aria-busy={applying}
      style={{
        marginBottom: 16,
        padding: 16,
        border: `1px solid ${borders.default}`,
        borderRadius: 8,
        fontFamily: fonts.body,
        color: text.primary,
      }}
    >
      <div style={{ fontFamily: fonts.heading, fontSize: 18, marginBottom: 8 }}>
        Gift card
      </div>

      {/* Square draws its gift card number field in here. */}
      <div ref={fieldRef} data-testid="gift-card-field" style={{ minHeight: 56 }} />

      {status.kind === 'error' && (
        <div role="alert" style={errorStyle}>
          {status.message}
        </div>
      )}

      {applied ? (
        <GiftCardBreakdown preview={applied} />
      ) : (
        <button
          type="button"
          onClick={onApply}
          disabled={applying || disabled}
          style={{
            ...applyButtonStyle,
            cursor: applying || disabled ? 'not-allowed' : 'pointer',
            opacity: applying || disabled ? 0.7 : 1,
          }}
        >
          {applying ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Spinner /> Checking card…
            </span>
          ) : (
            'Apply gift card'
          )}
        </button>
      )}

      <div style={{ marginTop: 8 }}>
        <button
          type="button"
          onClick={onRemove}
          disabled={applying || disabled}
          style={linkStyle}
        >
          {applied ? 'Remove gift card' : "Don't use a gift card"}
        </button>
      </div>
    </section>
  );
}

/** What the card pays, line by line. */
export function GiftCardBreakdown({
  preview,
}: {
  preview: PreviewGiftCardForClassResponse;
}) {
  const leftOnCard = preview.balanceCents - preview.giftCardAmountCents;
  return (
    <div data-testid="gift-card-breakdown" style={{ marginTop: 8 }}>
      {preview.classCertificateCoverCents > 0 && (
        <>
          {/* The cover comes off before tax, so the total above changes too:
              show the new total so the lines add up. */}
          <Line
            label="Class certificate covers"
            value={`−${formatCentsAsDollars(preview.classCertificateCoverCents)}`}
          />
          <Line
            label="New total with tax"
            value={formatCentsAsDollars(preview.totalCents)}
          />
        </>
      )}
      <Line
        label={`Gift card${giftCardEndingText(preview.last4)}`}
        value={`−${formatCentsAsDollars(preview.giftCardAmountCents)}`}
      />
      <div
        style={{
          borderTop: `1px solid ${borders.default}`,
          marginTop: 8,
          paddingTop: 8,
          fontWeight: 600,
        }}
      >
        {preview.leftToPayCents > 0 ? (
          <Line label="Left to pay" value={formatCentsAsDollars(preview.leftToPayCents)} />
        ) : (
          <span>Nothing left to pay</span>
        )}
      </div>
      {leftOnCard > 0 && (
        <div style={{ marginTop: 4, fontSize: 14, color: text.secondary }}>
          {formatCentsAsDollars(leftOnCard)} stays on your card for next time.
        </div>
      )}
    </div>
  );
}

function Line({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
      <span>{label}:</span>
      <span>{value}</span>
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        width: 14,
        height: 14,
        border: `2px solid ${colors.creamDark}`,
        borderTopColor: brandColors.darkBrown,
        borderRadius: '50%',
        display: 'inline-block',
        animation: 'ms-gift-card-spin 0.8s linear infinite',
      }}
    >
      <style>{'@keyframes ms-gift-card-spin { to { transform: rotate(360deg); } }'}</style>
    </span>
  );
}

const linkStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: brandColors.sageGreen,
  textDecoration: 'underline',
  cursor: 'pointer',
  fontFamily: fonts.body,
  fontSize: 15,
};

const applyButtonStyle: CSSProperties = {
  marginTop: 8,
  padding: '10px 20px',
  fontFamily: fonts.button,
  fontSize: 15,
  fontWeight: 600,
  color: brandColors.darkBrown,
  backgroundColor: colors.white,
  border: `1px solid ${brandColors.darkBrown}`,
  borderRadius: 8,
};

const errorStyle: CSSProperties = {
  marginTop: 8,
  padding: '10px 12px',
  borderRadius: 6,
  backgroundColor: '#FDEDED',
  color: '#5F2120',
  fontSize: 15,
};
