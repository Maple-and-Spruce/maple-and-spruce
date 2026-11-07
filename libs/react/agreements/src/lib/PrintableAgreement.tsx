'use client';

/**
 * An agreement laid out to print and sign on paper. Each checkbox statement
 * becomes its own initial line, so a paper copy asks for the same individual
 * acknowledgments the online signing page does.
 *
 * Pass sections with placeholders already filled (`applyAgreementVariables`).
 */
import { Box, Typography } from '@mui/material';
import {
  requiredAcknowledgments,
  type AgreementSection,
} from '@maple/ts/domain';

export interface PrintableAgreementProps {
  templateName: string;
  sections: AgreementSection[];
  /** Who it was prepared for, shown under the title. */
  signerName: string;
  /** The business countersigning. */
  businessName?: string;
}

function SignatureLine({ label }: { label: string }) {
  return (
    <Box sx={{ flex: 1 }}>
      <Box sx={{ borderBottom: 1, borderColor: 'text.primary', height: 28 }} />
      <Typography variant="caption">{label}</Typography>
    </Box>
  );
}

export function PrintableAgreement({
  templateName,
  sections,
  signerName,
  businessName = 'Maple & Spruce Folk Arts Collective LLC',
}: PrintableAgreementProps) {
  const acknowledgments = requiredAcknowledgments(sections);

  return (
    <Box
      component="article"
      data-testid="printable-agreement"
      sx={{
        fontFamily: 'Georgia, Times, "Times New Roman", serif',
        fontSize: '0.875rem',
        lineHeight: 1.4,
        '& p': { my: 0.75 },
        '& ul, & ol': { pl: 3, my: 0.5 },
        '@media print': { fontSize: '9pt', lineHeight: 1.3 },
      }}
    >
      <Typography variant="h5" component="h1" sx={{ mb: 0.5 }}>
        {templateName}
      </Typography>
      <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
        Prepared for {signerName}
      </Typography>

      {sections.map((section) => {
        const lines = acknowledgments.filter((a) => a.sectionId === section.id);
        return (
          <Box
            component="section"
            key={section.id}
            sx={{ mb: 1.5, breakInside: 'avoid' }}
          >
            <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600 }}>
              {section.title}
            </Typography>
            <Box dangerouslySetInnerHTML={{ __html: section.content }} />
            {lines.length > 0 && (
              <Box
                sx={{ border: 1, borderColor: 'divider', p: 1, mt: 0.5 }}
                aria-label="Initial each statement"
              >
                <Typography variant="caption" color="textSecondary">
                  Initial each statement.
                </Typography>
                {lines.map((a) => (
                  <Box
                    key={a.key}
                    sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-end', mt: 0.5 }}
                  >
                    <Box
                      sx={{
                        flex: '0 0 56px',
                        borderBottom: 1,
                        borderColor: 'text.primary',
                        height: 16,
                      }}
                    />
                    <Typography variant="body2" data-testid="initial-line">
                      {a.text}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        );
      })}

      <Box sx={{ display: 'flex', gap: 4, mt: 3, breakInside: 'avoid' }}>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <SignatureLine label="Signature" />
          <SignatureLine label={`Printed name (${signerName})`} />
          <SignatureLine label="Date" />
        </Box>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <SignatureLine label={`For ${businessName}`} />
          <SignatureLine label="Printed name and title" />
          <SignatureLine label="Date" />
        </Box>
      </Box>
    </Box>
  );
}
