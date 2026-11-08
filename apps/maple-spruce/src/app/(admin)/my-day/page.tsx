'use client';

import { useMemo, useState } from 'react';
import {
  addLocalDays,
  startOfLocalWeek,
  type ManualInvoicePaymentSource,
} from '@maple/ts/domain';
import { useMyDay, useMyWeek } from '@maple/react/data';
import {
  MyWeekPageView,
  type MyDayCardAction,
} from '../../../components/my-day';

/**
 * The teacher's "My Week" page. The route stays `/my-day` so bookmarks keep
 * working; it opens on the Week tab, with Today and Openings a tap away.
 */
export default function MyWeekPage() {
  const { dayState, recordPayment } = useMyDay();
  /**
   * Which action is running, on which lesson. Was a single page-wide boolean,
   * which froze every card in the day while one saved and never said which
   * action was in flight (legacy #805).
   */
  const [pending, setPending] = useState<{
    lessonId: string;
    action: MyDayCardAction;
  } | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  const weekStart = useMemo(
    () => addLocalDays(startOfLocalWeek(new Date()), weekOffset * 7),
    [weekOffset],
  );
  const { weekState } = useMyWeek(weekStart);

  const handleRecordPayment = async (
    lessonId: string,
    invoiceId: string,
    source: ManualInvoicePaymentSource,
  ) => {
    setPending({ lessonId, action: source });
    try {
      await recordPayment(invoiceId, source);
    } finally {
      setPending(null);
    }
  };

  return (
    <MyWeekPageView
      dayState={dayState}
      weekState={weekState}
      weekStart={weekStart}
      onPrevWeek={() => setWeekOffset((o) => o - 1)}
      onNextWeek={() => setWeekOffset((o) => o + 1)}
      onThisWeek={() => setWeekOffset(0)}
      onRecordPayment={handleRecordPayment}
      pending={pending}
    />
  );
}
