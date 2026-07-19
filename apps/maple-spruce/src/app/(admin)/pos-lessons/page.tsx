'use client';

import { useMemo, useState } from 'react';
import { Box, Chip, Tab, Tabs, Typography } from '@mui/material';
import type {
  PosLessonAttribution,
  PosLessonAttributionStatus,
} from '@maple/ts/domain';
import type { PosLessonResolution } from '@maple/ts/firebase/api-types';
import { usePosLessonAttributions, useStudents } from '@maple/react/data';
import {
  PosLessonAttributionResolver,
  PosLessonAttributionTable,
} from '../../../components/pos';

type TabValue = 'all' | PosLessonAttributionStatus;

export default function PosLessonsPage() {
  const { attributionsState, summaryState, resolveAttribution } =
    usePosLessonAttributions();
  const { studentsState } = useStudents();

  const [activeTab, setActiveTab] = useState<TabValue>('pending');
  const [toReview, setToReview] = useState<PosLessonAttribution | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  const students =
    studentsState.status === 'success' ? studentsState.data : [];
  const studentsById = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students]
  );

  const filtered = useMemo(() => {
    if (attributionsState.status !== 'success') return undefined;
    if (activeTab === 'all') return attributionsState.data;
    return attributionsState.data.filter((a) => a.status === activeTab);
  }, [attributionsState, activeTab]);

  const summary =
    summaryState.status === 'success' ? summaryState.data : undefined;

  const handleResolve = async (
    action: PosLessonResolution,
    opts?: { studentId?: string; notes?: string }
  ) => {
    if (!toReview) return;
    setIsResolving(true);
    try {
      await resolveAttribution(toReview.id, action, opts);
      setToReview(null);
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <>
      <Typography variant="h4" component="h1" gutterBottom>
        POS Lessons
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        In-person Square POS lesson sales. Attribute each to a student to settle
        their matching open invoice or create a paid one. Sales whose customer
        email matched a single student are attributed automatically.
      </Typography>

      <Tabs
        value={activeTab}
        onChange={(_e, v: TabValue) => setActiveTab(v)}
        sx={{ mb: 2 }}
      >
        <Tab
          value="pending"
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              Pending
              {summary && summary.pending > 0 && (
                <Chip label={summary.pending} size="small" color="warning" />
              )}
            </Box>
          }
        />
        <Tab value="attributed" label="Attributed" />
        <Tab value="dismissed" label="Dismissed" />
        <Tab value="all" label="All" />
      </Tabs>

      <PosLessonAttributionTable
        attributionsState={attributionsState}
        studentsById={studentsById}
        onReview={setToReview}
        filteredAttributions={filtered}
      />

      <PosLessonAttributionResolver
        attribution={toReview}
        students={students}
        open={!!toReview}
        onClose={() => setToReview(null)}
        onResolve={handleResolve}
        isResolving={isResolving}
      />
    </>
  );
}
