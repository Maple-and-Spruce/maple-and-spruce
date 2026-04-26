'use client';

import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AccessibilityNewIcon from '@mui/icons-material/AccessibilityNew';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import CollectionsIcon from '@mui/icons-material/Collections';
import DeleteIcon from '@mui/icons-material/Delete';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GALLERY_IMAGE_MAX, type GalleryImage } from '@maple/ts/domain';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

export interface GalleryEditorProps {
  value: GalleryImage[];
  onChange: (images: GalleryImage[]) => void;
  /** Upload a single file and return its public URL. */
  onUploadFile: (file: File) => Promise<string>;
  /** Optional handler that opens a parent-provided picker (e.g. category pool). */
  onPickFromPool?: () => void;
  pickFromPoolLabel?: string;
  pickFromPoolDisabled?: boolean;
  pickFromPoolDisabledHint?: string;
  /** Override the default cap of `GALLERY_IMAGE_MAX`. */
  max?: number;
  label?: string;
  /** Validation error from the parent's Vest suite. */
  error?: string;
}

interface SortableRowProps {
  image: GalleryImage;
  index: number;
  onAltChange: (index: number, alt: string) => void;
  onRemove: (index: number) => void;
}

function rowKey(image: GalleryImage, index: number): string {
  // URLs are unique per upload, but fall back to index if a pool image
  // is reused inside the same gallery.
  return `${image.url}|${index}`;
}

function SortableRow({ image, index, onAltChange, onRemove }: SortableRowProps) {
  const id = rowKey(image, index);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Box
      ref={setNodeRef}
      style={style}
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1,
        p: 1,
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: isDragging ? 'action.hover' : 'background.paper',
      }}
    >
      <IconButton
        {...attributes}
        {...listeners}
        size="small"
        sx={{ cursor: 'grab', '&:active': { cursor: 'grabbing' }, mt: 0.5 }}
        aria-label="Drag to reorder"
      >
        <DragIndicatorIcon fontSize="small" color="action" />
      </IconButton>
      <Box
        component="img"
        src={image.url}
        alt={image.alt || 'Gallery image preview'}
        sx={{
          width: 96,
          height: 96,
          objectFit: 'cover',
          borderRadius: 1,
          flexShrink: 0,
        }}
      />
      <TextField
        label="Image description"
        value={image.alt}
        onChange={(e) => onAltChange(index, e.target.value)}
        placeholder="e.g. Hands shaping wet clay on a wheel"
        helperText="Describe this image so screen readers and search engines can find it"
        size="small"
        fullWidth
        required
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Tooltip title="Accessibility: this description helps blind students and search engines understand the image">
                <AccessibilityNewIcon fontSize="small" color="primary" />
              </Tooltip>
            </InputAdornment>
          ),
        }}
      />
      <IconButton
        onClick={() => onRemove(index)}
        size="small"
        color="error"
        aria-label="Remove image"
        sx={{ mt: 0.5 }}
      >
        <DeleteIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}

export function GalleryEditor({
  value,
  onChange,
  onUploadFile,
  onPickFromPool,
  pickFromPoolLabel,
  pickFromPoolDisabled,
  pickFromPoolDisabledHint,
  max = GALLERY_IMAGE_MAX,
  label = 'Gallery',
  error,
}: GalleryEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const atCapacity = value.length >= max;
  const remaining = Math.max(0, max - value.length);

  const handleAltChange = useCallback(
    (index: number, alt: string) => {
      const next = value.map((img, i) => (i === index ? { ...img, alt } : img));
      onChange(next);
    },
    [value, onChange]
  );

  const handleRemove = useCallback(
    (index: number) => {
      onChange(value.filter((_, i) => i !== index));
    },
    [value, onChange]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const ids = value.map((img, i) => rowKey(img, i));
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return;
      onChange(arrayMove(value, oldIndex, newIndex));
    },
    [value, onChange]
  );

  const handleFileSelected = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      setUploadError(null);
      const files = Array.from(event.target.files ?? []);
      event.target.value = '';
      if (files.length === 0) return;

      const allowedCount = Math.max(0, max - value.length);
      const accepted = files.slice(0, allowedCount);
      if (files.length > accepted.length) {
        setUploadError(
          `Only ${allowedCount} more image${allowedCount === 1 ? '' : 's'} can be added (max ${max}).`
        );
      }

      for (const file of accepted) {
        if (!ALLOWED_TYPES.includes(file.type)) {
          setUploadError(
            `${file.name}: invalid file type. Allowed: JPEG, PNG, WebP, GIF.`
          );
          continue;
        }
        if (file.size > MAX_SIZE_BYTES) {
          setUploadError(`${file.name}: file too large (max 5 MB).`);
          continue;
        }
        setIsUploading(true);
        try {
          const url = await onUploadFile(file);
          // Append using current latest snapshot to avoid stale state when
          // multiple files upload sequentially.
          onChange([...(value ?? []), { url, alt: '' }]);
        } catch (uploadErr) {
          const message =
            uploadErr instanceof Error
              ? uploadErr.message
              : 'Image upload failed';
          setUploadError(message);
        } finally {
          setIsUploading(false);
        }
      }
    },
    [max, onChange, onUploadFile, value]
  );

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const ids = value.map((img, i) => rowKey(img, i));

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 1,
        }}
      >
        <Typography variant="subtitle2">{label}</Typography>
        <Typography variant="caption" color="text.secondary">
          {value.length} / {max} images
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      {uploadError && (
        <Alert
          severity="error"
          sx={{ mb: 1 }}
          onClose={() => setUploadError(null)}
        >
          {uploadError}
        </Alert>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_TYPES.join(',')}
        multiple
        onChange={handleFileSelected}
        style={{ display: 'none' }}
      />

      {value.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <Stack spacing={1} sx={{ mb: 1 }}>
              {value.map((image, index) => (
                <SortableRow
                  key={rowKey(image, index)}
                  image={image}
                  index={index}
                  onAltChange={handleAltChange}
                  onRemove={handleRemove}
                />
              ))}
            </Stack>
          </SortableContext>
        </DndContext>
      )}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={
            isUploading ? (
              <CircularProgress size={16} />
            ) : (
              <AddPhotoAlternateIcon />
            )
          }
          onClick={handleUploadClick}
          disabled={atCapacity || isUploading}
        >
          {isUploading
            ? 'Uploading…'
            : `Upload image${remaining > 1 ? 's' : ''}`}
        </Button>
        {onPickFromPool && (
          <Tooltip
            title={
              pickFromPoolDisabled && pickFromPoolDisabledHint
                ? pickFromPoolDisabledHint
                : ''
            }
          >
            <span>
              <Button
                variant="outlined"
                size="small"
                startIcon={<CollectionsIcon />}
                onClick={onPickFromPool}
                disabled={
                  atCapacity || pickFromPoolDisabled || isUploading
                }
              >
                {pickFromPoolLabel ?? 'Add from pool'}
              </Button>
            </span>
          </Tooltip>
        )}
      </Box>

      {value.length === 0 && !error && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Add up to {max} images to give students a richer preview of the class.
        </Typography>
      )}
    </Box>
  );
}
