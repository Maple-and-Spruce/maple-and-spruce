import nx from '@nx/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import sonarjs from 'eslint-plugin-sonarjs';

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
