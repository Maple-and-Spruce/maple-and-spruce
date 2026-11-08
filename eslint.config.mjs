import nx from '@nx/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import sonarjs from 'eslint-plugin-sonarjs';

// MUI 9: a component's `color` prop takes a name ('textSecondary',
// 'error'), not a palette path. 'text.secondary' / 'error.main' match
// nothing and render in the default colour, with no type error. Paths
// belong in sx: sx={{ color: 'grey.600' }}.
const MUI_COLOR_PATH = [
  {
    selector:
      "JSXAttribute[name.name='color'] Literal[value=/^[a-zA-Z]+\\.[a-zA-Z0-9]+$/]",
    message:
      "MUI 9 ignores palette paths in the `color` prop. Use a name ('textSecondary', 'error') or move it to sx.",
  },
];

const DAY_AS_24_HOURS_MESSAGE =
  'A calendar day is not always 24 hours (clock changes). Step days with addLocalDays or weeks with addWeeksOnWallClock (@maple/ts/domain). For a true duration, disable this line and say why.';
const DAY_AS_24_HOURS = [
  {
    selector:
      "BinaryExpression[operator='*']:has(> Literal[value=1000]):has(Literal[value=24]):has(Literal[value=60])",
    message: DAY_AS_24_HOURS_MESSAGE,
  },
  {
    selector: "BinaryExpression[operator='*']:has(> Literal[value=24]):has(> Identifier[name=/HOUR/])",
    message: DAY_AS_24_HOURS_MESSAGE,
  },
  {
    selector: 'Literal[value=86400000], Literal[value=604800000]',
    message: DAY_AS_24_HOURS_MESSAGE,
  },
];

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  sonarjs.configs.recommended,
  // The codebase already has `// eslint-disable-next-line react-hooks/*`
  // pragmas sprinkled through it, but the plugin was never actually
  // registered. Register it here so the rules run and the pragmas work
  // as intended. Only the two classic rules the codebase already
  // references are enabled; newer rules (use-memo, purity, etc.) can be
  // opted into in a follow-up.
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    ignores: ['**/dist', '**/out-tsc', '**/vitest.config.*.timestamp*'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          // Nx 23's @nx/js/typescript plugin infers a `build` target on every
          // lib with a tsconfig.lib.json, which flips them all to "buildable"
          // and trips this constraint. This repo never consumes libs via a
          // built dist — libs have no package.json and are bundled from source
          // by esbuild (functions) / Next (app) — so the buildable-dependency
          // rule is meaningless here. Nx 22 didn't infer these targets, so the
          // rule never fired before. Disabled on the Nx 23 migration.
          enforceBuildableLibDependency: false,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      // Noisy rules downgraded to warn for gradual adoption — we do not
      // want this tooling PR to force a refactor of existing code.
      // Follow-up work can tighten any of these back to 'error'.
      'sonarjs/cognitive-complexity': ['warn', 15],
      'sonarjs/no-duplicate-string': ['warn', { threshold: 5 }],

      // SonarJS rules currently flagging many pre-existing issues in the
      // codebase. Keep them visible as warnings so new code is nudged in
      // the right direction without blocking this tooling PR on a refactor.
      'sonarjs/no-nested-conditional': 'warn',
      'sonarjs/slow-regex': 'warn',
      'sonarjs/todo-tag': 'warn',
      'sonarjs/unused-import': 'warn',
      'sonarjs/no-dead-store': 'warn',
      'sonarjs/no-globals-shadowing': 'warn',
      'sonarjs/use-type-alias': 'warn',
      'sonarjs/no-unused-vars': 'warn',
      'sonarjs/no-hardcoded-passwords': 'warn',
      'sonarjs/no-nested-template-literals': 'warn',
      'sonarjs/pseudo-random': 'warn',
      'sonarjs/no-commented-code': 'warn',
      'sonarjs/no-small-switch': 'warn',
      'sonarjs/public-static-readonly': 'warn',

      // Pre-existing non-SonarJS errors from the nx/typescript presets.
      // These never ran in CI before (no lint step existed), so the
      // codebase has accumulated ~90 violations. Downgrading to warn here
      // so the new lint CI job can start at zero errors; a follow-up pass
      // can tighten these back to error after the cleanup.
      '@typescript-eslint/no-empty-interface': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-empty-function': 'warn',
      '@typescript-eslint/no-inferrable-types': 'warn',
      'no-case-declarations': 'warn',

      // Rules that arrived with the ESLint 10 and eslint-plugin-sonarjs 4.2
      // upgrade (2026-09-29) and flagged ~80 pre-existing spots. Warn for
      // gradual adoption, same as above, so the dependency bump does not
      // carry a refactor. `super-linear-regex` is sonarjs's successor to
      // `slow-regex`, which was already a warning.
      'preserve-caught-error': 'warn',
      'no-useless-assignment': 'warn',
      'sonarjs/super-linear-regex': 'warn',
      'sonarjs/prefer-specific-assertions': 'warn',
      'sonarjs/parameterized-tests': 'warn',
      'sonarjs/no-floating-point-equality': 'warn',
      'sonarjs/no-skipped-tests': 'warn',
      'sonarjs/no-clear-text-protocols': 'warn',
      'sonarjs/assertions-in-tests': 'warn',

      // See MUI_COLOR_PATH above.
      'no-restricted-syntax': ['error', ...MUI_COLOR_PATH],
    },
  },
  {
    // Browser code works in the viewer's local time. There, a day is not
    // always 24 hours: adding 24h to a local midnight landed My Week's Monday
    // on Sunday 11 PM in the Nov 1 2026 fall-back week, and stepping a lesson
    // series by 7 * 24h moved 4:00 PM lessons to 3:00 PM. Step calendar days
    // with addLocalDays / addWeeksOnWallClock from @maple/ts/domain.
    // A real duration ("3 days ago") gets an eslint-disable with the reason.
    files: [
      'libs/react/**/*.{ts,tsx}',
      'apps/maple-spruce/src/**/*.{ts,tsx}',
      'apps/webflow-components/src/**/*.{ts,tsx}',
    ],
    ignores: ['**/*.spec.{ts,tsx}', '**/*.stories.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...MUI_COLOR_PATH, ...DAY_AS_24_HOURS],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Override or add rules here
    rules: {},
  },
];
