'use client';

/**
 * The ⋮ menu beside a lesson, the same on every tab of the student page.
 *
 * What it offers comes from `lessonActions`, so a lesson can be moved, pushed
 * back, cancelled or deleted wherever Katie finds it.
 */
import { useState } from 'react';
import { IconButton, Menu, MenuItem } from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import type { Lesson } from '@maple/ts/domain';
import {
  lessonActions,
  type LessonActionContext,
  type LessonActionHandlers,
} from './lesson-actions';

export interface LessonActionsMenuProps {
  lesson: Lesson;
  context: LessonActionContext;
  handlers: LessonActionHandlers;
  /** Names the lesson for screen readers: "More for Tue, Dec 1, 1:30 PM". */
  when: string;
  disabled?: boolean;
}

export function LessonActionsMenu({
  lesson,
  context,
  handlers,
  when,
  disabled,
}: LessonActionsMenuProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const items = lessonActions(lesson, context, handlers);
  if (items.length === 0) return null;

  return (
    <>
      <IconButton
        size="small"
        disabled={disabled}
        aria-label={`More for ${when}`}
        aria-haspopup="menu"
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => setAnchor(null)}
      >
        {items.map((item) => (
          <MenuItem
            key={item.text}
            onClick={() => {
              setAnchor(null);
              item.run();
            }}
            sx={item.danger ? { color: 'error.main' } : undefined}
          >
            {item.text}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
