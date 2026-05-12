/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    experimental: {
        // Required so the better-sqlite3 native binding is copied to .next/standalone
        // and not bundled by webpack.
        serverComponentsExternalPackages: ['better-sqlite3'],
    },
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'i.ytimg.com',
                port: '',
                pathname: '/vi/**',
            },
            {
                protocol: 'https',
                hostname: 'yt3.ggpht.com',
                port: '',
                pathname: '/**',
            },
        ],
    },
};

export default nextConfig;
