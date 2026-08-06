import { createVanillaExtractPlugin } from "@vanilla-extract/next-plugin";

const withVanillaExtract = createVanillaExtractPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
  agentRules: false,
  // PostHog's API paths use trailing slashes (/e/), which the default
  // trailing-slash redirect would strip before the rewrite matches.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        source: "/relay-cq/static/:path*",
        destination: "https://eu-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/relay-cq/array/:path*",
        destination: "https://eu-assets.i.posthog.com/array/:path*",
      },
      {
        source: "/relay-cq/:path*",
        destination: "https://eu.i.posthog.com/:path*",
      },
    ];
  },
  experimental: {
    optimizePackageImports: ["@/components/ui", "@/lib/theme"],
  },
  webpack: (config, { isServer, webpack }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      rrule: "rrule/dist/es5/rrule.js",
    };
    if (!isServer) {
      // The Anthropic SDK's credential-chain module lazily imports node:fs /
      // node:path to read `ant auth` profiles from disk. The BYOK browser
      // client always passes an explicit apiKey, so that path never runs —
      // but webpack can't parse node: scheme imports in client bundles.
      // Strip the scheme, then stub the bare built-ins to empty modules.
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = resource.request.replace(/^node:/, "");
        }),
      );
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
      };
    }
    return config;
  },
};

export default withVanillaExtract(nextConfig);
