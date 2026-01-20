/**
 * Signals Library - Core Re-exports
 *
 * Re-exports from @preact/signals-react with project-specific additions.
 *
 * @see https://preactjs.com/guide/v10/signals/
 * @see docs/SIGNALS-MIGRATION-GUIDE.md
 */

// Core primitives
export {
  signal,
  computed,
  effect,
  batch,
  untracked,
  type Signal,
  type ReadonlySignal,
} from '@preact/signals-react';

// React hooks for component-scoped signals
export {
  useSignal,
  useComputed,
  useSignalEffect,
} from '@preact/signals-react';

// Runtime hook (use when Babel transform is not configured)
export { useSignals } from '@preact/signals-react/runtime';
