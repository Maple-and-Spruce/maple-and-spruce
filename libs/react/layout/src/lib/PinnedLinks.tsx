'use client';

import { ReactNode, useId, useRef, useState } from 'react';
import { Box, ButtonBase, Popover, Typography } from '@mui/material';
import { darken, lighten } from '@mui/material/styles';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { colors, fonts } from '@maple/react/theme';
import { splitPinnedLinks, type ExternalLink } from './nav-model';

export interface PinnedLinksProps {
  links: readonly ExternalLink[];
}

// The prototype's tile cream sits between creamLight and white.
const TILE_BG = lighten(colors.creamLight, 0.25);
const TILE_HOVER = darken(colors.creamLight, 0.03);
const SLIVER_OPEN = darken(colors.creamLight, 0.07);

function LinkTile({
  link,
  onClick,
}: {
  link: ExternalLink;
  onClick?: () => void;
}): ReactNode {
  const Icon = link.icon;
  return (
    <Box
      component="a"
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      title={link.label}
      aria-label={link.label}
      onClick={onClick}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.5,
        pt: 1,
        pb: 0.75,
        px: 0.25,
        minWidth: 0,
        borderRadius: '10px',
        bgcolor: TILE_BG,
        color: 'text.primary',
        textDecoration: 'none',
        '&:hover': { bgcolor: TILE_HOVER },
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: 'secondary.main',
          outlineOffset: 1,
        },
      }}
    >
      <Box
        aria-hidden="true"
        sx={{
          width: 30,
          height: 30,
          borderRadius: '8px',
          bgcolor: link.color,
          color: 'common.white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon sx={{ fontSize: 18 }} />
      </Box>
      <Typography
        component="span"
        noWrap
        sx={{
          fontFamily: fonts.button,
          fontSize: 11,
          lineHeight: 1.3,
          maxWidth: '100%',
        }}
      >
        {link.label}
      </Typography>
    </Box>
  );
}

/**
 * External services at the top of the sidebar: the pinned few as tiles,
 * then a narrow sliver that opens the rest in a panel beside the sidebar
 * (over the page, not expanding the sidebar). The Popover handles closing
 * on outside click / Esc and returns focus to the sliver.
 */
export function PinnedLinks({ links }: PinnedLinksProps): ReactNode {
  const { pinned, more } = splitPinnedLinks(links);
  const sliverRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const headingId = useId();

  if (pinned.length === 0 && more.length === 0) return null;

  const moreLabel = `${more.length} more ${more.length === 1 ? 'link' : 'links'}`;

  return (
    <>
      <Box
        role="group"
        aria-label="Pinned links"
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr)) 18px',
          gap: '6px',
          px: 1.25,
          pt: 1.5,
          pb: 0.5,
        }}
      >
        {pinned.map((link) => (
          <LinkTile key={link.href} link={link} />
        ))}
        {more.length > 0 && (
          <ButtonBase
            ref={sliverRef}
            aria-label={moreLabel}
            title={moreLabel}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((o) => !o)}
            sx={{
              gridColumn: 4,
              borderRadius: '8px',
              bgcolor: open ? SLIVER_OPEN : TILE_BG,
              color: 'text.primary',
              '&:hover': { bgcolor: open ? SLIVER_OPEN : TILE_HOVER },
              '&.Mui-focusVisible': {
                outline: '2px solid',
                outlineColor: 'secondary.main',
                outlineOffset: 1,
              },
            }}
          >
            <ChevronRightIcon sx={{ fontSize: 16 }} />
          </ButtonBase>
        )}
      </Box>

      {more.length > 0 && (
        <Popover
          open={open}
          anchorEl={sliverRef.current}
          onClose={() => setOpen(false)}
          keepMounted
          // Top-aligned with the row, clearing the sidebar's own padding.
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          slotProps={{
            paper: {
              id: panelId,
              role: 'dialog',
              'aria-labelledby': headingId,
              sx: {
                ml: 2,
                width: 316,
                p: 1.75,
                borderRadius: '12px',
                bgcolor: 'background.paper',
              },
            },
          }}
        >
          <Typography
            id={headingId}
            component="h2"
            sx={{
              fontFamily: fonts.button,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'text.secondary',
              px: 0.5,
              pb: 1.25,
            }}
          >
            More links
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: '6px',
            }}
          >
            {more.map((link) => (
              <LinkTile
                key={link.href}
                link={link}
                onClick={() => setOpen(false)}
              />
            ))}
          </Box>
        </Popover>
      )}
    </>
  );
}
