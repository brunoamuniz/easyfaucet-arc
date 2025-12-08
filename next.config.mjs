/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Disable Turbopack to avoid issues with dynamic imports in wagmi connectors
  experimental: {
    turbo: false,
  },
  webpack: (config, { isServer }) => {
    // Ignore optional dependencies that may not be installed
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        '@safe-global/safe-apps-provider': false,
        '@safe-global/safe-apps-sdk': false,
        '@walletconnect/ethereum-provider': false,
        '@base-org/account': false,
        '@metamask/sdk': false,
      };
    }
    return config;
  },
}

export default nextConfig
