/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  webpack: (config, { isServer, webpack }) => {
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

    // Ignore problematic files from thread-stream (used by WalletConnect)
    config.plugins.push(
      new webpack.IgnorePlugin({
        checkResource(resource, context) {
          // Ignore test files, docs, and non-JS files from thread-stream
          if (context.includes('thread-stream')) {
            const ext = resource.split('.').pop();
            const ignored = ['md', 'txt', 'zip', 'yml', 'yaml', 'sh', 'test', 'spec', 'ts'];
            if (ignored.includes(ext) || resource.includes('test') || resource.includes('README') || resource.includes('LICENSE')) {
              return true;
            }
          }
          return false;
        },
      })
    );

    return config;
  },
}

export default nextConfig
