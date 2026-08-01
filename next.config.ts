import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: process.cwd(),
  },
  typescript: {
    tsconfigPath: isProduction ? "tsconfig.build.json" : "tsconfig.json",
    // `pnpm build` runs the native TypeScript checker first. Avoid running
    // Next.js's slower JavaScript-based checker over the same graph again.
    ignoreBuildErrors: true,
  },
  experimental: {
    // TypeScript 7 removed the compiler API Next's legacy checker imports.
    // Use the supported CLI integration (the build script also runs tsc explicitly).
    useTypeScriptCli: true,
    // Persistent Turbopack cache across production builds — the single biggest
    // win on rebuilds.
    turbopackFileSystemCacheForBuild: true,
    // Only optimize packages that are actually used
    optimizePackageImports: [
      'lucide-react',
      '@dnd-kit/core',
      '@dnd-kit/modifiers',
      '@dnd-kit/sortable',
      '@dnd-kit/utilities',
      'recharts'
    ],
  },
  async headers() {
    return [
      {
        // Block all search engines from indexing any route.
        source: '/:path*',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow, noarchive, nosnippet, noimageindex',
          },
        ],
      },
    ]
  },
  // Production optimizations
  productionBrowserSourceMaps: false, // Disable source maps in production for smaller bundles
  poweredByHeader: false, // Remove X-Powered-By header for security
  // Optimize output
  output: 'standalone', // Creates optimized standalone build
  
  // Build caching for faster subsequent builds
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
};

export default nextConfig;
