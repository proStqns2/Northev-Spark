/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['@supabase/supabase-js'],
  // aperçus de développement servis sous un domaine différent du sandbox
  allowedDevOrigins: ['*.e2b.app', '*.e2b.dev', 'localhost', '127.0.0.1'],
  eslint: { ignoreDuringBuilds: true },
  // Le backend est un serveur Node autonome (Fastify, voir server/api).
  // Next.js n'est qu'un frontend : il relaie /api/* vers ce backend.
  // En production, API_URL pointe sur le backend déployé ; en local, :4100.
  async rewrites() {
    const api = process.env.API_URL || 'http://localhost:4100';
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  },
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
