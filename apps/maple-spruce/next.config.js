//@ts-check

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { composePlugins, withNx } = require('@nx/next');

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
};

const plugins = [
  // Add more Next.js plugins to this list if needed.
  withNx,
];

module.exports = composePlugins(...plugins)(nextConfig);
