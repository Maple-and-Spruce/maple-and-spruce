'use client';

import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import type { GalleryImage } from '@maple/ts/domain';

export interface CategoryGalleryPickerDialogProps {
  open: boolean;
  categoryName: string;
  pool: GalleryImage[];
  /** URLs already in the class gallery (shown as checked + disabled). */
  alreadyAdded: Set<string>;
  /** Maximum new images that can still be added. */
  remainingCapacity: number;
  onClose: () => void;
  onConfirm: (selected: GalleryImage[]) => void;
}

export function CategoryGalleryPickerDialog({
  open,
  categoryName,
  pool,
  alreadyAdded,
  remainingCapacity,
  onClose,
  onConfirm,
}: CategoryGalleryPickerDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open]);

  const toggle = (url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const overCapacity = selected.size > remainingCapacity;

  const handleConfirm = () => {
    const picks = pool.filter((img) => selected.has(img.url));
    onConfirm(picks);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Add from {categoryName} pool</DialogTitle>
      <DialogContent>
        {pool.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No images in this category&apos;s pool yet. Upload pool images
            from the Class Categories admin first.
          </Typography>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              You can add up to {remainingCapacity} more image
              {remainingCapacity === 1 ? '' : 's'}. Pool images are shared —
              adding one here doesn&apos;t copy the file.
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                gap: 1.5,
              }}
            >
              {pool.map((img) => {
                const isAdded = alreadyAdded.has(img.url);
                const isSelected = selected.has(img.url);
                const disabled = isAdded;
                return (
                  <Box
                    key={img.url}
                    onClick={() => !disabled && toggle(img.url)}
                    sx={{
                      position: 'relative',
                      border: 2,
                      borderColor: isSelected
                        ? 'primary.main'
                        : isAdded
                          ? 'success.light'
                          : 'divider',
                      borderRadius: 1,
                      overflow: 'hidden',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.6 : 1,
                    }}
                  >
                    <Box
                      component="img"
                      src={img.url}
                      alt={img.alt || 'Pool image'}
                      sx={{
                        width: '100%',
                        height: 120,
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                    <Checkbox
                      checked={isAdded || isSelected}
                      disabled={disabled}
                      sx={{
                        position: 'absolute',
                        top: 4,
                        left: 4,
                        bgcolor: 'rgba(255,255,255,0.85)',
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.95)' },
                        p: 0.5,
                      }}
                    />
                    {img.alt && (
                      <Box
                        sx={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          right: 0,
                          px: 1,
                          py: 0.5,
                          bgcolor: 'rgba(0,0,0,0.55)',
                          color: 'white',
                          fontSize: 11,
                          lineHeight: 1.3,
                          maxHeight: 40,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {img.alt}
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>
            {overCapacity && (
              <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>
                You&apos;ve selected {selected.size} but only {remainingCapacity}{' '}
                more can fit.
              </Typography>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          disabled={selected.size === 0 || overCapacity}
        >
          Add {selected.size > 0 ? `${selected.size} ` : ''}
          {selected.size === 1 ? 'image' : 'images'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
