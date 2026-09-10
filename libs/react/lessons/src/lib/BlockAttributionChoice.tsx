'use client';

/**
 * BlockAttributionChoice (#835) — what to do when no block covers the time.
 *
 * Every lesson must sit inside a `LessonBlock` (#686). Until now, picking a
 * time nothing covered was a dead end: the dialog said the lesson did not fit
 * and Katie had to leave, widen the block on the Lesson Blocks page, and come
 * back. Devin Marlowe's 6:00–6:30 slot is exactly that — Katie's Tuesday
 * block ends at 6:00, so his half hour falls off the end of it.
 *
 * The app already knows which widening would fit. `planBlockAttribution` works
 * it out, and this offers the result:
 *
 *   nothing needed   a block already covers it — this renders nothing
 *   extend           a block is within an hour; widen it to reach
 *   create           nothing is near; derive a new block from the lesson
 *   blocked          it cannot be expressed as a block at all, and why
 *
 * Nothing is applied automatically. Widening a recurring block changes that
 * weekday for **every** future lesson, so it says so in those words and waits
 * to be chosen.
 */
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Radio,
  Stack,
  Typography,
} from '@mui/material';
import type { BlockPlan, BlockStrategy } from '@maple/ts/domain';
import { WEEKDAY_LONG } from '@maple/ts/domain';
import { formatMinutes } from './block-format';

export interface BlockAttributionChoiceProps {
  plan: BlockPlan;
  /** Weekday the lesson falls on, for wording the offers. */
  weekday: number;
  /** True for a standing arrangement, false for a single lesson. */
  recurring: boolean;
  /** The chosen strategy, or undefined while nothing is chosen. */
  value?: BlockStrategy;
  onChange: (strategy: BlockStrategy | undefined) => void;
}

function windowLabel(start: number, end: number): string {
  return `${formatMinutes(start)}–${formatMinutes(end)}`;
}

export function BlockAttributionChoice({
  plan,
  weekday,
  recurring,
  value,
  onChange,
}: BlockAttributionChoiceProps) {
  // Something already covers this time; there is nothing to decide.
  if (plan.fits) return null;

  if (plan.blocked) {
    return (
      <Alert severity="error">
        <AlertTitle>This time cannot be scheduled</AlertTitle>
        {plan.blocked}
      </Alert>
    );
  }

  const day = WEEKDAY_LONG[weekday];
  const chosen = (s: BlockStrategy): boolean => {
    if (!value) return false;
    if (value.mode !== s.mode) return false;
    if (s.mode === 'extend' && value.mode === 'extend') {
      return value.blockId === s.blockId && value.scope === s.scope;
    }
    return true;
  };

  const option = (
    key: string,
    strategy: BlockStrategy,
    title: string,
    detail: string
  ) => (
    <Box
      key={key}
      onClick={() => onChange(strategy)}
      sx={{
        display: 'flex',
        gap: 1,
        p: 1.5,
        border: '1px solid',
        borderColor: chosen(strategy) ? 'primary.main' : 'divider',
        borderRadius: 1,
        cursor: 'pointer',
      }}
    >
      <Radio
        size="small"
        checked={chosen(strategy)}
        onChange={() => onChange(strategy)}
        sx={{ p: 0, mt: 0.25 }}
        inputProps={{ 'aria-label': title }}
      />
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {detail}
        </Typography>
      </Box>
    </Box>
  );

  return (
    <Alert severity="info" icon={false} sx={{ '& .MuiAlert-message': { width: '100%' } }}>
      <AlertTitle>No block covers this time</AlertTitle>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Lessons have to sit inside a teaching block. Pick how to make room, and
        it will be done when you save.
      </Typography>

      <Stack spacing={1}>
        {plan.extensions.map((ext) =>
          option(
            `weekly-${ext.block.id}`,
            { mode: 'extend', blockId: ext.block.id, scope: 'weekly' },
            `Extend ${day}s to ${windowLabel(ext.startMinutes, ext.endMinutes)}`,
            `Currently ${windowLabel(ext.block.startMinutes, ext.block.endMinutes)}. This changes every ${day}, not just this one.`
          )
        )}

        {/* A one-off block cannot host a weekly arrangement — every week after
            the first would come back unattributed — so it is only offered for
            a single lesson. */}
        {!recurring &&
          plan.extensions.map((ext) =>
            option(
              `once-${ext.block.id}`,
              { mode: 'extend', blockId: ext.block.id, scope: 'this-date' },
              `Extend just this ${day}`,
              `${windowLabel(ext.startMinutes, ext.endMinutes)} on this date only. ${day}s stay ${windowLabel(ext.block.startMinutes, ext.block.endMinutes)}.`
            )
          )}

        {plan.draft &&
          option(
            'create',
            { mode: 'create' },
            recurring
              ? `Add a new ${day} block, ${windowLabel(plan.draft.startMinutes, plan.draft.endMinutes)}`
              : `Add a block for this ${day} only`,
            recurring
              ? 'A new weekly teaching block, sized to this lesson.'
              : 'Covers this one date. Weekly availability is unchanged.',
          )}
      </Stack>

      {value && (
        <Box sx={{ mt: 1.5 }}>
          <Button size="small" onClick={() => onChange(undefined)}>
            Clear
          </Button>
        </Box>
      )}
    </Alert>
  );
}
