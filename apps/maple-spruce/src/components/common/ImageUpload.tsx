'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Alert,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteIcon from '@mui/icons-material/Delete';

/**
 * Allowed image MIME types
 */
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * Max file size in bytes (5MB)
 */
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Image upload state using discriminated union pattern
 */
export type ImageUploadState =
  | { status: 'idle' }
  | { status: 'removed' } // User explicitly removed the image
  | { status: 'previewing'; previewUrl: string; file: File }
  | { status: 'uploading'; previewUrl: string }
  | { status: 'success'; url: string }
  | { status: 'error'; error: string; previewUrl?: string };

interface ImageUploadProps {
  /** Current state of the upload */
  state: ImageUploadState;
  /** Called when a file is selected (after validation) */
  onFileSelected: (file: File, previewUrl: string) => void;
  /** Called when the remove button is clicked */
  onRemove: () => void;
  /** Optional existing image URL to display */
  existingImageUrl?: string;
  /** Optional label for the upload area */
  label?: string;
}

/**
 * Image upload component with drag-and-drop support
 *
 * Based on the pattern from Mountain Sol Platform's ImageUploadComponent.
 * Uses discriminated unions for state management (not boolean flags).
 *
 * @example
 * const [uploadState, setUploadState] = useState<ImageUploadState>({ status: 'idle' });
 *
 * <ImageUpload
 *   state={uploadState}
 *   onFileSelected={(file, previewUrl) => {
 *     setUploadState({ status: 'previewing', previewUrl, file });
 *   }}
 *   onRemove={() => setUploadState({ status: 'idle' })}
 *   existingImageUrl={artist?.photoUrl}
 * />
 */
export function ImageUpload({
  state,
  onFileSelected,
  onRemove,
  existingImageUrl,
  label = 'Photo',
}: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Validate and process the selected file
   */
  const processFile = useCallback(
    (file: File) => {
      setValidationError(null);

      // Validate file type
      if (!ALLOWED_TYPES.includes(file.type)) {
        setValidationError(
          `Invalid file type. Allowed: ${ALLOWED_TYPES.map((t) => t.split('/')[1]).join(', ')}`
        );
        return;
      }

      // Validate file size
      if (file.size > MAX_SIZE_BYTES) {
        const maxSizeMB = MAX_SIZE_BYTES / (1024 * 1024);
        setValidationError(`File too large. Maximum size: ${maxSizeMB}MB`);
        return;
      }

      // Generate preview URL
      const reader = new FileReader();
      reader.onload = (e) => {
        const previewUrl = e.target?.result as string;
        onFileSelected(file, previewUrl);
      };
      reader.readAsDataURL(file);
    },
    [onFileSelected]
  );

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        processFile(file);
      }
      // Reset input so the same file can be selected again
      event.target.value = '';
    },
    [processFile]
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);

      const file = event.dataTransfer.files?.[0];
      if (file) {
        processFile(file);
      }
    },
    [processFile]
  );

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Determine what image to display
  // If user explicitly removed the image, don't fall back to existingImageUrl
  const displayUrl =
    state.status === 'removed'
      ? undefined
      : state.status === 'success'
        ? state.url
        : state.status === 'previewing' || state.status === 'uploading'
          ? state.previewUrl
          : state.status === 'error' && state.previewUrl
            ? state.previewUrl
            : existingImageUrl;

  const isUploading = state.status === 'uploading';
  const hasImage = !!displayUrl;

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {label}
      </Typography>

      {/* Error display */}
      {validationError && (
        <Alert severity="error" sx={{ mb: 1 }} onClose={() => setValidationError(null)}>
          {validationError}
        </Alert>
      )}
      {state.status === 'error' && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {state.error}
        </Alert>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_TYPES.join(',')}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {hasImage ? (
        /* Image preview with remove button */
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            maxWidth: 300,
            borderRadius: 1,
            overflow: 'hidden',
          }}
        >
          <Box
            component="img"
            src={displayUrl}
            alt="Preview"
            sx={{
              width: '100%',
              height: 'auto',
              display: 'block',
              opacity: isUploading ? 0.5 : 1,
            }}
          />
          {isUploading && (
            <Box
              sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
              }}
            >
              <CircularProgress />
            </Box>
          )}
          {!isUploading && (
            <IconButton
              onClick={onRemove}
              sx={{
                position: 'absolute',
                top: 8,
                right: 8,
                bgcolor: 'rgba(0, 0, 0, 0.5)',
                color: 'white',
                '&:hover': {
                  bgcolor: 'rgba(0, 0, 0, 0.7)',
                },
              }}
              size="small"
              aria-label="Remove image"
            >
              <DeleteIcon />
            </IconButton>
          )}
        </Box>
      ) : (
        /* Drop zone */
        <Box
          onClick={handleClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          sx={{
            border: '2px dashed',
            borderColor: isDragging ? 'primary.main' : 'divider',
            borderRadius: 1,
            p: 4,
            textAlign: 'center',
            cursor: 'pointer',
            bgcolor: isDragging ? 'action.hover' : 'transparent',
            transition: 'all 0.2s',
            '&:hover': {
              borderColor: 'primary.main',
              bgcolor: 'action.hover',
            },
          }}
        >
          <CloudUploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            Drag and drop an image here, or click to browse
          </Typography>
          <Typography variant="caption" color="text.secondary">
            JPEG, PNG, WebP, GIF (max 5MB)
          </Typography>
        </Box>
      )}
    </Box>
  );
}
