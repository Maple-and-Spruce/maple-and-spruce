'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Typography,
  Skeleton,
  Alert,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Category, RequestState } from '@maple/ts/domain';

interface CategoryListProps {
  categoriesState: RequestState<Category[]>;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
  /** Called with the complete ordered list of category IDs after a drag */
  onReorder: (orderedCategoryIds: string[]) => Promise<void>;
}

interface SortableRowProps {
  category: Category;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
}

function SortableRow({ category, onEdit, onDelete }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    backgroundColor: isDragging ? 'rgba(0, 0, 0, 0.04)' : undefined,
  };

  return (
    <TableRow ref={setNodeRef} style={style} hover>
      <TableCell width={50}>
        <IconButton
          ref={setActivatorNodeRef}
          {...listeners}
          size="small"
          sx={{ cursor: 'grab', '&:active': { cursor: 'grabbing' } }}
          aria-label="Drag to reorder"
          tabIndex={attributes.tabIndex}
          role={attributes.role}
        >
          <DragIndicatorIcon fontSize="small" color="action" />
        </IconButton>
      </TableCell>
      <TableCell>
        <Typography variant="body1" fontWeight="medium">
          {category.name}
        </Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body2" color="text.secondary">
          {category.description || '—'}
        </Typography>
      </TableCell>
      <TableCell align="right">
        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
          <IconButton
            onClick={() => onEdit(category)}
            size="small"
            aria-label="Edit"
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton
            onClick={() => onDelete(category)}
            size="small"
            aria-label="Delete"
            color="error"
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      </TableCell>
    </TableRow>
  );
}

function LoadingSkeleton() {
  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell width={50}></TableCell>
            <TableCell>Name</TableCell>
            <TableCell>Description</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {[1, 2, 3].map((i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton variant="circular" width={24} height={24} />
              </TableCell>
              <TableCell>
                <Skeleton variant="text" width={150} />
              </TableCell>
              <TableCell>
                <Skeleton variant="text" width={200} />
              </TableCell>
              <TableCell align="right">
                <Skeleton variant="rounded" width={80} height={32} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export function CategoryList({
  categoriesState,
  onEdit,
  onDelete,
  onReorder,
}: CategoryListProps) {
  const [localCategories, setLocalCategories] = useState<Category[]>([]);
  const isReorderingRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Sync local state with server state when server data changes (and we're not mid-reorder)
  useEffect(() => {
    if (categoriesState.status === 'success' && !isReorderingRef.current) {
      setLocalCategories(categoriesState.data);
    }
  }, [categoriesState]);

  // Use local categories for display (maintains optimistic order)
  const categories =
    categoriesState.status === 'success'
      ? localCategories.length > 0
        ? localCategories
        : categoriesState.data
      : [];

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = categories.findIndex((c) => c.id === active.id);
      const newIndex = categories.findIndex((c) => c.id === over.id);

      // Optimistic update - reorder the local array
      const reorderedCategories = arrayMove(categories, oldIndex, newIndex);
      setLocalCategories(reorderedCategories);
      isReorderingRef.current = true;

      // Send the complete ordered list of IDs to the server
      // The server will renormalize all order values (0, 10, 20, etc.)
      const orderedIds = reorderedCategories.map((c) => c.id);

      try {
        await onReorder(orderedIds);
        // Server response will update categoriesState, which will sync to localCategories
        // via the useEffect (since isReorderingRef will be false after finally)
      } catch (error) {
        console.error('Failed to reorder categories:', error);
        // Reset to server state on error
        if (categoriesState.status === 'success') {
          setLocalCategories(categoriesState.data);
        }
      } finally {
        isReorderingRef.current = false;
      }
    }
  };

  if (categoriesState.status === 'loading') {
    return <LoadingSkeleton />;
  }

  if (categoriesState.status === 'error') {
    return (
      <Alert severity="error">
        Failed to load categories: {categoriesState.error}
      </Alert>
    );
  }

  if (categoriesState.status === 'idle') {
    return null;
  }

  if (categories.length === 0) {
    return (
      <Box
        sx={{
          textAlign: 'center',
          py: 8,
          color: 'text.secondary',
        }}
      >
        <Typography variant="h6">No categories yet</Typography>
        <Typography>Click &quot;Add Category&quot; to get started</Typography>
      </Box>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell width={50}></TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Description</TableCell>
              <TableCell align="right" width={100}>
                Actions
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <SortableContext
              items={categories.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              {categories.map((category) => (
                <SortableRow
                  key={category.id}
                  category={category}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </SortableContext>
          </TableBody>
        </Table>
      </TableContainer>
    </DndContext>
  );
}
