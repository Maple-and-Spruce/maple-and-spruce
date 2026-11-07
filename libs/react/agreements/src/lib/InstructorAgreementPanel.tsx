'use client';

/**
 * Sending an instructor their contractor agreement, and where it stands.
 * Lives in the instructor form's "Cleared to teach" section. When the
 * instructor signs, the server records the agreement date on their readiness,
 * so nobody has to come back and enter it.
 */
import { useEffect, useMemo, useState, type FocusEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Skeleton,
  TextField,
  Typography,
} from '@mui/material';
import {
  instructorAgreementState,
  type AgreementRequest,
  type AgreementTemplate,
  type RequestState,
} from '@maple/ts/domain';

export interface InstructorAgreementPanelProps {
  /** Who the agreement goes to. Without an email it cannot be sent. */
  signerName: string;
  signerEmail?: string;
  /** Agreement requests already sent to this instructor. */
  requestsState: RequestState<AgreementRequest[]>;
  /** Active templates to choose from. */
  templatesState: RequestState<AgreementTemplate[]>;
  onSend: (templateId: string) => Promise<void>;
  onResend: (requestId: string) => Promise<void>;
  /**
   * Creates a signing request with no email, for staff to share the link
   * themselves (text, Messenger). Without it, only email sending is offered.
   */
  onCreateLink?: (templateId: string) => Promise<void>;
  /** Opens a printable copy to sign on paper. Without it, no print button. */
  onPrint?: (templateId: string) => void;
  /** The public signing URL for a token. Defaults to this site's /sign page. */
  signingUrlFor?: (token: string) => string;
  /** Opens the signed copy. Without it, no link is shown. */
  onViewSigned?: (signedAgreementId: string) => void;
  /** For stories and tests; defaults to the current time. */
  now?: Date;
}

function formatDay(value: Date | string): string {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  });
}

function defaultSigningUrl(token: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/sign/${token}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong';
}

