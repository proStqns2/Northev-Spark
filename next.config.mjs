/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['@supabase/supabase-js'],
  // aperçus de développement servis sous un domaine différent du sandbox
  allowedDevOrigins: ['*.e2b.app', '*.e2b.dev', 'localhost', '127.0.0.1'],
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        source: '/api/rooms/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
          { key: 'X-Accel-Buffering', value: 'no' },
        ],
      },
    ];
  },
};

export default nextConfig;
