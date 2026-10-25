//@ts-check

// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs');

/**
 * The workspace library aliases from tsconfig.base.json. Nx 23's `withNx`
 * added the app's workspace dependencies to `transpilePackages`; Nx 24 removed
 * it, so this reads the aliases from the tsconfig paths instead, leaving out
 * the per-function libraries and test-only servers the app never imports.
 * Listing an alias the app does not import has no effect.
 */
function workspaceAliases() {
  const base = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../tsconfig.base.json'), 'utf8')
  );
  return Object.keys(base.compilerOptions?.paths ?? {}).filter(
    (alias) =>
      alias.startsWith('@maple/') &&
      !alias.startsWith('@maple/firebase/maple-functions/') &&
      !/(test-mock-server|integration-test-utils)$/.test(alias)
  );
}

/** @type {import('next').NextConfig} */
// Firebase Functions base URL
const FUNCTIONS_BASE_URL = process.env.FUNCTIONS_BASE_URL || 'https://us-east4-maple-and-spruce.cloudfunctions.net';

const nextConfig = {
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
  transpilePackages: workspaceAliases(),
  webpack: (config) => {
    // Let `.js` import specifiers resolve to TypeScript sources (the Etsy lib
    // writes ESM-style `./x.js` imports). Carried over from Nx 23's `withNx`.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias || {}),
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
      '.jsx': ['.tsx', '.jsx'],
    };
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

module.exports = nextConfig;
