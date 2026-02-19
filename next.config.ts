import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build output directory
  distDir: 'dist',

  // Server-Sent Events support with proper headers
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/json',
          },
          {
            key: 'Cache-Control',
            value: 'no-store, must-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
        ],
      },
      {
        source: '/api/engine/ws',
        headers: [
          {
            key: 'Content-Type',
            value: 'text/event-stream',
          },
          {
            key: 'Cache-Control',
            value: 'no-cache',
          },
          {
            key: 'Connection',
            value: 'keep-alive',
          },
          {
            key: 'Transfer-Encoding',
            value: 'chunked',
          },
        ],
      },
    ];
  },

  // CORS headers for API routes
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/api/:path*',
          destination: '/api/:path*',
        },
      ],
    };
  },

  // Webpack config for server components
  webpack: (config, { isServer }) => {
    if (isServer) {
      // External packages that should not be bundled on server
      config.externals = [
        ...config.externals,
        'pino',
        'pino-pretty',
      ];
    }

    return config;
  },

  // Environment variables to expose to browser
  env: {
    NEXT_PUBLIC_CONVEX_URL: process.env.CONVEX_URL,
  },

  // Experimental features
  experimental: {
    // Enable server components (default in Next.js 13+)
    esmExternals: true,
  },

  // Compression
  compress: true,

  // PoweredByHeader disabled for security
  poweredByHeader: false,

  // Production source maps (can be disabled for smaller bundle)
  productionBrowserSourceMaps: false,

  // Strict mode in development
  reactStrictMode: true,
};

export default nextConfig;
