'use client';

import { useState, useCallback } from 'react';
import { Box, Typography, Button, Alert } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import type { CreateLessonBlockInput, LessonBlock } from '@maple/ts/domain';
import { DeleteConfirmDialog } from '@maple/react/ui';
import { LessonBlockForm, LessonBlockList } from '@maple/react/lessons';
import { WEEKDAY_LONG } from '@maple/ts/domain';
import { useLessonBlocks, useInstructors } from '../../../hooks';

export default function LessonBlocksPage() {
  const {
    lessonBlocksState,
    createLessonBlock,
    updateLessonBlock,
    deleteLessonBlock,
  } = useLessonBlocks();
  const { instructorsState } = useInstructors();
  const instructors =
    instructorsState.status === 'success' ? instructorsState.data : [];

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<LessonBlock | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [blockToDelete, setBlockToDelete] = useState<LessonBlock | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleOpenForm = useCallback((block?: LessonBlock) => {
    setEditingBlock(block);
    setIsFormOpen(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setIsFormOpen(false);
    setEditingBlock(undefined);
  }, []);

  const handleSubmitForm = useCallback(
    async (data: CreateLessonBlockInput) => {
      setIsSubmitting(true);
      try {
        if (editingBlock) {
          // teacherId can't be reassigned — send only the editable fields.
          await updateLessonBlock({
            id: editingBlock.id,
            dayOfWeek: data.dayOfWeek,
            startMinutes: data.startMinutes,
            endMinutes: data.endMinutes,
            label: data.label,
          });
        } else {
          await createLessonBlock(data);
        }
        handleCloseForm();
      } catch (error) {
        console.error('Failed to save lesson block:', error);
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
    [editingBlock, handleCloseForm, createLessonBlock, updateLessonBlock],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!blockToDelete) return;
    setIsDeleting(true);
    try {
      await deleteLessonBlock(blockToDelete.id);
      setBlockToDelete(null);
    } catch (error) {
      console.error('Failed to delete lesson block:', error);
    } finally {
      setIsDeleting(false);
    }
  }, [blockToDelete, deleteLessonBlock]);

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 1,
        }}
      >
        <Typography variant="h4" component="h1">
          Lesson Blocks
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenForm()}
        >
          Add Block
        </Button>
      </Box>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Weekly windows a teacher takes lessons in. Every lesson must be
        scheduled inside one of its teacher&rsquo;s blocks.
      </Typography>

      <LessonBlockList
        lessonBlocksState={lessonBlocksState}
        instructors={instructors}
        onEdit={handleOpenForm}
        onDelete={setBlockToDelete}
      />

      <LessonBlockForm
        open={isFormOpen}
        onClose={handleCloseForm}
        onSubmit={handleSubmitForm}
        block={editingBlock}
        instructors={instructors}
        isSubmitting={isSubmitting}
      />

      <DeleteConfirmDialog
        open={!!blockToDelete}
        onClose={() => setBlockToDelete(null)}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
        title="Delete Lesson Block?"
        itemName={
          blockToDelete ? `${WEEKDAY_LONG[blockToDelete.dayOfWeek]} block` : ''
        }
        warningContent={
          <Alert severity="warning">
            Lessons already scheduled in this block stay put but will be flagged
            as &ldquo;needs a block&rdquo; for you to reattribute. Deleting
            cannot be undone.
          </Alert>
        }
      />
    </>
  );
}
