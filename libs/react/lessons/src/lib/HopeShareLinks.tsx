'use client';

/**
 * What to send a family so they can order lessons through the Hope Scholarship.
 *
 * Parents start every Hope order themselves, and they cannot find the studio
 * by searching the Marketplace. The portal has no link to a single product, so
 * a family needs two things: our storefront link, and the exact name of the
 * product to search for there. This card puts both a click away, with a
 * ready-to-send message per product for an email or text.
 */
import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  IconButton,
  Link,
  Paper,
  Skeleton,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import type { HopeProduct, RequestState } from '@maple/ts/domain';
import {
  HOPE_STOREFRONT_URL,
  formatHopePrice,
  hopeFamilyMessage,
} from '@maple/ts/domain';

async function copyToClipboard(value: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  // Fallback for browsers without the async Clipboard API.
  const el = document.createElement('textarea');
  el.value = value;
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
}

/** Copies a value and reports what happened, for the card's snackbar. */
function useCopy(): {
  notice: string | null;
  clear: () => void;
  copy: (value: string, done: string) => Promise<void>;
} {
  const [notice, setNotice] = useState<string | null>(null);
  return {
    notice,
    clear: () => setNotice(null),
    copy: async (value, done) => {
      try {
        await copyToClipboard(value);
        setNotice(done);
      } catch {
        setNotice('Could not copy. Select the text and copy it by hand.');
      }
    },
  };
}

export interface HopeShareLinksProps {
  productsState: RequestState<HopeProduct[]>;
}

export function HopeShareLinks({ productsState }: HopeShareLinksProps) {
  const { notice, clear, copy } = useCopy();
  const offered =
    productsState.status === 'success'
      ? productsState.data.filter((p) => p.active)
      : [];

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
        Send a family our Hope page
      </Typography>
      <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
        Families order through Hope themselves and cannot find us by searching,
        so send them this link and the exact product name. The link only opens
        once they are signed in to their Hope account.
      </Typography>

      <Stack
        direction="row"
        sx={{ alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}
      >
        <Link
          href={HOPE_STOREFRONT_URL}
          target="_blank"
          rel="noopener noreferrer"
          variant="body2"
          sx={{ wordBreak: 'break-all' }}
        >
          {HOPE_STOREFRONT_URL}
        </Link>
        <Tooltip title="Copy link">
          <IconButton
            size="small"
            aria-label="Copy Hope storefront link"
            onClick={() => copy(HOPE_STOREFRONT_URL, 'Link copied')}
          >
            <ContentCopyIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Open (needs a parent sign-in)">
          <IconButton
            size="small"
            aria-label="Open Hope storefront"
            component="a"
            href={HOPE_STOREFRONT_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <OpenInNewIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Message for a family, by lesson
      </Typography>
      {(productsState.status === 'idle' ||
        productsState.status === 'loading') && (
        <Box aria-busy="true" aria-label="Loading EMA products">
          <Skeleton variant="rectangular" height={80} />
        </Box>
      )}
      {productsState.status === 'error' && (
        <Alert severity="error">
          Could not load EMA products: {productsState.error}
        </Alert>
      )}
      {productsState.status === 'success' && offered.length === 0 && (
        <Alert severity="info">
          No EMA products offered yet. Add them below to get a message per
          lesson.
        </Alert>
      )}
      {offered.length > 0 && (
        <Stack spacing={1}>
          {offered.map((product) => (
            <Stack
              key={product.id}
              direction="row"
              sx={{
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1,
                flexWrap: 'wrap',
              }}
            >
              <Typography variant="body2">
                {product.name}{' '}
                <Typography
                  component="span"
                  variant="body2"
                  color="textSecondary"
                >
                  · {formatHopePrice(product.priceCents)} / lesson
                </Typography>
              </Typography>
              <Button
                size="small"
                startIcon={<ContentCopyIcon />}
                aria-label={`Copy message for ${product.name}`}
                onClick={() =>
                  copy(hopeFamilyMessage(product), 'Message copied')
                }
              >
                Copy message
              </Button>
            </Stack>
          ))}
        </Stack>
      )}

      <Snackbar
        open={notice !== null}
        autoHideDuration={3000}
        onClose={clear}
        message={notice}
      />
    </Paper>
  );
}

export interface CopyHopeMessageButtonProps {
  /** The student's EMA product, so the message names what to order. */
  product?: Pick<HopeProduct, 'name' | 'priceCents'>;
}

/**
 * One button that copies the family message for a single student, for the
 * student page.
 */
export function CopyHopeMessageButton({ product }: CopyHopeMessageButtonProps) {
  const { notice, clear, copy } = useCopy();
  return (
    <>
      <Button
        size="small"
        startIcon={<ContentCopyIcon />}
        onClick={() => copy(hopeFamilyMessage(product), 'Message copied')}
      >
        Copy ordering message for the family
      </Button>
      <Snackbar
        open={notice !== null}
        autoHideDuration={3000}
        onClose={clear}
        message={notice}
      />
    </>
  );
}
