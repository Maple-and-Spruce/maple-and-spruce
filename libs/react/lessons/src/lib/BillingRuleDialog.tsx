'use client';

/**
 * BillingRuleDialog (#107) — writing the standing instruction down.
 *
 * Validated through `lessonBillingRuleValidation`, the same Vest suite
 * `saveLessonBillingRule` runs. That is the point of the suite existing: a form
 * with its own copy of the limits accepts a rule the server then refuses, and
 * the person finds out after pressing Save.
 *
 * Two things this dialog is careful about, because both take money from real
 * families:
 *
 *   - **The studio default.** Exactly one rule can be it, and it silently bills
 *     every student who has no rule of their own. Turning it on here takes it off
 *     whichever rule has it now, so the dialog says which one by name first.
 *   - **A flat amount.** Left blank a charge is priced from the lessons it
 *     covers, which is the normal case. Filled in, every family on the rule pays
 *     that number regardless of lesson length — so it is opt-in and spelled out.
 */
import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import type {
  LessonBillingAnchor,
  LessonBillingCadence,
  LessonBillingRule,
} from '@maple/ts/domain';
import { describeBillingRule } from '@maple/ts/domain';
import { lessonBillingRuleValidation } from '@maple/ts/validation';

/** What the dialog hands back; `id` present means an edit. */
export interface BillingRuleDraft {
  id?: string;
  name: string;
  cadence: LessonBillingCadence;
  lessonsPerCharge: number;
  anchor: LessonBillingAnchor;
  anchorOffsetDays: number;
  flatAmountCents?: number;
  isDefault: boolean;
  archived?: boolean;
}

export interface BillingRuleDialogProps {
  open: boolean;
  /** Omit to create. */
  rule?: LessonBillingRule;
  /** The rule that currently holds the studio default, if any. */
  currentDefaultName?: string;
  isSaving?: boolean;
  onClose: () => void;
  onSave: (draft: BillingRuleDraft) => void;
}

const ANCHOR_LABELS: Record<LessonBillingAnchor, string> = {
  'before-first': 'Before the first lesson in the block',
  'on-first': 'On the first lesson in the block',
  'after-last': 'After the last lesson in the block',
};

function blank(): BillingRuleDraft {
  return {
    name: '',
    cadence: 'every-n-lessons',
    lessonsPerCharge: 4,
    anchor: 'before-first',
    anchorOffsetDays: -1,
    isDefault: false,
  };
}

