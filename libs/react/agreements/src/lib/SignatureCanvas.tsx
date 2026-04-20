'use client';

import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Box, Button, Typography, Stack } from '@mui/material';
import SignaturePad from 'signature_pad';

export interface SignatureCanvasHandle {
  /** Returns base64 PNG data URL, or empty string if blank */
  toDataURL: () => string;
  /** Returns true if the pad has no strokes */
  isEmpty: () => boolean;
  /** Clear the canvas */
  clear: () => void;
}

interface SignatureCanvasProps {
  label?: string;
  /** Height in pixels (default: 200) */
  height?: number;
  /** Whether to show an error state */
  error?: boolean;
  /** Error helper text */
  helperText?: string;
}

export const SignatureCanvas = forwardRef<SignatureCanvasHandle, SignatureCanvasProps>(
  function SignatureCanvas({ label = 'Signature', height = 200, error, helperText }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const padRef = useRef<SignaturePad | null>(null);

    // Initialize signature_pad and handle resize
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Handle high-DPI displays
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(ratio, ratio);
      }

      padRef.current = new SignaturePad(canvas, {
        backgroundColor: 'rgb(255, 255, 255)',
        penColor: 'rgb(0, 0, 0)',
      });

      return () => {
        padRef.current?.off();
        padRef.current = null;
      };
    }, []);

    // Handle window resize
    useEffect(() => {
      const handleResize = (): void => {
        const canvas = canvasRef.current;
        const pad = padRef.current;
        if (!canvas || !pad) return;

        const data = pad.toData();
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * ratio;
        canvas.height = rect.height * ratio;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.scale(ratio, ratio);
        }
        pad.clear();
        pad.fromData(data);
      };

      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleClear = useCallback(() => {
      padRef.current?.clear();
    }, []);

    useImperativeHandle(ref, () => ({
      toDataURL: () => {
        if (!padRef.current || padRef.current.isEmpty()) return '';
        return padRef.current.toDataURL('image/png');
      },
      isEmpty: () => padRef.current?.isEmpty() ?? true,
      clear: () => padRef.current?.clear(),
    }));

    return (
      <Box>
        <Typography
          variant="subtitle2"
          sx={{ mb: 1, color: error ? 'error.main' : 'text.secondary' }}
        >
          {label}
        </Typography>
        <Box
          sx={{
            border: 1,
            borderColor: error ? 'error.main' : 'divider',
            borderRadius: 1,
            overflow: 'hidden',
            bgcolor: 'white',
          }}
        >
          <canvas
            ref={canvasRef}
            style={{
              width: '100%',
              height: `${height}px`,
              display: 'block',
              touchAction: 'none',
            }}
          />
        </Box>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5 }}>
          <Typography variant="caption" color={error ? 'error' : 'text.secondary'}>
            {helperText || 'Draw your signature above'}
          </Typography>
          <Button size="small" onClick={handleClear}>
            Clear
          </Button>
        </Stack>
      </Box>
    );
  }
);
