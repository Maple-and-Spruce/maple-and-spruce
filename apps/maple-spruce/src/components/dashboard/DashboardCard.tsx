'use client';

import type { ReactNode } from 'react';
import NextLink from 'next/link';
import { Alert, Box, Link, Skeleton, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  borders,
  colors,
  fonts,
  radii,
  surfaces,
  text,
} from '@maple/react/theme';

/** Every dashboard card is this tall, so the grid's rows line up. */
export const DASHBOARD_CARD_HEIGHT = 430;

/** Dashboard-only accents with no theme token. */
export const dashboardColors = {
  /** The lesson rail on the Today timeline. */
  lessonRail: '#B08A5B',
  /** The class rail on the Today timeline. */
  classRail: colors.sageGreen,
  /** The NOW line, and "Charge failed". */
  clay: '#A4502F',
  /** Under-filled classes. */
  amber: '#B7791F',
  /** Inbox: the ink on a failed-money eyebrow. */
  clayInk: '#7A3A20',
  /** Inbox: an unsigned agreement's dot and ink. */
  ochre: '#C9893F',
  ochreInk: '#6B4A12',
  /** Inbox: the dot on a row with nothing pressing about it. */
  quietDot: '#A9AA9C',
  /** "Paid". */
  green: '#3F7A4A',
} as const;

const PAD_X = 2.5;

export interface DashboardCardProps {
  /** Heading, also the section's accessible name. */
  title: string;
  /** The small link on the right of the header. */
  link?: { label: string; href: string };
  /** Plain text on the right of the header, when there is no link ("3 to do"). */
  aside?: string;
  /** Footer row content; omitted means no footer. */
  footer?: ReactNode;
  /** Grid columns to span (PR 3's Sales card spans 2). */
  span?: 1 | 2;
  children: ReactNode;
}

/**
 * The fixed-height card every dashboard tile sits in (#235): serif heading
 * with a small link, a body that clips rather than grows, and a footer row.
 */
export function DashboardCard({
  title,
  link,
  aside,
  footer,
  span = 1,
  children,
}: DashboardCardProps) {
  const headingId = `dashboard-card-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <Box
      component="section"
      aria-labelledby={headingId}
      sx={{
        height: DASHBOARD_CARD_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: surfaces.paper,
        borderRadius: `${radii.lg}px`,
        border: `1px solid ${borders.subtle}`,
        overflow: 'hidden',
        minWidth: 0,
        gridColumn: span === 2 ? 'span 2' : undefined,
        '@container (max-width: 580px)': { gridColumn: 'auto' },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 2,
          px: PAD_X,
          pt: 2,
          pb: 1.25,
        }}
      >
        <Typography
          id={headingId}
          component="h2"
          noWrap
          sx={{
            fontFamily: fonts.heading,
            fontSize: 22,
            lineHeight: 1.2,
            color: text.primary,
          }}
        >
          {title}
        </Typography>
        {link && (
          <Link
            component={NextLink}
            href={link.href}
            underline="hover"
            sx={{
              fontFamily: fonts.button,
              fontSize: 13,
              fontWeight: 500,
              color: colors.sageGreenDark,
              flexShrink: 0,
            }}
          >
            {link.label}
          </Link>
        )}
        {!link && aside && (
          <Typography
            component="span"
            color="textSecondary"
            sx={{
              fontFamily: fonts.button,
              fontSize: 13,
              flexShrink: 0,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {aside}
          </Typography>
        )}
      </Box>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </Box>
      {footer && (
        <Box
          sx={{
            borderTop: `1px solid ${borders.subtle}`,
            px: PAD_X,
            py: 1.25,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            fontFamily: fonts.button,
            fontSize: 12.5,
            color: text.secondary,
            minHeight: 44,
          }}
        >
          {footer}
        </Box>
      )}
    </Box>
  );
}

/** A clickable list row: 1px separator, hover tint. */
export function DashboardRow({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Box
      component={NextLink}
      href={href}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: PAD_X,
        py: 1,
        color: 'inherit',
        textDecoration: 'none',
        borderTop: `1px solid ${borders.subtle}`,
        '&:hover': { bgcolor: surfaces.hover },
        '&:focus-visible': {
          outline: `2px solid ${borders.focus}`,
          outlineOffset: -2,
        },
      }}
    >
      {children}
    </Box>
  );
}

/** Loading body: rows shaped like the content, marked busy. */
export function DashboardCardSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Box
      aria-busy="true"
      aria-label="Loading"
      sx={{ px: PAD_X, display: 'flex', flexDirection: 'column', gap: 1.5, pt: 1 }}
    >
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} variant="rounded" height={44} />
      ))}
    </Box>
  );
}

export function DashboardCardError({ message }: { message: string }) {
  return (
    <Box sx={{ px: PAD_X, pt: 1 }}>
      <Alert severity="error">{message}</Alert>
    </Box>
  );
}

export function DashboardCardEmpty({ message }: { message: string }) {
  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: PAD_X,
      }}
    >
      <Typography color="textSecondary">{message}</Typography>
    </Box>
  );
}

export type DashboardChipTone = 'paid' | 'failed' | 'pending' | 'neutral' | 'class';

const CHIP_TONES: Record<DashboardChipTone, { fg: string; bg: string }> = {
  paid: { fg: dashboardColors.green, bg: alpha(dashboardColors.green, 0.12) },
  failed: { fg: dashboardColors.clay, bg: alpha(dashboardColors.clay, 0.12) },
  pending: { fg: colors.brownLight, bg: alpha(dashboardColors.lessonRail, 0.16) },
  neutral: { fg: text.secondary, bg: surfaces.paperMuted },
  class: { fg: colors.sageGreenDark, bg: alpha(colors.sageGreen, 0.14) },
};

/** A small status pill (Archivo, tinted). */
export function DashboardChip({
  label,
  tone,
}: {
  label: string;
  tone: DashboardChipTone;
}) {
  const { fg, bg } = CHIP_TONES[tone];
  return (
    <Box
      component="span"
      sx={{
        flexShrink: 0,
        fontFamily: fonts.button,
        fontSize: 11.5,
        fontWeight: 600,
        lineHeight: 1,
        px: 1,
        py: 0.625,
        borderRadius: `${radii.full}px`,
        color: fg,
        bgcolor: bg,
        whiteSpace: 'nowrap',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {label}
    </Box>
  );
}

/** Single-line text that ellipsizes instead of wrapping. */
export const ellipsis = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
} as const;
