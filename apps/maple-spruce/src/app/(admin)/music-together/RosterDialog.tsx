'use client';

import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  Typography,
  Box,
  Skeleton,
  Alert,
  TextField,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import {
  buildMusicTogetherLicenseeCsv,
  buildMusicTogetherInternalRosterCsv,
  mtFormatDob,
  mtRefundCents,
  mtSectionFirstSessionAt,
  type RequestState,
  type MusicTogetherSection,
} from '@maple/ts/domain';
import type {
  GetMusicTogetherRosterResponse,
  MusicTogetherRosterEntry,
  CancelMusicTogetherRegistrationResponse,
  WaiveMusicTogetherInstallmentResponse,
} from '@maple/ts/firebase/api-types';

interface Props {
  open: boolean;
  onClose: () => void;
  sectionName: string;
  rosterState: RequestState<GetMusicTogetherRosterResponse>;
  /**
   * Cancel a family's registration with an optional refund amount (cents).
   * Omit the amount to apply the program's policy refund. When not provided,
   * the roster is read-only (no cancel action rendered).
   */
  onCancelRegistration?: (
    registrationId: string,
    refundCents?: number
  ) => Promise<CancelMusicTogetherRegistrationResponse>;
  /**
   * Forgive one scheduled installment, leaving the family enrolled. Distinct
   * from cancelling: the seat stays, and only this charge is never taken.
   */
  onWaiveInstallment?: (
    chargeId: string,
    reason?: string
  ) => Promise<WaiveMusicTogetherInstallmentResponse>;
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const fmtCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Table-shaped placeholder shown while the roster loads. */
function RosterLoadingSkeleton({ showActions }: { showActions: boolean }) {
  const headers = [
    'Parent(s)',
    'Children (DOB)',
    'Accommodations / notes',
    'Plan',
    'Status',
    ...(showActions ? ['Actions'] : []),
  ];
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          {headers.map((h, i) => (
            <TableCell key={h} align={i === headers.length - 1 && showActions ? 'right' : 'left'}>
              {h}
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {Array.from({ length: 3 }).map((_, r) => (
          <TableRow key={r}>
            {headers.map((h, c) => (
              <TableCell key={h}>
                <Skeleton variant="text" width={c === 0 ? '80%' : '55%'} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Chip color for a roster row's status (past-due takes precedence). */
function statusChipColor(
  status: string,
  pastDue: boolean
): 'error' | 'success' | 'info' | 'default' {
  if (pastDue) return 'error';
  if (status === 'confirmed') return 'success';
  if (status === 'refunded') return 'info';
  if (status === 'waived') return 'info';
  if (status === 'cancelled') return 'error';
  return 'default';
}

/** Total amount captured for a registration: reg-time charge + paid installments. */
function capturedCents(entry: MusicTogetherRosterEntry): number {
  const reg = entry.registration;
  const base = reg.squarePaymentId ? reg.pricePaidCents : 0;
  const paid = (entry.charges ?? [])
    .filter((c) => c.status === 'paid' && !!c.squarePaymentId)
    .reduce((sum, c) => sum + c.amountCents, 0);
  return base + paid;
}

export function RosterDialog({
  open,
  onClose,
  sectionName,
  rosterState,
  onCancelRegistration,
  onWaiveInstallment,
}: Props) {
  const section: MusicTogetherSection | undefined =
    rosterState.status === 'success' ? rosterState.data.section : undefined;
  const entries =
    rosterState.status === 'success' ? rosterState.data.entries : [];

  const confirmed = useMemo(
    () => entries.filter((e) => e.registration.status === 'confirmed'),
    [entries]
  );

  // Waitlist / interested families (email-only "coming soon" captures + full
  // waitlist signups) so the admin can notify everyone when registration opens.
  const waitlist =
    rosterState.status === 'success' ? (rosterState.data.waitlist ?? []) : [];
  const [waitlistCopied, setWaitlistCopied] = useState(false);

  const handleCopyWaitlistEmails = () => {
    const emails = waitlist
      .map((w) => w.email)
      .filter((email, i, arr) => arr.indexOf(email) === i) // dedupe
      .join(', ');
    navigator.clipboard.writeText(emails).then(() => {
      setWaitlistCopied(true);
      setTimeout(() => setWaitlistCopied(false), 2000);
    });
  };

  const safeName = sectionName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

  // ── Cancel / refund flow ─────────────────────────────────────────────
  const [cancelTarget, setCancelTarget] =
    useState<MusicTogetherRosterEntry | null>(null);
  const [refundDollars, setRefundDollars] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const targetCaptured = cancelTarget ? capturedCents(cancelTarget) : 0;
  const targetPolicyCents = cancelTarget
    ? Math.min(
        mtRefundCents(
          cancelTarget.registration.pricePaidCents,
          section ? mtSectionFirstSessionAt(section) : undefined,
          new Date()
        ),
        targetCaptured
      )
    : 0;

  const openCancel = (entry: MusicTogetherRosterEntry) => {
    setCancelTarget(entry);
    setCancelError(null);
    // Prefill with the policy default; admin can override to any amount.
    const policy = Math.min(
      mtRefundCents(
        entry.registration.pricePaidCents,
        section ? mtSectionFirstSessionAt(section) : undefined,
        new Date()
      ),
      capturedCents(entry)
    );
    setRefundDollars((policy / 100).toFixed(2));
  };

  const closeCancel = () => {
    setCancelTarget(null);
    setRefundDollars('');
    setCancelError(null);
    setIsCancelling(false);
  };

  const refundCentsValue = Math.round(parseFloat(refundDollars) * 100);
  const refundInvalid =
    refundDollars.trim() === '' ||
    Number.isNaN(refundCentsValue) ||
    refundCentsValue < 0 ||
    refundCentsValue > targetCaptured;

  const handleConfirmCancel = async () => {
    if (!cancelTarget || !onCancelRegistration || refundInvalid) return;
    setIsCancelling(true);
    setCancelError(null);
    try {
      const result = await onCancelRegistration(
        cancelTarget.registration.id,
        refundCentsValue
      );
      setActionMessage(
        result.refundCents > 0
          ? `Registration cancelled; ${fmtCents(result.refundCents)} refunded.`
          : 'Registration cancelled (no refund).'
      );
      closeCancel();
    } catch (error) {
      setCancelError(
        error instanceof Error ? error.message : 'Failed to cancel'
      );
    } finally {
      setIsCancelling(false);
    }
  };

  // ── Waive a scheduled installment ────────────────────────────────────
  //
  // Forgiving a charge is not cancelling a family: the seat and every other
  // charge stay put. Used for comped tuition (the pilot-semester half-off).
  const [waiveTarget, setWaiveTarget] = useState<{
    entry: MusicTogetherRosterEntry;
    charge: MusicTogetherRosterEntry['charges'][number];
  } | null>(null);
  const [waiveReason, setWaiveReason] = useState('');
  const [isWaiving, setIsWaiving] = useState(false);
  const [waiveError, setWaiveError] = useState<string | null>(null);

  const openWaive = (
    entry: MusicTogetherRosterEntry,
    charge: MusicTogetherRosterEntry['charges'][number]
  ) => {
    setWaiveTarget({ entry, charge });
    setWaiveReason('');
    setWaiveError(null);
  };

  const closeWaive = () => {
    setWaiveTarget(null);
    setWaiveReason('');
    setWaiveError(null);
    setIsWaiving(false);
  };

  const handleConfirmWaive = async () => {
    if (!waiveTarget || !onWaiveInstallment) return;
    setIsWaiving(true);
    setWaiveError(null);
    try {
      const result = await onWaiveInstallment(
        waiveTarget.charge.id,
        waiveReason.trim() || undefined
      );
      setActionMessage(
        `Installment ${waiveTarget.charge.installmentNumber} waived — ${fmtCents(
          result.amountCents
        )} will not be charged.`
      );
      closeWaive();
    } catch (error) {
      setWaiveError(error instanceof Error ? error.message : 'Failed to waive');
    } finally {
      setIsWaiving(false);
    }
  };

  // Licensee report → shared with Music Together Worldwide: adult contact only.
  const handleDownloadLicensee = () => {
    const csv = buildMusicTogetherLicenseeCsv(
      confirmed.map((e) => e.registration)
    );
    downloadCsv(`music-together-licensee-${safeName}.csv`, csv);
  };

  // Internal roster → Maple & Spruce only: includes children + accommodations.
  const handleDownloadInternal = () => {
    const csv = buildMusicTogetherInternalRosterCsv(
      confirmed.map((e) => e.registration)
    );
    downloadCsv(`music-together-internal-roster-${safeName}.csv`, csv);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Roster — {sectionName}</DialogTitle>
      <DialogContent>
        {actionMessage && (
          <Alert
            severity="success"
            sx={{ mb: 2 }}
            onClose={() => setActionMessage(null)}
          >
            {actionMessage}
          </Alert>
        )}
        {(rosterState.status === 'idle' ||
          rosterState.status === 'loading') && (
          <RosterLoadingSkeleton showActions={!!onCancelRegistration || !!onWaiveInstallment} />
        )}
        {rosterState.status === 'error' && (
          <Alert severity="error">{rosterState.error}</Alert>
        )}
        {rosterState.status === 'success' && entries.length === 0 && (
          <Typography sx={{ p: 2 }} color="text.secondary">
            No families enrolled yet.
          </Typography>
        )}
        {rosterState.status === 'success' && entries.length > 0 && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Parent(s)</TableCell>
                <TableCell>Children (DOB)</TableCell>
                <TableCell>Accommodations / notes</TableCell>
                <TableCell>Plan</TableCell>
                <TableCell>Status</TableCell>
                {(onCancelRegistration || onWaiveInstallment) && (
                  <TableCell align="right">Actions</TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((entry) => {
                const status = entry.registration.status;
                const canCancel =
                  status === 'confirmed' || status === 'pending';
                return (
                  <TableRow key={entry.registration.id}>
                    <TableCell>
                      {entry.registration.parentNames.join(', ')}
                    </TableCell>
                    <TableCell>
                      {entry.registration.children
                        .map(
                          (c) => `${c.name} (${mtFormatDob(new Date(c.dob))})`
                        )
                        .join(', ')}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 240, whiteSpace: 'pre-wrap' }}>
                      {[
                        entry.registration.accommodations
                          ? `Accommodations: ${entry.registration.accommodations}`
                          : null,
                        entry.registration.notes
                          ? `Notes: ${entry.registration.notes}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join('\n') || (
                        <Typography variant="body2" color="text.disabled">
                          —
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {entry.registration.paymentPlan}
                      {entry.registration.discountCode && (
                        <Typography variant="caption" display="block">
                          {entry.registration.discountCode} (−
                          {fmtCents(
                            entry.registration.discountAmountCents ?? 0
                          )}
                          )
                        </Typography>
                      )}
                      {(entry.charges ?? []).map((c) => (
                        <Typography
                          key={c.id}
                          variant="caption"
                          display="block"
                          color={
                            c.status === 'waived'
                              ? 'text.disabled'
                              : 'text.secondary'
                          }
                          sx={
                            c.status === 'waived'
                              ? { textDecoration: 'line-through' }
                              : undefined
                          }
                        >
                          #{c.installmentNumber} {fmtCents(c.amountCents)}{' '}
                          {c.status === 'scheduled'
                            ? `due ${new Date(c.dueAt).toLocaleDateString()}`
                            : c.status}
                        </Typography>
                      ))}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={entry.pastDue ? 'Past due' : status}
                        color={statusChipColor(status, entry.pastDue)}
                      />
                    </TableCell>
                    {(onCancelRegistration || onWaiveInstallment) && (
                      <TableCell align="right">
                        {onWaiveInstallment &&
                          canCancel &&
                          (entry.charges ?? [])
                            .filter((c) => c.status === 'scheduled')
                            .map((c) => (
                              <Button
                                key={c.id}
                                size="small"
                                onClick={() => openWaive(entry, c)}
                                aria-label={`Waive installment ${c.installmentNumber} for ${entry.registration.parentNames.join(', ')}`}
                              >
                                Waive {fmtCents(c.amountCents)}
                              </Button>
                            ))}
                        {onCancelRegistration && canCancel && (
                          <Button
                            size="small"
                            color="error"
                            onClick={() => openCancel(entry)}
                            aria-label={`Cancel registration for ${entry.registration.parentNames.join(', ')}`}
                          >
                            Cancel / refund
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {/* Waitlist / interested families (incl. "coming soon" email captures) */}
        {rosterState.status === 'success' && (
          <Box sx={{ mt: 4 }}>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                mb: 1,
                gap: 2,
                flexWrap: 'wrap',
              }}
            >
              <Typography variant="h6">
                Waitlist / Interested families ({waitlist.length})
              </Typography>
              <Button
                size="small"
                variant="outlined"
                startIcon={<ContentCopyIcon />}
                onClick={handleCopyWaitlistEmails}
                disabled={waitlist.length === 0}
              >
                {waitlistCopied ? 'Copied!' : 'Copy emails'}
              </Button>
            </Box>
            {waitlist.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
                No signups yet.
              </Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name / email</TableCell>
                    <TableCell>Availability</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {waitlist.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell>
                        {w.name ? (
                          <>
                            <Typography variant="body2">{w.name}</Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {w.email}
                            </Typography>
                          </>
                        ) : (
                          <Typography variant="body2">{w.email}</Typography>
                        )}
                      </TableCell>
                      <TableCell
                        sx={{ maxWidth: 260, whiteSpace: 'pre-wrap' }}
                      >
                        {w.availability || (
                          <Typography variant="body2" color="text.disabled">
                            —
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          startIcon={<DownloadIcon />}
          onClick={handleDownloadInternal}
          disabled={confirmed.length === 0}
        >
          Internal roster ({confirmed.length})
        </Button>
        <Button
          startIcon={<DownloadIcon />}
          onClick={handleDownloadLicensee}
          disabled={confirmed.length === 0}
        >
          Licensee CSV — MTW ({confirmed.length})
        </Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>

      {/* Cancel / refund confirmation */}
      <Dialog open={!!cancelTarget} onClose={closeCancel} maxWidth="xs" fullWidth>
        <DialogTitle>Cancel registration</DialogTitle>
        <DialogContent>
          {cancelTarget && (
            <Box
              sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}
            >
              {cancelError && (
                <Alert severity="error" onClose={() => setCancelError(null)}>
                  {cancelError}
                </Alert>
              )}
              <Typography variant="body2">
                Cancel{' '}
                <strong>
                  {cancelTarget.registration.parentNames.join(', ')}
                </strong>
                ? Any scheduled installment charges will be cancelled so they
                never run.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Captured: {fmtCents(targetCaptured)} · Policy refund:{' '}
                {fmtCents(targetPolicyCents)}
              </Typography>
              <TextField
                label="Refund amount ($)"
                value={refundDollars}
                onChange={(e) => setRefundDollars(e.target.value)}
                type="number"
                size="small"
                inputProps={{ min: 0, max: targetCaptured / 100, step: 0.01 }}
                error={refundInvalid}
                helperText={
                  refundInvalid
                    ? `Enter an amount between $0.00 and ${fmtCents(targetCaptured)}`
                    : `Max ${fmtCents(targetCaptured)}. Enter $0.00 to cancel with no refund.`
                }
                fullWidth
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeCancel} disabled={isCancelling}>
            Back
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleConfirmCancel}
            disabled={isCancelling || refundInvalid}
          >
            {isCancelling ? 'Cancelling…' : 'Confirm cancel'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Waive installment confirmation */}
      <Dialog open={!!waiveTarget} onClose={closeWaive} maxWidth="xs" fullWidth>
        <DialogTitle>Waive installment</DialogTitle>
        <DialogContent>
          {waiveTarget && (
            <Box
              sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}
            >
              {waiveError && (
                <Alert severity="error" onClose={() => setWaiveError(null)}>
                  {waiveError}
                </Alert>
              )}
              <Typography variant="body2">
                Forgive installment {waiveTarget.charge.installmentNumber} (
                {fmtCents(waiveTarget.charge.amountCents)}, due{' '}
                {new Date(waiveTarget.charge.dueAt).toLocaleDateString()}) for{' '}
                <strong>
                  {waiveTarget.entry.registration.parentNames.join(', ')}
                </strong>
                ? They stay enrolled and this charge is never taken. Nothing is
                refunded — use Cancel / refund for money already captured.
              </Typography>
              <TextField
                label="Reason"
                value={waiveReason}
                onChange={(e) => setWaiveReason(e.target.value)}
                size="small"
                placeholder="e.g. Pilot semester half-off"
                helperText="Recorded on the charge so the roster shows why it never ran."
                fullWidth
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeWaive} disabled={isWaiving}>
            Back
          </Button>
          <Button
            variant="contained"
            onClick={handleConfirmWaive}
            disabled={isWaiving}
          >
            {isWaiving ? 'Waiving…' : 'Confirm waive'}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
