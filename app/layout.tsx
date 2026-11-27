import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { THEME_COOKIE } from '@/lib/auth/config';
import { readSessionToken } from '@/lib/auth/session';
import { resolveSession } from '@/lib/db/repo';
import { TopNav } from '@/components/shell/TopNav';
import { SiteFooter } from '@/components/shell/SiteFooter';
import { ToastProvider } from '@/components/ui/Toast';

export const metadata: Metadata = {
  title: {
    default: 'Northev Spark — studio de circuits & équivalents Thévenin / Norton',
    template: '%s · Northev Spark',
  },
  description:
    'Construisez un montage électrique sur grille, calculez son équivalent de Thévenin ou de Norton, travaillez à plusieurs en multiwork et explorez les agents IA.',
  applicationName: 'Northev Spark',
  keywords: [
    'Thévenin',
    'Norton',
    'circuit électrique',
    'équivalent',
    'simulateur',
    'multiwork',
    'électrotechnique',
  ],
  authors: [{ name: 'Northev Spark' }],
  openGraph: {
    title: 'Northev Spark',
    description:
      'Studio de montages expérimentaux et de calculs d’équivalents Thévenin / Norton, en collaboration temps réel.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#060b14',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const theme = store.get(THEME_COOKIE)?.value ?? 'nuit';
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;

  return (
    <html lang="fr" data-theme={theme} suppressHydrationWarning>
      <body className="min-h-screen">
        <ToastProvider>
          <div className="flex min-h-screen flex-col">
            <TopNav user={user} />
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
