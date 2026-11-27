'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Beaker,
  BookOpen,
  Dumbbell,
  FolderKanban,
  Shapes,
  CircuitBoard,
  FlaskConical,
  GraduationCap,
  ListChecks,
  LogOut,
  Menu,
  Sparkles,
  Target,
  User,
  Users,
  X,
  Zap,
  Crown,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import type { SessionUser } from '@/lib/auth/session';

const LINKS = [
  { href: '/academie', label: 'Académie', icon: GraduationCap, badge: 'NEW' },
  { href: '/studio', label: 'Studio', icon: CircuitBoard },
  { href: '/projets', label: 'Projets', icon: FolderKanban },
  { href: '/symboles', label: 'Symboles', icon: Shapes },
  { href: '/bibliotheque', label: 'Bibliothèque', icon: BookOpen },
  { href: '/multiwork', label: 'Multiwork', icon: Users },
  { href: '/labo', label: 'Labo', icon: Beaker },
  { href: '/quiz', label: 'Quiz', icon: ListChecks },
  { href: '/exercices', label: 'Exercices', icon: Dumbbell },
  { href: '/defis', label: 'Défis', icon: Target },
  { href: '/agents', label: 'Agents', icon: Sparkles },
  { href: '/premium', label: 'Premium', icon: Crown, badge: 'IA' },
  { href: '/export', label: 'Export', icon: FlaskConical },
];

export function TopNav({ user }: { user: SessionUser | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b transition duration-300',
        scrolled
          ? 'border-line/70 bg-ink-950/85 backdrop-blur-xl'
          : 'border-transparent bg-ink-950/40 backdrop-blur',
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5" aria-label="Northev Spark — accueil">
          <span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-line/60 bg-[#ececeb] shadow-glow-sm transition group-hover:border-spark-cyan/50">
            {/* monogramme isométrique officiel */}
            <Image
              src="/brand/logo-192.png"
              alt=""
              width={36}
              height={36}
              className="h-[34px] w-[34px] object-contain transition group-hover:scale-[1.06]"
              priority
            />
          </span>
          <span className="hidden flex-col leading-none sm:flex">
            <span className="text-[15px] font-semibold tracking-tight">
              Northev<span className="text-spark-cyan"> Spark</span>
            </span>
            <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-mute">
              équivalents T · N
            </span>
          </span>
        </Link>

        <nav className="ml-4 hidden items-center gap-0.5 lg:flex">
          {LINKS.map((link) => {
            const Icon = link.icon;
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                title={link.label}
                className={cn(
                  'relative flex items-center gap-1.5 rounded-lg px-2 py-2 text-[12.5px] font-medium transition',
                  'xl:gap-2 xl:px-2.5 xl:text-[13px]',
                  active
                    ? 'bg-ink-800/90 text-fg'
                    : 'text-fg-soft hover:bg-ink-850 hover:text-fg',
                )}
              >
                <Icon size={15} className={active ? 'text-spark-cyan' : ''} />
                <span className="hidden xl:inline">{link.label}</span>
                {link.badge ? (
                  <span className="hidden rounded-full border border-spark-violet/40 bg-spark-violet/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-spark-violet 2xl:inline">
                    {link.badge}
                  </span>
                ) : null}
                {active ? (
                  <span className="absolute inset-x-3 -bottom-px h-px bg-gradient-to-r from-transparent via-spark-cyan to-transparent" />
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href={user ? '/studio' : '/compte?mode=inscription'}
            className="btn btn-primary btn-sm hidden sm:inline-flex"
          >
            <Zap size={14} />
            {user ? 'Ouvrir le studio' : 'Créer un compte'}
          </Link>

          {user ? (
            <div className="flex items-center gap-2">
              <Link
                href="/compte"
                className="flex items-center gap-2 rounded-xl border border-line/60 bg-ink-900/80 px-1.5 py-1.5 pr-3 transition hover:border-spark-cyan/50 sm:px-2"
              >
                <Avatar name={user.name} avatar={user.avatar} size={26} />
                <span className="hidden max-w-[110px] truncate text-xs font-medium sm:block">
                  {user.name}
                </span>
              </Link>
              <button
                type="button"
                onClick={logout}
                className="btn btn-ghost btn-sm px-2"
                title="Se déconnecter"
                aria-label="Se déconnecter"
              >
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <Link href="/compte" className="btn btn-ghost btn-sm">
              <User size={15} />
              <span className="hidden sm:inline">Connexion</span>
            </Link>
          )}

          <button
            type="button"
            className="btn btn-ghost btn-sm px-2 lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Menu"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-line/60 bg-ink-950/95 px-4 py-3 backdrop-blur-xl lg:hidden">
          <div className="grid gap-1">
            {LINKS.map((link) => {
              const Icon = link.icon;
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm',
                    active ? 'bg-ink-800 text-fg' : 'text-fg-soft hover:bg-ink-850',
                  )}
                >
                  <Icon size={16} className={active ? 'text-spark-cyan' : ''} />
                  {link.label}
                </Link>
              );
            })}
            <Link
              href="/compte"
              className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-fg-soft hover:bg-ink-850"
            >
              <User size={16} />
              Mon compte
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
