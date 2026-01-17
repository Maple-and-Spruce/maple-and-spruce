//@ts-check

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { composePlugins, withNx } = require('@nx/next');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');

/**
 * @type {import('@nx/next/plugins/with-nx').WithNxOptions}
 **/
const nextConfig = {
  nx: {
    svgr: false,
  },
  // Required for Firebase App Hosting
  output: 'standalone',
  // Skip type checking during build - Next.js doesn't resolve Nx workspace paths well
  // Type checking runs separately via `npx tsc --noEmit` or during dev
  typescript: {
    ignoreBuildErrors: true,
  },
  // Transpile workspace packages
  transpilePackages: [
    '@maple/ts/domain',
    '@maple/ts/validation',
    '@maple/ts/firebase/firebase-config',
    '@maple/ts/firebase/api-types',
    '@maple/firebase/database',
    '@maple/firebase/functions',
  ],
  webpack: (config) => {
    // Add aliases for workspace packages
    config.resolve.alias = {
      ...config.resolve.alias,
      '@maple/ts/domain': path.resolve(__dirname, '../../libs/ts/domain/src/index.ts'),
      '@maple/ts/validation': path.resolve(__dirname, '../../libs/ts/validation/src/index.ts'),
      '@maple/ts/firebase/firebase-config': path.resolve(__dirname, '../../libs/ts/firebase/firebase-config/src/index.ts'),
      '@maple/ts/firebase/api-types': path.resolve(__dirname, '../../libs/ts/firebase/api-types/src/index.ts'),
      '@maple/firebase/database': path.resolve(__dirname, '../../libs/firebase/database/src/index.ts'),
      '@maple/firebase/functions': path.resolve(__dirname, '../../libs/firebase/functions/src/index.ts'),
    };
    return config;
  },
};

const plugins = [
  // Add more Next.js plugins to this list if needed.
  withNx,
];

module.exports = composePlugins(...plugins)(nextConfig);
