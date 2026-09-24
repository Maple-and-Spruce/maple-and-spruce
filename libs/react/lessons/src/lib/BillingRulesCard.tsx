'use client';

/**
 * BillingRulesCard (#107) — the rules the nightly job bills from.
 *
 * `saveLessonBillingRule` shipped with #81 and nothing called it, so setting a
 * student up for automatic billing needed the Firestore console. During the dev
 * manual run Katie's Google account had to be re-verified just to attach test
 * students to a rule, which is not a thing the studio should ever need to do.
 *
 * WHY THIS CARD IS DELIBERATELY BLUNT
 * -----------------------------------
 * A rule is a standing instruction to take money from every family on it, and
 * editing one reaches all of them. So the card states the rule in Katie's own
 * words (`describeBillingRule`), says out loud how many students each one bills,
 * and never hides the studio default — the one rule that silently applies to
 * everybody who has no rule of their own.
 *
 * It sits **below** the upcoming charges on purpose: see what is about to happen
 * first, change the policy second.
 */
import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import RuleIcon from '@mui/icons-material/Rule';
import type { LessonBillingRule, Student } from '@maple/ts/domain';
import { describeBillingRule } from '@maple/ts/domain';
import { BillingRuleDialog, type BillingRuleDraft } from './BillingRuleDialog';

export interface BillingRulesCardProps {
  rules: LessonBillingRule[];
  /** Every student, so each rule can say how many families it bills. */
  students?: Array<Pick<Student, 'id' | 'status' | 'billingRuleId' | 'isHopeScholarship'>>;
  isLoading?: boolean;
  /** The id being saved, or `new-rule`. */
  pendingId?: string | null;
  error?: string | null;
  onSave: (draft: BillingRuleDraft) => void;
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * How many active, non-Hope students a rule actually bills.
 *
 * The studio default bills everyone with no rule of their own, which is the
 * number that surprises people — so it is counted, not implied.
 */
export function studentsOnRule(
  rule: Pick<LessonBillingRule, 'id' | 'isDefault'>,
  students: Array<Pick<Student, 'status' | 'billingRuleId' | 'isHopeScholarship'>>
): number {
  return students.filter((s) => {
    if (s.status !== 'active' || s.isHopeScholarship) return false;
    if (s.billingRuleId) return s.billingRuleId === rule.id;
    return rule.isDefault;
  }).length;
}

export function BillingRulesCard({
  rules,
  students = [],
  isLoading = false,
  pendingId = null,
  error = null,
  onSave,
}: BillingRulesCardProps) {
  const [editing, setEditing] = useState<LessonBillingRule | 'new' | null>(null);

  const live = useMemo(() => rules.filter((r) => !r.archived), [rules]);
  const archived = useMemo(() => rules.filter((r) => r.archived), [rules]);
  const hasDefault = live.some((r) => r.isDefault);

  if (isLoading) {
    return (
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Skeleton variant="text" width={180} />
        <Skeleton variant="rectangular" height={72} sx={{ mt: 1 }} />
      </Paper>
    );
  }

  const row = (rule: LessonBillingRule) => (
    <Paper
      key={rule.id}
      variant="outlined"
      sx={{
        p: 1.5,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        flexWrap: 'wrap',
        opacity: rule.archived ? 0.6 : 1,
      }}
    >
      <Box sx={{ flexGrow: 1, minWidth: 220 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography sx={{ fontWeight: 600 }}>{rule.name}</Typography>
          {rule.isDefault && (
            <Chip size="small" color="primary" label="Studio default" />
          )}
          {rule.archived && <Chip size="small" label="Retired" />}
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {describeBillingRule(rule)}
          {rule.flatAmountCents
            ? ` · a flat ${money(rule.flatAmountCents)}`
            : ' · priced from the lessons'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {(() => {
            const n = studentsOnRule(rule, students);
            if (n === 0) return 'No students on this rule';
            return `${n} student${n === 1 ? '' : 's'}${
              rule.isDefault && !rule.archived ? ', including everyone with no rule of their own' : ''
            }`;
          })()}
        </Typography>
      </Box>
      <Button
        size="small"
        disabled={pendingId === rule.id}
        onClick={() => setEditing(rule)}
      >
        Change
      </Button>
    </Paper>
  );

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <RuleIcon fontSize="small" color="action" />
        <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
          Billing rules
        </Typography>
        <Button
          size="small"
          variant="outlined"
          disabled={pendingId === 'new-rule'}
          onClick={() => setEditing('new')}
        >
          New rule
        </Button>
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        A rule says how often a family is charged and how far from the lesson the
        money moves. Changing one applies to every student on it from the next
        planning run; charges already planned keep the amount and date they were
        given.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {live.length === 0 && (
        <Alert severity="info">
          No rules yet, so <strong>nothing is charged automatically</strong> for
          anyone. Lessons are billed by hand until a rule exists.
        </Alert>
      )}

      {live.length > 0 && !hasDefault && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No rule is the studio default, so a student is only billed
          automatically once they are put on a rule individually.
        </Alert>
      )}

      <Stack spacing={1}>{live.map(row)}</Stack>

      {archived.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Retired rules
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Kept for the students still on them; they cannot be picked for
            anybody new.
          </Typography>
          <Stack spacing={1}>{archived.map(row)}</Stack>
        </Box>
      )}

      <BillingRuleDialog
        open={editing !== null}
        rule={editing === 'new' ? undefined : (editing ?? undefined)}
        /* Naming the current default lets the dialog warn before stealing it. */
        currentDefaultName={live.find((r) => r.isDefault)?.name}
        isSaving={pendingId === 'new-rule' || pendingId === (editing !== 'new' ? editing?.id : undefined)}
        onClose={() => setEditing(null)}
        onSave={(draft) => {
          onSave(draft);
          setEditing(null);
        }}
      />
    </Paper>
  );
}
