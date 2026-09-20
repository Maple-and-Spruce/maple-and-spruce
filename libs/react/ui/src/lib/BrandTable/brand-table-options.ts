/**
 * Shared Material React Table setup (#88).
 *
 * Every MRT table spreads these options first, then adds its own columns,
 * data and initial state:
 *
 *   const table = useMaterialReactTable({
 *     ...brandTableOptions<Row>(),
 *     columns,
 *     data,
 *     initialState: { sorting: [...] },
 *   });
 *
 * It exists because two MRT defaults are wrong for this theme, and neither
 * shows up in a passing test or a clean build — only in a screenshot of a
 * table scrolled hard right, the one state where pinning means anything. Both
 * were found on /students (#87) and neither should be found again.
 */
import type { MRT_RowData, MRT_TableOptions } from 'material-react-table';
import { borders, radii, shadows, surfaces } from '@maple/react/theme';

/** Rows per page unless a table says otherwise. */
export const BRAND_TABLE_PAGE_SIZE = 25;

export function brandTableOptions<TData extends MRT_RowData>(): Partial<
  MRT_TableOptions<TData>
> {
  return {
    // MRT paints pinned cells with a `:before` pseudo-element coloured from
    // `mrtTheme.baseBackgroundColor`, which defaults to the MUI theme's
    // background — the brand cream. The scrolling cells take the explicit
    // white below, so the two halves of the table did not match and the
    // pinned columns read as a rendering fault rather than a design choice.
    //
    // This is the supported lever; overriding the pseudo-element by hand
    // would fight the library on every upgrade.
    mrtTheme: { baseBackgroundColor: surfaces.paper },
    // A header click flips between ascending and descending, never to
    // "unsorted". MRT sorts numeric columns descending first, so on a table
    // that opens ascending by date, one click used to REMOVE the sort and drop
    // the rows back into load order — a scrambled table that looks sorted.
    // Caught by a play story, not by eye.
    enableSortingRemoval: false,
    enableColumnFilters: false,
    enableGlobalFilter: false,
    enableDensityToggle: false,
    enableFullScreenToggle: false,
    enableHiding: false,
    muiTablePaperProps: {
      elevation: 0,
      sx: {
        backgroundColor: surfaces.paper,
        borderRadius: `${radii.lg}px`,
        border: `1px solid ${borders.default}`,
        boxShadow: shadows.sm,
        overflow: 'hidden',
      },
    },
    // Pinned cells sit ON TOP of the scrolling ones, and MRT ships them at
    // `opacity: 0.97` — enough for the columns underneath to read straight
    // through as ghost text. Forced opaque here.
    //
    // Only found by looking at it scrolled: every test passed, and the
    // computed background was already the right white.
    muiTableHeadCellProps: {
      sx: {
        backgroundColor: surfaces.tableHeader,
        fontWeight: 600,
        '&[data-pinned="true"]': { opacity: 1 },
      },
    },
    muiTableBodyCellProps: {
      sx: {
        backgroundColor: surfaces.paper,
        borderColor: borders.subtle,
        '&[data-pinned="true"]': { opacity: 1 },
      },
    },
  };
}