export function InstructorAgreementPanel({
  signerName,
  signerEmail,
  requestsState,
  templatesState,
  onSend,
  onResend,
  onViewSigned,
  onCreateLink,
  onPrint,
  signingUrlFor = defaultSigningUrl,
  now,
}: InstructorAgreementPanelProps) {
  const [templateId, setTemplateId] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const templates = useMemo(
    () =>
      templatesState.status === 'success'
        ? templatesState.data.filter((t) => t.status === 'active')
        : [],
    [templatesState]
  );
  const state =
    requestsState.status === 'success'
      ? instructorAgreementState(requestsState.data, now)
      : undefined;

  // Pre-select the template sent last time, or the only one there is.
  const lastTemplateId =
    state && state.kind !== 'not-sent' ? state.request.templateId : undefined;
  useEffect(() => {
    if (templateId) return;
    if (lastTemplateId && templates.some((t) => t.id === lastTemplateId)) {
      setTemplateId(lastTemplateId);
    } else if (templates.length === 1) {
      setTemplateId(templates[0].id);
    }
  }, [templateId, lastTemplateId, templates]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  if (requestsState.status === 'idle' || requestsState.status === 'loading') {
    return (
      <Box aria-busy="true" aria-label="Loading agreement status">
        <Skeleton variant="rounded" height={48} />
      </Box>
    );
  }

  if (requestsState.status === 'error' || !state) {
    return (
      <Alert severity="error">
        Couldn't load the agreements sent to {signerName}.
      </Alert>
    );
  }

  const copyLink = async (url: string) => {
    setActionError(null);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setActionError('Couldn\'t copy. Select the link and copy it by hand.');
    }
  };

  const printButton = (forTemplateId: string | undefined) =>
    onPrint && forTemplateId ? (
      <Button size="small" onClick={() => onPrint(forTemplateId)}>
        Print paper copy
      </Button>
    ) : null;

  const sendForm = (label: string) => {
    if (templatesState.status === 'error') {
      return (
        <Alert severity="error">Couldn't load the agreement templates.</Alert>
      );
    }
    if (!signerEmail && !onCreateLink) {
      return (
        <Typography variant="body2" color="textSecondary">
          Add an email for {signerName} to send the agreement for signature.
        </Typography>
      );
    }
    const templatesLoading = templatesState.status !== 'success';
    return (
      <>
        {!signerEmail && (
          <Typography variant="body2" color="textSecondary">
            No email on file for {signerName}. Create a signing link to send
            by text or Messenger, or print a paper copy.
          </Typography>
        )}
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ flex: '1 1 240px' }} disabled={templatesLoading}>
            <InputLabel id="instructor-agreement-template-label">Agreement</InputLabel>
            <Select
              labelId="instructor-agreement-template-label"
              id="instructor-agreement-template"
              value={templateId}
              label="Agreement"
              onChange={(e) => setTemplateId(e.target.value)}
            >
              {templates.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {signerEmail && (
            <Button
              variant="outlined"
              disabled={!templateId || busy}
              onClick={() => run(() => onSend(templateId))}
            >
              {busy ? <CircularProgress size={20} /> : label}
            </Button>
          )}
          {onCreateLink && (
            <Button
              variant={signerEmail ? 'text' : 'outlined'}
              disabled={!templateId || busy}
              onClick={() => run(() => onCreateLink(templateId))}
            >
              Create signing link
            </Button>
          )}
          {printButton(templateId || undefined)}
        </Box>
      </>
    );
  };

  let body;
  switch (state.kind) {
    case 'signed':
      body = (
        <Alert
          severity="success"
          action={
            onViewSigned && state.request.signedAgreementId ? (
              <Button
                color="inherit"
                size="small"
                sx={{ whiteSpace: 'nowrap' }}
                onClick={() =>
                  onViewSigned(state.request.signedAgreementId as string)
                }
              >
                View signed copy
              </Button>
            ) : undefined
          }
        >
          Signed online{' '}
          {formatDay(state.request.updatedAt)}.
        </Alert>
      );
      break;
    case 'pending': {
      const { request } = state;
      const url = signingUrlFor(request.signingToken);
      body = (
        <>
          <Alert
            severity="info"
            action={
              request.signerEmail ? (
                <Button
                  color="inherit"
                  size="small"
                  sx={{ whiteSpace: 'nowrap' }}
                  disabled={busy}
                  onClick={() => run(() => onResend(request.id))}
                >
                  {busy ? <CircularProgress size={16} /> : 'Resend email'}
                </Button>
              ) : undefined
            }
          >
            {request.emailSentAt && request.signerEmail
              ? `Sent ${formatDay(request.emailSentAt ?? request.createdAt)} to ${request.signerEmail}.`
              : `Signing link created ${formatDay(request.createdAt)}. Send it to them by text or Messenger.`}{' '}
            Waiting for their signature; the link expires{' '}
            {formatDay(request.expiresAt)}.
          </Alert>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label="Signing link"
              value={url}
              sx={{ flex: '1 1 260px' }}
              slotProps={{
                htmlInput: { readOnly: true, onFocus: (e: FocusEvent<HTMLInputElement>) => e.target.select() },
              }}
            />
            <Button variant="outlined" size="small" onClick={() => copyLink(url)}>
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            {printButton(request.templateId)}
          </Box>
        </>
      );
      break;
    }
    case 'expired':
      body = (
        <>
          <Alert severity="warning">
            The link sent {formatDay(state.request.createdAt)} expired before it
            was signed.
          </Alert>
          {sendForm('Send again')}
        </>
      );
      break;
    case 'not-sent':
      body = (
        <>
          {signerEmail && (
            <Typography variant="body2" color="textSecondary">
              Send it to sign online, or record a paper copy below.
            </Typography>
          )}
          {sendForm('Send for signature')}
        </>
      );
      break;
  }

  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
      data-testid="instructor-agreement-panel"
    >
      {body}
      {actionError && <Alert severity="error">{actionError}</Alert>}
    </Box>
  );
}
