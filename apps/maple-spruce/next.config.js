//@ts-check

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { composePlugins, withNx } = require('@nx/next');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');

/**
 * @type {import('@nx/next/plugins/with-nx').WithNxOptions}
 **/
// Firebase Functions base URL
const FUNCTIONS_BASE_URL = process.env.FUNCTIONS_BASE_URL || 'https://us-east4-maple-and-spruce.cloudfunctions.net';

const nextConfig = {
  nx: {
    svgr: false,
  },
  // Required for Firebase App Hosting
  output: 'standalone',
  // Skip type checking during Next.js build - Nx workspace path aliases don't resolve
  // properly in Next.js's internal tsc. Type checking runs via `nx run maple-spruce:typecheck`
  // and in CI via the build-check workflow.
  typescript: {
    ignoreBuildErrors: true,
  },
  // Configure image optimization for external domains
  images: {
    remotePatterns: [
      // Square CDN - product images are stored in Square's catalog
      {
        protocol: 'https',
        hostname: '*.squarecdn.com',
      },
      {
        protocol: 'https',
        hostname: 'square-catalog-sandbox.s3.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 'square-catalog.s3.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 'items-images-production.s3.us-west-2.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 'items-images-sandbox.s3.us-west-2.amazonaws.com',
      },
      // Firebase Storage - artist images
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
    ],
  },
  // Rewrite /api/* to Firebase Functions
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${FUNCTIONS_BASE_URL}/:path*`,
      },
    ];
  },
  // Transpile workspace packages
  transpilePackages: [
    '@maple/ts/domain',
    '@maple/ts/validation',
    '@maple/ts/firebase/firebase-config',
    '@maple/ts/firebase/api-types',
    '@maple/firebase/database',
    '@maple/firebase/functions',
    '@maple/react/instructors',
    '@maple/react/classes',
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
      '@maple/react/instructors': path.resolve(__dirname, '../../libs/react/instructors/src/index.ts'),
      '@maple/react/classes': path.resolve(__dirname, '../../libs/react/classes/src/index.ts'),
    };
    return config;
  },
};

const plugins = [
  // Add more Next.js plugins to this list if needed.
  withNx,
];

module.exports = composePlugins(...plugins)(nextConfig);
