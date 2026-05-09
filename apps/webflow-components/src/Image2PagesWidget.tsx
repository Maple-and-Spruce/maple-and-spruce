/**
 * Image2Pages Widget — tile a large image across multiple printable pages.
 *
 * Designed for embedding in Webflow via Code Components. Lets a customer
 * upload a stained-glass pattern (or any image), pick how big they want it
 * printed, preview the page tiling, and download a multi-page PDF that
 * they can print and assemble. Everything runs in the browser; no upload
 * leaves the visitor's machine.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Select,
  Stack,
  TextField,
  ThemeProvider,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import { theme, brandColors, surfaces, borders, text as textTokens } from '@maple/react/theme';
import {
  buildPdf,
  computeLayout,
  loadImage,
  PAGE_SIZE_LABELS,
  type Layout,
  type PageSizeKey,
  type Sizing,
} from './lib/image2pages-tile';

const PAGE_COUNT_OPTIONS = [1, 2, 4, 6, 8, 9, 12, 16];
type SizingMode = 'pages' | 'width' | 'height';

interface Image2PagesWidgetProps {
  /** Optional heading shown above the controls. */
  heading?: string;
  /** Optional intro text shown below the heading. */
  intro?: string;
}

export function Image2PagesWidget({
  heading = 'Pattern Page Tiler',
  intro = 'Upload a stained-glass pattern (or any image) and download a printable PDF tiled across as many pages as you need.',
}: Image2PagesWidgetProps) {
  const [file, setFile] = useState<File | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [sizingMode, setSizingMode] = useState<SizingMode>('pages');
  const [pageCount, setPageCount] = useState(8);
  const [targetWidthIn, setTargetWidthIn] = useState(24);
  const [targetHeightIn, setTargetHeightIn] = useState(24);
  const [pageSize, setPageSize] = useState<PageSizeKey>('letter');
  const [marginIn, setMarginIn] = useState(0.25);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Revoke any blob URLs we created when unmounting.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  // Decode the file whenever it changes; clear any stale PDF.
  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    setError(null);
    setPdfUrl((u) => {
      if (u) URL.revokeObjectURL(u);
      return null;
    });
    if (!file) {
      setImage(null);
      return;
    }
    (async () => {
      try {
        const img = await loadImage(file);
        createdUrl = img.src;
        if (!cancelled) setImage(img);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [file]);

  const sizing = useMemo<Sizing>(() => {
    if (sizingMode === 'width') return { kind: 'width', inches: targetWidthIn };
    if (sizingMode === 'height') return { kind: 'height', inches: targetHeightIn };
    return { kind: 'pages', pageCount };
  }, [sizingMode, pageCount, targetWidthIn, targetHeightIn]);

  const layout = useMemo<Layout | null>(() => {
    if (!image) return null;
    try {
      const l = computeLayout(image.width, image.height, sizing, pageSize, marginIn);
      setError(null);
      return l;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [image, sizing, pageSize, marginIn]);

  const handleGenerate = useCallback(async () => {
    if (!image || !layout || !file) return;
    setBusy(true);
    setError(null);
    try {
      const bytes = await buildPdf(image, layout);
      const ab = bytes.slice().buffer;
      const blob = new Blob([ab], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = url;
      setPdfUrl(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [image, layout, file]);

  const handleDownload = useCallback(() => {
    if (!pdfUrl || !file || !layout) return;
    const base = file.name.replace(/\.[^.]+$/, '');
    const totalPages = layout.grid.cols * layout.grid.rows;
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = `${base} (${totalPages} pages).pdf`;
    a.click();
  }, [pdfUrl, file, layout]);

  const handleOpen = useCallback(() => {
    if (!pdfUrl) return;
    const w = window.open(pdfUrl, '_blank');
    if (w) w.focus();
  }, [pdfUrl]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  };

  return (
    <ThemeProvider theme={theme}>
      <Box
        sx={{
          width: '100%',
          color: textTokens.primary,
        }}
      >
        <Box sx={{ mb: 3 }}>
          <Typography variant="h5" sx={{ color: textTokens.primary, fontWeight: 600, mb: 0.5 }}>
            {heading}
          </Typography>
          {intro && (
            <Typography variant="body2" sx={{ color: textTokens.secondary }}>
              {intro}
            </Typography>
          )}
        </Box>

        <Stack
          spacing={2}
          sx={{
            backgroundColor: surfaces.paper,
            border: `1px solid ${borders.subtle}`,
            borderRadius: 2,
            p: { xs: 2, sm: 3 },
          }}
        >
          {/* File drop / picker */}
          <Box
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            sx={{
              position: 'relative',
              border: `1.5px dashed ${file ? brandColors.sageGreen : borders.strong}`,
              backgroundColor: file ? 'rgba(107, 123, 94, 0.06)' : 'transparent',
              borderRadius: 2,
              p: 3,
              textAlign: 'center',
              transition: 'border-color 0.15s, background-color 0.15s',
            }}
          >
            <input
              id="image2pages-file"
              type="file"
              accept="image/*"
              onChange={onFileChange}
              style={{
                position: 'absolute',
                inset: 0,
                opacity: 0,
                cursor: 'pointer',
              }}
            />
            <Box sx={{ pointerEvents: 'none' }}>
              <Typography variant="body1" sx={{ color: textTokens.primary, fontWeight: 500 }}>
                {file ? file.name : 'Drop an image here or click to choose'}
              </Typography>
              {image && (
                <Typography variant="caption" sx={{ color: textTokens.secondary }}>
                  {image.width} × {image.height}px
                </Typography>
              )}
            </Box>
          </Box>

          {/* Sizing mode toggle */}
          <Box>
            <Typography
              variant="caption"
              sx={{ display: 'block', mb: 0.75, color: textTokens.secondary }}
            >
              Sizing mode
            </Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={sizingMode}
              onChange={(_, v) => v && setSizingMode(v as SizingMode)}
              sx={{
                '& .MuiToggleButton-root': {
                  textTransform: 'none',
                  borderColor: borders.default,
                  color: textTokens.secondary,
                },
                '& .Mui-selected': {
                  backgroundColor: `${brandColors.sageGreen} !important`,
                  color: `${surfaces.paper} !important`,
                  borderColor: `${brandColors.sageGreen} !important`,
                },
              }}
            >
              <ToggleButton value="pages">By page count</ToggleButton>
              <ToggleButton value="width">By width</ToggleButton>
              <ToggleButton value="height">By height</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Numeric / select controls */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            {sizingMode === 'pages' && (
              <TextField
                select
                size="small"
                label="Pages"
                value={pageCount}
                onChange={(e) => setPageCount(parseInt(e.target.value, 10))}
                sx={{ minWidth: 140 }}
              >
                {PAGE_COUNT_OPTIONS.map((n) => (
                  <MenuItem key={n} value={n}>
                    {n}
                  </MenuItem>
                ))}
              </TextField>
            )}
            {sizingMode === 'width' && (
              <TextField
                size="small"
                label="Printed width (in)"
                type="number"
                inputProps={{ min: 0.5, step: 0.5 }}
                value={targetWidthIn}
                onChange={(e) => setTargetWidthIn(parseFloat(e.target.value) || 0)}
                sx={{ minWidth: 160 }}
              />
            )}
            {sizingMode === 'height' && (
              <TextField
                size="small"
                label="Printed height (in)"
                type="number"
                inputProps={{ min: 0.5, step: 0.5 }}
                value={targetHeightIn}
                onChange={(e) => setTargetHeightIn(parseFloat(e.target.value) || 0)}
                sx={{ minWidth: 160 }}
              />
            )}
            <Select
              size="small"
              value={pageSize}
              onChange={(e) => setPageSize(e.target.value as PageSizeKey)}
              sx={{ minWidth: 200 }}
            >
              {(Object.keys(PAGE_SIZE_LABELS) as PageSizeKey[]).map((k) => (
                <MenuItem key={k} value={k}>
                  {PAGE_SIZE_LABELS[k]}
                </MenuItem>
              ))}
            </Select>
            <TextField
              size="small"
              label="Margin (in)"
              type="number"
              inputProps={{ min: 0, step: 0.05 }}
              value={marginIn}
              onChange={(e) => setMarginIn(Math.max(0, parseFloat(e.target.value) || 0))}
              sx={{ minWidth: 130 }}
            />
          </Stack>

          {/* Action row */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <Button
              variant="contained"
              color="secondary"
              disabled={!image || !layout || busy}
              onClick={handleGenerate}
            >
              {busy ? 'Generating…' : 'Generate PDF'}
            </Button>
            <Button
              variant="outlined"
              color="primary"
              startIcon={<FileDownloadOutlinedIcon />}
              disabled={!pdfUrl}
              onClick={handleDownload}
            >
              Download
            </Button>
            <Button
              variant="outlined"
              color="primary"
              startIcon={<OpenInNewOutlinedIcon />}
              disabled={!pdfUrl}
              onClick={handleOpen}
            >
              Open / Print
            </Button>
          </Stack>

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>

        {image && layout && (
          <Box
            sx={{
              mt: 3,
              backgroundColor: surfaces.paper,
              border: `1px solid ${borders.subtle}`,
              borderRadius: 2,
              p: { xs: 2, sm: 3 },
            }}
          >
            <PreviewCanvas image={image} layout={layout} />
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={{ xs: 0.5, sm: 3 }}
              sx={{ mt: 1.5, color: textTokens.secondary, fontSize: 13 }}
            >
              <Box>
                <Typography component="span" sx={{ fontWeight: 600, color: textTokens.primary }}>
                  Pages:
                </Typography>{' '}
                {layout.grid.cols * layout.grid.rows} ({layout.grid.cols} × {layout.grid.rows}{' '}
                {layout.grid.orient})
              </Box>
              <Box>
                <Typography component="span" sx={{ fontWeight: 600, color: textTokens.primary }}>
                  Printed size:
                </Typography>{' '}
                {(layout.grid.printedW / 72).toFixed(2)}″ × {(layout.grid.printedH / 72).toFixed(2)}
                ″
              </Box>
            </Stack>
          </Box>
        )}

        {pdfUrl && (
          <Box sx={{ mt: 3 }}>
            <Typography
              variant="subtitle2"
              sx={{ mb: 1, color: textTokens.secondary, fontWeight: 600 }}
            >
              PDF preview
            </Typography>
            <Box
              component="iframe"
              src={pdfUrl}
              title="Image2Pages PDF preview"
              sx={{
                width: '100%',
                height: 560,
                border: `1px solid ${borders.subtle}`,
                borderRadius: 2,
                backgroundColor: surfaces.paper,
              }}
            />
          </Box>
        )}
      </Box>
    </ThemeProvider>
  );
}

/**
 * Renders the source image at a manageable display size, with dashed
 * lines marking where each page boundary will fall on the printed image.
 */
function PreviewCanvas({ image, layout }: { image: HTMLImageElement; layout: Layout }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const maxDisplay = 720;
    const displayScale = Math.min(1, maxDisplay / image.width);
    const dispW = Math.round(image.width * displayScale);
    const dispH = Math.round(image.height * displayScale);

    canvas.width = dispW;
    canvas.height = dispH;
    ctx.clearRect(0, 0, dispW, dispH);
    ctx.drawImage(image, 0, 0, dispW, dispH);

    const { grid, offsetX, offsetY } = layout;
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = brandColors.darkBrown;

    for (let c = 1; c < grid.cols; c++) {
      const xPts = c * grid.pw - offsetX;
      if (xPts <= 0 || xPts >= grid.printedW) continue;
      const xDisp = (xPts / grid.printedW) * dispW;
      ctx.beginPath();
      ctx.moveTo(xDisp + 0.5, 0);
      ctx.lineTo(xDisp + 0.5, dispH);
      ctx.stroke();
    }
    for (let r = 1; r < grid.rows; r++) {
      const yPts = r * grid.ph - offsetY;
      if (yPts <= 0 || yPts >= grid.printedH) continue;
      const yDisp = (yPts / grid.printedH) * dispH;
      ctx.beginPath();
      ctx.moveTo(0, yDisp + 0.5);
      ctx.lineTo(dispW, yDisp + 0.5);
      ctx.stroke();
    }
  }, [image, layout]);

  return (
    <Box
      component="canvas"
      ref={canvasRef}
      sx={{
        display: 'block',
        maxWidth: '100%',
        height: 'auto',
        backgroundColor: surfaces.paper,
        borderRadius: 1,
      }}
    />
  );
}