export function BillingRuleDialog({
  open,
  rule,
  currentDefaultName,
  isSaving = false,
  onClose,
  onSave,
}: BillingRuleDialogProps) {
  const [draft, setDraft] = useState<BillingRuleDraft>(blank());
  const [flatAmount, setFlatAmount] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  // Reload whenever the dialog opens, so editing one rule then another does not
  // show the first one's values.
  useEffect(() => {
    if (!open) return;
    setShowErrors(false);
    if (rule) {
      setDraft({
        id: rule.id,
        name: rule.name,
        cadence: rule.cadence,
        lessonsPerCharge: rule.lessonsPerCharge,
        anchor: rule.anchor,
        anchorOffsetDays: rule.anchorOffsetDays,
        flatAmountCents: rule.flatAmountCents,
        isDefault: rule.isDefault,
        archived: rule.archived,
      });
      setFlatAmount(
        rule.flatAmountCents ? (rule.flatAmountCents / 100).toString() : ''
      );
    } else {
      setDraft(blank());
      setFlatAmount('');
    }
  }, [open, rule]);

  const set = <K extends keyof BillingRuleDraft>(
    key: K,
    value: BillingRuleDraft[K]
  ) => setDraft((d) => ({ ...d, [key]: value }));

  const flatCents = flatAmount.trim()
    ? Math.round(parseFloat(flatAmount) * 100)
    : undefined;
  const candidate: BillingRuleDraft = {
    ...draft,
    flatAmountCents: Number.isNaN(flatCents as number) ? -1 : flatCents,
  };

  const result = lessonBillingRuleValidation(candidate);
  const errorFor = (field: keyof BillingRuleDraft): string | undefined =>
    showErrors ? result.getErrors(field as string)[0] : undefined;

  /** Turning the default on where another rule holds it moves it. */
  const stealingDefault =
    draft.isDefault && !rule?.isDefault && Boolean(currentDefaultName);

  const submit = () => {
    setShowErrors(true);
    if (result.hasErrors()) return;
    onSave(candidate);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{rule ? 'Change this rule' : 'New billing rule'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Name"
            placeholder="Standard 4-lesson block"
            value={draft.name}
            error={Boolean(errorFor('name'))}
            helperText={errorFor('name') ?? 'What Katie calls it'}
            onChange={(e) => set('name', e.target.value)}
          />

          <TextField
            select
            fullWidth
            size="small"
            label="How often"
            value={draft.cadence}
            onChange={(e) =>
              set('cadence', e.target.value as LessonBillingCadence)
            }
          >
            <MenuItem value="every-n-lessons">Every few lessons</MenuItem>
            <MenuItem value="per-lesson">Every lesson</MenuItem>
          </TextField>

          {draft.cadence === 'every-n-lessons' && (
            <TextField
              fullWidth
              size="small"
              type="number"
              label="Lessons per charge"
              value={draft.lessonsPerCharge}
              error={Boolean(errorFor('lessonsPerCharge'))}
              helperText={errorFor('lessonsPerCharge')}
              onChange={(e) => set('lessonsPerCharge', Number(e.target.value))}
            />
          )}

          <TextField
            select
            fullWidth
            size="small"
            label="When the money moves"
            value={draft.anchor}
            onChange={(e) =>
              set('anchor', e.target.value as LessonBillingAnchor)
            }
          >
            {(
              Object.keys(ANCHOR_LABELS) as LessonBillingAnchor[]
            ).map((a) => (
              <MenuItem key={a} value={a}>
                {ANCHOR_LABELS[a]}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            fullWidth
            size="small"
            type="number"
            label="Days from that lesson"
            value={draft.anchorOffsetDays}
            error={Boolean(errorFor('anchorOffsetDays'))}
            helperText={
              errorFor('anchorOffsetDays') ??
              'Negative is before it. −1 is "the day before".'
            }
            onChange={(e) => set('anchorOffsetDays', Number(e.target.value))}
          />

          <TextField
            fullWidth
            size="small"
            label="Flat amount per charge ($)"
            placeholder="Leave blank to price from the lessons"
            value={flatAmount}
            error={Boolean(errorFor('flatAmountCents'))}
            helperText={
              errorFor('flatAmountCents') ??
              'Blank is normal: each charge is priced from the lessons it covers at the student’s rate.'
            }
            onChange={(e) => setFlatAmount(e.target.value)}
          />

          <FormControlLabel
            control={
              <Switch
                checked={draft.isDefault}
                onChange={(e) => set('isDefault', e.target.checked)}
              />
            }
            label="Make this the studio default"
          />

          {stealingDefault && (
            <Alert severity="warning">
              <strong>{currentDefaultName}</strong> is the studio default now.
              Saving this moves it, so every student with no rule of their own
              starts being billed by this one instead.
            </Alert>
          )}

          {rule && (
            <FormControlLabel
              control={
                <Switch
                  checked={Boolean(draft.archived)}
                  onChange={(e) => set('archived', e.target.checked)}
                />
              }
              label="Retire this rule"
            />
          )}

          {draft.archived && (
            <Alert severity="info">
              Students already on it keep being billed by it — retiring only
              stops it being picked for anybody new. Move them off it first if
              that is not what you mean.
            </Alert>
          )}

          {/* The rule read back in Katie's words, so a wrong offset is obvious
              before it charges anybody. */}
          <Alert severity="info" icon={false}>
            <Typography variant="body2">
              {describeBillingRule(candidate)}
            </Typography>
          </Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={isSaving} onClick={submit}>
          {rule ? 'Save changes' : 'Create rule'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
