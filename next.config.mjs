/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Paquets laissés hors du bundle serveur : ils utilisent des `require`
  // dynamiques que le bundler ne peut pas suivre (Fastify) ou sont natifs.
  serverExternalPackages: ['@supabase/supabase-js', 'fastify', '@fastify/cors', '@fastify/websocket'],
  // aperçus de développement servis sous un domaine différent du sandbox
  allowedDevOrigins: ['*.e2b.app', '*.e2b.dev', 'localhost', '127.0.0.1'],
  eslint: { ignoreDuringBuilds: true },
  // Pas de `rewrites` : la passerelle est `app/api/[...path]/route.ts`, qui
  // relaie vers `API_URL` quand il est défini (backend Node local) et sert
  // l'API embarquée sinon (Vercel).
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
