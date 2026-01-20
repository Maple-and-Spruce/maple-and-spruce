/**
 * @maple/react/signals
 *
 * Signals-based state management library for Maple & Spruce.
 * Built on @preact/signals-react.
 *
 * @see docs/SIGNALS-ADOPTION-PLAN.md
 * @see docs/SIGNALS-MIGRATION-GUIDE.md
 */

// Core signals primitives
export {
  signal,
  computed,
  effect,
  batch,
  untracked,
  useSignal,
  useComputed,
  useSignalEffect,
  useSignals,
  type Signal,
  type ReadonlySignal,
} from './lib/signals';

// Form utilities
export {
  useFormSignals,
  createFieldHandler,
  createNumericHandler,
  createIntegerHandler,
  type FormSignalsOptions,
  type FormSignalsResult,
} from './lib/form-signals';

// RequestState utilities
export {
  useRequestState,
  deriveRequestStateSignals,
  type RequestStateSignals,
} from './lib/request-state-signals';
